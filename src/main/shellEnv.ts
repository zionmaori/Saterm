import { spawnSync } from 'child_process'
import { existsSync } from 'fs'

/**
 * Read an environment variable from the user's login shell.
 *
 * When Electron is launched from Finder / Dock / Spotlight (macOS) or from
 * Explorer / Start Menu (Windows), `process.env` does NOT include variables
 * defined by interactive shell init files (~/.zshrc, ~/.bash_profile,
 * PowerShell $PROFILE). We probe the user's login shell once at startup to
 * recover them, then cache.
 *
 * Cache is in-process so repeated lookups don't respawn shells.
 */

let cached: Record<string, string> | null = null
const isWindows = process.platform === 'win32'

function unixShell(): string {
  const env = process.env.SHELL
  if (env && existsSync(env)) return env
  for (const candidate of ['/bin/zsh', '/bin/bash', '/bin/sh']) {
    if (existsSync(candidate)) return candidate
  }
  return '/bin/sh'
}

function loadUnixEnv(): Record<string, string> {
  const out: Record<string, string> = {}
  const shell = unixShell()
  try {
    // -i -l so .zshrc + .zprofile both run; `env -0` is null-delimited so
    // values with newlines don't corrupt the parse.
    const res = spawnSync(shell, ['-i', '-l', '-c', 'env -0'], {
      encoding: 'utf8',
      timeout: 5000,
      env: process.env
    })
    if (res.status !== 0 || !res.stdout) return out
    for (const entry of res.stdout.split('\0')) {
      if (!entry) continue
      const eq = entry.indexOf('=')
      if (eq <= 0) continue
      out[entry.slice(0, eq)] = entry.slice(eq + 1)
    }
  } catch {
    /* leave empty on failure */
  }
  return out
}

function loadWindowsEnv(): Record<string, string> {
  const out: Record<string, string> = {}
  // Prefer modern PowerShell ("pwsh"); fall back to Windows PowerShell.
  // We DO want $PROFILE to run, so omit -NoProfile. The script dumps env vars
  // as "KEY=value" lines joined by NUL so newline values can't corrupt parse.
  const script =
    "Get-ChildItem env: | ForEach-Object { \"$($_.Name)=$($_.Value)\" } | Join-String -Separator [char]0 | Write-Output"
  for (const exe of ['pwsh.exe', 'powershell.exe']) {
    try {
      const res = spawnSync(exe, ['-NoLogo', '-Command', script], {
        encoding: 'utf8',
        timeout: 8000,
        env: process.env,
        windowsHide: true
      })
      if (res.status !== 0 || !res.stdout) continue
      for (const entry of res.stdout.split('\0')) {
        if (!entry) continue
        const eq = entry.indexOf('=')
        if (eq <= 0) continue
        out[entry.slice(0, eq).trim()] = entry.slice(eq + 1).replace(/\r?\n$/, '')
      }
      if (Object.keys(out).length > 0) return out
    } catch {
      /* try the next exe */
    }
  }
  return out
}

function loadShellEnv(): Record<string, string> {
  if (cached) return cached
  cached = isWindows ? loadWindowsEnv() : loadUnixEnv()
  return cached
}

/** Get an env var, preferring the live `process.env` and falling back to the
 *  user's login shell. Trims surrounding whitespace; returns null when unset. */
export function readEnv(name: string): string | null {
  const direct = (process.env[name] ?? '').trim()
  if (direct) return direct
  const fromShell = (loadShellEnv()[name] ?? '').trim()
  return fromShell || null
}
