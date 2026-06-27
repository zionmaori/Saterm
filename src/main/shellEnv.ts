import { spawnSync } from 'child_process'
import { existsSync } from 'fs'

/**
 * Read an environment variable from the user's login shell. When Electron is
 * launched from Finder / Dock / Spotlight, `process.env` does NOT include
 * variables from ~/.zshrc / ~/.bash_profile. Run an interactive login shell
 * once at startup to recover them.
 *
 * Cached in-process so we don't spawn a shell per lookup.
 */

let cached: Record<string, string> | null = null

function defaultShell(): string {
  const env = process.env.SHELL
  if (env && existsSync(env)) return env
  for (const candidate of ['/bin/zsh', '/bin/bash', '/bin/sh']) {
    if (existsSync(candidate)) return candidate
  }
  return '/bin/sh'
}

function loadShellEnv(): Record<string, string> {
  if (cached) return cached
  cached = {}
  const shell = defaultShell()
  try {
    // -i -l so .zshrc + .zprofile both run; `env -0` is null-delimited so
    // values with newlines don't corrupt the parse.
    const res = spawnSync(shell, ['-i', '-l', '-c', 'env -0'], {
      encoding: 'utf8',
      timeout: 5000,
      // Inherit current env so the shell can still find PATH bootstrap pieces.
      env: process.env
    })
    if (res.status !== 0 || !res.stdout) return cached
    for (const entry of res.stdout.split('\0')) {
      if (!entry) continue
      const eq = entry.indexOf('=')
      if (eq <= 0) continue
      const key = entry.slice(0, eq)
      const value = entry.slice(eq + 1)
      cached[key] = value
    }
  } catch {
    /* leave cached empty on failure */
  }
  return cached
}

/** Get an env var, preferring the live `process.env` and falling back to the
 *  user's login shell. Trims trailing whitespace; returns null when unset. */
export function readEnv(name: string): string | null {
  const direct = (process.env[name] ?? '').trim()
  if (direct) return direct
  const fromShell = (loadShellEnv()[name] ?? '').trim()
  return fromShell || null
}
