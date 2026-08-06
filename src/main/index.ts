import { app, shell, BrowserWindow } from 'electron'
import { join, isAbsolute, resolve } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { existsSync, readdirSync, statSync } from 'fs'
import { getDb, kvGet, kvSet } from './db'
import { registerIpcHandlers } from './ipc'
import { importSshConfig } from './sshconfig'
import { importKnownHosts } from './knownhosts'
import { recategorizeAll, dedupHostsByEndpoint } from './hosts'
import { addProject, refreshAllProjectVcs } from './projects'
import { initAi, reinitAi } from './ai'
import { getProjectsRoot } from './settings'
import { closeAllPtys } from './pty'

let mainWindowRef: BrowserWindow | null = null
let rendererReady = false
const pendingOpenFiles: string[] = []

function collectFilePathsFromArgv(argv: readonly string[]): string[] {
  // argv[0] is the exe; in packaged builds, further entries can be flags
  // (starting with '-') or file paths. Only keep entries that resolve to an
  // existing regular file.
  const out: string[] = []
  for (let i = 1; i < argv.length; i++) {
    const a = argv[i]
    if (!a || a.startsWith('-')) continue
    if (a === '.') continue
    try {
      const abs = isAbsolute(a) ? a : resolve(process.cwd(), a)
      const st = statSync(abs)
      if (st.isFile()) out.push(abs)
    } catch {
      /* ignore non-file argv */
    }
  }
  return out
}

function queueOpenFiles(paths: string[]): void {
  for (const p of paths) if (p && !pendingOpenFiles.includes(p)) pendingOpenFiles.push(p)
  flushOpenFiles()
}

function flushOpenFiles(): void {
  if (!rendererReady) return
  if (!mainWindowRef || mainWindowRef.isDestroyed()) return
  if (pendingOpenFiles.length === 0) return
  const paths = pendingOpenFiles.splice(0, pendingOpenFiles.length)
  mainWindowRef.webContents.send('files:open', { paths })
}

function createWindow(): void {
  const boundsRaw = kvGet('window.bounds')
  const bounds = boundsRaw
    ? (JSON.parse(boundsRaw) as { x?: number; y?: number; width: number; height: number })
    : null
  const mainWindow = new BrowserWindow({
    width: bounds?.width ?? 1400,
    height: bounds?.height ?? 900,
    x: bounds?.x,
    y: bounds?.y,
    show: false,
    // macOS: hide the titlebar so the in-app Titlebar component owns the chrome,
    // with traffic lights overlayed. Windows/Linux: use the system frame so the
    // user gets native min/max/close in the top-right.
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    backgroundColor: '#0a0c10',
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true
    }
  })

  mainWindow.on('ready-to-show', () => mainWindow.show())
  mainWindow.webContents.on('did-finish-load', () => {
    rendererReady = true
    flushOpenFiles()
  })
  mainWindow.on('closed', () => {
    if (mainWindowRef === mainWindow) {
      mainWindowRef = null
      rendererReady = false
    }
  })
  mainWindowRef = mainWindow

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  const saveBounds = (): void => {
    const b = mainWindow.getBounds()
    kvSet('window.bounds', JSON.stringify(b))
  }
  mainWindow.on('resize', saveBounds)
  mainWindow.on('move', saveBounds)
  mainWindow.on('close', saveBounds)

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

async function firstLaunchImport(): Promise<void> {
  if (kvGet('imports.firstLaunchDone') === '1') return
  try {
    const ssh = await importSshConfig()
    const known = await importKnownHosts()
    console.log(
      `[first-launch] imported ${ssh.added} from ssh_config, ${known.added} from known_hosts`
    )
  } catch (err) {
    console.error('[first-launch] import failed', err)
  } finally {
    kvSet('imports.firstLaunchDone', '1')
  }
}

