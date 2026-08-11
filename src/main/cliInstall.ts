import { app } from 'electron'
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { homedir } from 'os'
import { dirname, join } from 'path'

export interface CliInstallResult {
  path: string
  onPath: boolean
}

export interface CliStatus {
  installed: boolean
  path: string | null
  /** False when an installed script exists but points at a different (e.g.
   *  older, moved) executable than the one currently running. */
  current: boolean
}

// Generated at install time rather than shipped as a static asset, so it
// always points at *this* running install's actual executable — no need to
// guess an install location (Applications folder, Program Files, an
// AppImage's mount point, ...). On every packaged platform `process.execPath`
// already resolves to the real launchable binary (on macOS that's inside the
// .app bundle's Contents/MacOS).
function launcherScript(): string {
  const exe = process.execPath
  if (process.platform === 'win32') {
    return `@echo off\r\n"${exe}" --saterm-cli "%CD%" %*\r\n`
  }
  return [
    '#!/usr/bin/env bash',
    'if [ "$1" = "--help" ] || [ "$1" = "-h" ]; then',
    '  echo "Usage: saterm [ssh <host> | project <name> | snippet <title> | new | open <path|host:path>]"',
    '  echo "Run with no arguments to just open/focus Saterm."',
    '  exit 0',
    'fi',
    `exec "${exe}" --saterm-cli "$(pwd)" "$@"`,
    ''
  ].join('\n')
}

/** Candidate install paths, in preference order. Only the first entry is
 *  tried on Windows (WindowsApps is user-writable and on PATH by default on
 *  Win10+, so there's no admin-elevation fallback to build). */
function candidatePaths(): string[] {
  if (process.platform === 'win32') {
    const localAppData = process.env.LOCALAPPDATA || join(homedir(), 'AppData', 'Local')
    return [join(localAppData, 'Microsoft', 'WindowsApps', 'saterm.cmd')]
  }
  return [join('/usr/local/bin', 'saterm'), join(homedir(), '.local', 'bin', 'saterm')]
}

function isOnPath(dir: string): boolean {
  const sep = process.platform === 'win32' ? ';' : ':'
  const norm = (p: string): string => p.replace(/[\\/]+$/, '')
  return (process.env.PATH || '').split(sep).some((e) => norm(e) === norm(dir))
}

export function cliStatus(): CliStatus {
  const script = launcherScript()
  for (const p of candidatePaths()) {
    if (!existsSync(p)) continue
    let current = false
    try {
      current = readFileSync(p, 'utf8') === script
    } catch {
      current = false
    }
    return { installed: true, path: p, current }
  }
  return { installed: false, path: null, current: false }
}

export async function installCli(): Promise<CliInstallResult> {
  if (!app.isPackaged) {
    throw new Error(
      'The CLI launcher points at the packaged app executable — build Saterm first (npm run build:mac/win/linux), then install from there.'
    )
  }
  const script = launcherScript()
  const write = (target: string): void => {
    mkdirSync(dirname(target), { recursive: true })
    writeFileSync(target, script)
    if (process.platform !== 'win32') chmodSync(target, 0o755)
  }

  const [primary, fallback] = candidatePaths()
  try {
    write(primary)
    return { path: primary, onPath: isOnPath(dirname(primary)) }
  } catch (err) {
    if (!fallback || (err as NodeJS.ErrnoException).code !== 'EACCES') throw err
    write(fallback)
    return { path: fallback, onPath: isOnPath(dirname(fallback)) }
  }
}
