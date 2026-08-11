import { spawnSync } from 'child_process'
import { existsSync, readFileSync, unlinkSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { randomUUID } from 'crypto'

function parseNullDelimitedEnv(raw: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const entry of raw.split('\0')) {
    if (!entry) continue
    const eq = entry.indexOf('=')
    if (eq <= 0) continue
    out[entry.slice(0, eq)] = entry.slice(eq + 1)
  }
  return out
}

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
  const shell = unixShell()
  const outFile = join(tmpdir(), `saterm-env-${randomUUID()}.txt`)
  try {
    // -i -l so .zshrc + .zprofile both run; `env -0` is null-delimited so
    // values with newlines don't corrupt the parse. Timeout is generous
    // because noisy zsh init (nvm, gitstatus, plugin managers) can take
    // several seconds on Electron cold start.
    //
    // Output is redirected to a real file rather than captured via a pipe
    // (stdio 'ignore'), and stdin is ignored too. A noisy rc file (nvm,
    // gitstatusd, powerlevel10k instant-prompt, direnv, ...) can fork a
    // background helper that inherits our stdout fd; if we captured output
    // over a pipe, Node would block reading it until EVERY holder of that fd
    // closes — which can hang indefinitely, well past `timeout`, since the
    // timeout only kills the shell we're tracking, not its orphaned
    // grandchildren. A real file has no such lingering-writer problem, so a
    // killed-on-timeout shell can't wedge the whole main process (which is
    // what made every main-process feature — git status included — get
    // permanently stuck "loading" the first time this probe hung).
    spawnSync(shell, ['-i', '-l', '-c', `env -0 > '${outFile}'`], {
      timeout: 8000,
      env: process.env,
      stdio: ['ignore', 'ignore', 'ignore']
    })
    if (!existsSync(outFile)) return {}
    return parseNullDelimitedEnv(readFileSync(outFile, 'utf8'))
  } catch {
    return {}
  } finally {
    try {
      unlinkSync(outFile)
    } catch {
      /* file was never created */
    }
  }
}

function loadWindowsEnv(): Record<string, string> {
  // Prefer modern PowerShell ("pwsh"); fall back to Windows PowerShell.
  // We DO want $PROFILE to run, so omit -NoProfile. The script dumps env vars
  // as "KEY=value" entries joined by NUL so newline values can't corrupt
  // parse, written to a real file (see loadUnixEnv for why: a pipe can hang
  // past `timeout` if $PROFILE spawns a background process that inherits
  // our stdout handle).
  const outFile = join(tmpdir(), `saterm-env-${randomUUID()}.txt`)
  const script =
    `Get-ChildItem env: | ForEach-Object { "$($_.Name)=$($_.Value)" } | ` +
    `Join-String -Separator ([char]0) | Set-Content -NoNewline -Path '${outFile}'`
  for (const exe of ['pwsh.exe', 'powershell.exe']) {
    try {
      spawnSync(exe, ['-NoLogo', '-Command', script], {
        timeout: 8000,
        env: process.env,
        windowsHide: true,
        stdio: ['ignore', 'ignore', 'ignore']
      })
      if (!existsSync(outFile)) continue
      const out = parseNullDelimitedEnv(readFileSync(outFile, 'utf8'))
      if (Object.keys(out).length > 0) return out
    } catch {
      /* try the next exe */
    } finally {
      try {
        unlinkSync(outFile)
      } catch {
        /* file was never created */
      }
    }
  }
  return {}
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

/**
 * Merged env for spawning external CLIs: live `process.env` with the user's
 * login-shell env layered on top (login-shell wins on conflict, since the
 * Finder/Dock-launched Electron env is nearly empty on macOS). PATH is
 * additionally normalized via getPath() so brew / user-installed binaries
 * are always resolvable. This is what git/ssh/gpg need to find ssh-agent
 * (SSH_AUTH_SOCK), a GPG signer, and any hook interpreters on PATH.
 */
export function getShellEnv(): Record<string, string> {
  const shell = loadShellEnv()
  const merged: Record<string, string> = {}
  for (const [k, v] of Object.entries(process.env)) {
    if (typeof v === 'string') merged[k] = v
  }
  for (const [k, v] of Object.entries(shell)) {
    if (v) merged[k] = v
  }
  merged.PATH = getPath()
  return merged
}

/**
 * Standard install locations for CLIs that ship outside the system default
 * PATH. When the login-shell probe fails (timeout, non-zero exit from a
 * noisy .zshrc, unusual shell config) we fall back to these so `aws`,
 * `kubectl`, `terraform`, etc. are still discoverable at their canonical
 * install locations.
 */
function fallbackPathEntries(): string[] {
  if (isWindows) return []
  if (process.platform === 'darwin') {
    return [
      '/opt/homebrew/bin', // Apple Silicon Homebrew
      '/opt/homebrew/sbin',
      '/usr/local/bin', // Intel Homebrew / manual installs
      '/usr/local/sbin'
    ]
  }
  return ['/usr/local/bin', '/usr/local/sbin', '/snap/bin', '/opt/homebrew/bin']
}

/**
 * Merged PATH for spawning external CLIs.
 *
 * `readEnv('PATH')` short-circuits to `process.env.PATH` whenever it's set,
 * which on macOS-from-Finder/Dock is the meager `/usr/bin:/bin:/usr/sbin:/sbin`
 * — missing `/opt/homebrew/bin` and `/usr/local/bin` where the user's `aws`,
 * `terraform`, etc. actually live. Here we merge the login-shell PATH (first,
 * so brew etc. take precedence) with any unique entries from the live env,
 * plus a known set of fallback install locations in case the login-shell
 * probe returned nothing.
 */
export function getPath(): string {
  const sep = isWindows ? ';' : ':'
  const shell = (loadShellEnv()['PATH'] ?? '').trim()
  const proc = (process.env.PATH ?? '').trim()
  const parts: string[] = []
  const seen = new Set<string>()
  const push = (raw: string): void => {
    for (const p of raw.split(sep)) {
      if (!p || seen.has(p)) continue
      seen.add(p)
      parts.push(p)
    }
  }
  push(shell)
  push(proc)
  for (const p of fallbackPathEntries()) {
    if (!seen.has(p)) {
      seen.add(p)
      parts.push(p)
    }
  }
  return parts.join(sep)
}