function seedProjectsOnce(): void {
  if (kvGet('projects.seededV1') === '1') return
  const root = getProjectsRoot()
  if (!existsSync(root)) {
    kvSet('projects.seededV1', '1')
    return
  }
  let count = 0
  try {
    for (const name of readdirSync(root)) {
      if (name.startsWith('.')) continue
      const full = join(root, name)
      try {
        if (!statSync(full).isDirectory()) continue
      } catch {
        continue
      }
      try {
        addProject(full)
        count++
      } catch {
        /* duplicate path or other — ignore */
      }
    }
  } catch (err) {
    console.error('[seed projects] failed', err)
  }
  kvSet('projects.seededV1', '1')
  if (count) console.log(`[seed projects] added ${count} from ${root}`)
}

function backfillCategoriesOnce(): void {
  if (kvGet('hosts.categorizedV2') === '1') return
  const n = recategorizeAll()
  kvSet('hosts.categorizedV2', '1')
  if (n) console.log(`[backfill] categorized ${n} hosts`)
}

function dedupHostsOnce(): void {
  if (kvGet('hosts.dedupedV1') === '1') return
  const n = dedupHostsByEndpoint()
  kvSet('hosts.dedupedV1', '1')
  if (n) console.log(`[dedup] merged ${n} duplicate hosts`)
}

// macOS delivers Finder double-clicks / drag-onto-dock via 'open-file', which
// can fire BEFORE the BrowserWindow exists. Register early so we don't miss
// the first delivery.
app.on('open-file', (event, path) => {
  event.preventDefault()
  queueOpenFiles([path])
})

// Single-instance: forward any subsequent-launch argv (e.g. right-click "Open
// with Saterm" while the app is already running on Windows/Linux) to the
// primary instance and quit the secondary.
const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', (_e, argv) => {
    queueOpenFiles(collectFilePathsFromArgv(argv))
    if (mainWindowRef) {
      if (mainWindowRef.isMinimized()) mainWindowRef.restore()
      mainWindowRef.focus()
    }
  })
}

app.whenReady().then(async () => {
  // Seed with any files passed on the initial launch's argv.
  queueOpenFiles(collectFilePathsFromArgv(process.argv))
  electronApp.setAppUserModelId('com.saterm.app')
  // Native "About Saterm" dialog (macOS: app menu; Linux: some DEs).
  // Windows uses the LegalCopyright field from electron-builder.yml instead.
  app.setAboutPanelOptions({
    applicationName: 'Saterm',
    applicationVersion: app.getVersion(),
    version: app.getVersion(),
    copyright: 'Copyright (c) 2026 Zion Maor. All rights reserved.',
    credits: 'Created by Zion Maor · zion.maori@gmail.com',
    authors: ['Zion Maor'],
    website: 'https://github.com/zionmaori/Termion'
  })
  getDb()
  registerIpcHandlers()

  // Grandfather existing installs: anyone who already went through the silent
  // first-launch import in a prior release is considered onboarded, so they
  // don't see the wizard on upgrade.
  if (kvGet('imports.firstLaunchDone') === '1' && kvGet('onboarding.completedV1') !== '1') {
    kvSet('onboarding.completedV1', '1')
  }

  // Silent seeders — only run for grandfathered users. Fresh installs go
  // through the wizard, which triggers imports/seed explicitly and then sets
  // the gate itself.
  if (kvGet('onboarding.completedV1') === '1') {
    await firstLaunchImport()
    backfillCategoriesOnce()
    dedupHostsOnce()
    seedProjectsOnce()
  }
  const changed = refreshAllProjectVcs()
  if (changed) console.log(`[vcs] refreshed ${changed} project entries`)
  const ai = initAi()
  if (!ai.available) {
    // Try Keychain fallback for fresh machines / no env vars.
    const refreshed = await reinitAi()
    if (refreshed.available) console.log('[ai] using API key from Keychain')
    else console.log(`[ai] disabled: ${refreshed.reason}`)
  }

  app.on('browser-window-created', (_, window) => optimizer.watchWindowShortcuts(window))

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

// Kill every pty and wait for their exit callbacks before Electron tears the
// Node env down. Without this, a pty child dying mid-teardown fires its
// napi ThreadSafeFunction into a half-destroyed env and aborts the process.
let quitting = false
app.on('before-quit', (event) => {
  if (quitting) return
  quitting = true
  event.preventDefault()
  closeAllPtys().finally(() => app.exit(0))
})
