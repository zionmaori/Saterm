import { BrowserWindow, shell } from 'electron'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'

// Shared window lifecycle for both the one persisted "primary" window
// (created at launch, its bounds/tab-list round-trip through kv — see
// index.ts) and any number of ephemeral "secondary" windows spawned by
// dragging a tab out of the tab bar (TabBar.tsx's tear-off gesture). A tab
// moved into a secondary window keeps running exactly as it did before —
// pty/ssh sessions are already main-process-owned and broadcast to every
// window (see pty.ts/ssh.ts), so a secondary window is just another
// renderer subscribing to the same events.

let mainWindow: BrowserWindow | null = null
const secondaryWindows = new Map<number, BrowserWindow>()
const confirmCloseById = new Map<number, () => void>()
let appQuitting = false

export function markAppQuitting(): void {
  appQuitting = true
}

export function isAppQuitting(): boolean {
  return appQuitting
}

export function baseWindowOptions(): Electron.BrowserWindowConstructorOptions {
  return {
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
  }
}

export function loadApp(win: BrowserWindow): void {
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

/**
 * Intercepts the window's 'close' so the renderer gets a chance to close its
 * still-open tabs first (killing their pty/ssh sessions via the existing
 * closeTab cleanup) before the window actually goes away. Skipped entirely
 * during a full app quit — before-quit's closeAllPtys() already handles that
 * case, comprehensively and without N per-window round-trips.
 */
export function installCloseConfirm(win: BrowserWindow): void {
  let confirmed = false
  win.on('close', (event) => {
    if (confirmed || appQuitting) return
    event.preventDefault()
    win.webContents.send('window:request-close')
  })
  confirmCloseById.set(win.id, () => {
    confirmed = true
    win.destroy()
  })
  win.on('closed', () => confirmCloseById.delete(win.id))
}

/** Called from the window:confirmClose IPC handler once the renderer has torn
 *  down its tabs' sessions. */
export function confirmWindowClose(windowId: number): void {
  confirmCloseById.get(windowId)?.()
}

export function setMainWindow(win: BrowserWindow): void {
  mainWindow = win
  win.on('closed', () => {
    if (mainWindow === win) mainWindow = null
  })
}

export function getMainWindow(): BrowserWindow | null {
  return mainWindow
}

export function windowById(id: number): BrowserWindow | undefined {
  if (mainWindow?.id === id) return mainWindow
  return secondaryWindows.get(id)
}

/**
 * Creates a secondary (unpersisted) window near a screen point — used when a
 * tab is dragged out past the edge of every existing window. `onReady` fires
 * once after the renderer has finished its first load, the right moment to
 * hand it the tab that's being torn off.
 */
export function createSecondaryWindow(
  x: number,
  y: number,
  onReady: (win: BrowserWindow) => void
): BrowserWindow {
  const win = new BrowserWindow({
    ...baseWindowOptions(),
    width: 1100,
    height: 800,
    // Offset so the dragged tab (not the new window's top-left corner) ends
    // up roughly under the cursor at drop time.
    x: Math.round(x - 80),
    y: Math.round(y - 20)
  })

  secondaryWindows.set(win.id, win)
  win.on('closed', () => secondaryWindows.delete(win.id))

  win.on('ready-to-show', () => win.show())
  win.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })
  win.webContents.once('did-finish-load', () => onReady(win))

  installCloseConfirm(win)

  loadApp(win)
  return win
}
