import { spawn, type IPty } from 'node-pty'
import { BrowserWindow } from 'electron'
import { homedir } from 'os'
import { existsSync } from 'fs'
import { execSync, execFileSync } from 'child_process'
import type {
  PtySpawnArgs,
  SessionId,
  ShellOption,
  TermDataEvent,
  TermExitEvent
} from '../shared/types'

interface Session {
  pty: IPty
  /** Set when this session is a tmux client attached to a named session
   *  (see tmuxSessionName). Only explicit tab-close kills it; app quit or
   *  crash just kills this client, leaving the tmux server (a separate
   *  daemon process, not a child of Electron) and everything running inside
   *  it — e.g. `claude` — alive to reattach to next launch. */
  tmuxSession?: string
}

const sessions = new Map<SessionId, Session>()

// Common tmux install locations. We resolve an absolute path rather than
// relying on PATH lookup inside node-pty's spawn, since Electron launched
// from Finder/Dock/Spotlight often has a bare PATH that misses brew/user
// install dirs.
const TMUX_CANDIDATES = [
  '/opt/homebrew/bin/tmux',
  '/usr/local/bin/tmux',
  '/usr/bin/tmux',
  '/bin/tmux'
]

function findTmux(): string | null {
  for (const p of TMUX_CANDIDATES) {
    if (existsSync(p)) return p
  }
  return null
}

function tmuxSessionName(sessionId: SessionId): string {
  return `saterm-${String(sessionId).replace(/[^a-zA-Z0-9_-]/g, '')}`
}

const send = (event: string, payload: unknown): void => {
  for (const win of BrowserWindow.getAllWindows()) win.webContents.send(event, payload)
}

const isWindows = process.platform === 'win32'

// Git Bash search paths (most common Git for Windows install locations).
const GIT_BASH_CANDIDATES = [
  'C:\\Program Files\\Git\\bin\\bash.exe',
  'C:\\Program Files (x86)\\Git\\bin\\bash.exe',
  'C:\\Program Files\\Git\\usr\\bin\\bash.exe'
]

function findGitBash(): string | null {
  for (const p of GIT_BASH_CANDIDATES) {
    if (existsSync(p)) return p
  }
  // Also check if git is on PATH and derive bash.exe relative to it.
  try {
    const gitPath = execSync('where git', { encoding: 'utf8', timeout: 2000 }).split('\n')[0].trim()
    if (gitPath) {
      // C:\Program Files\Git\cmd\git.exe → C:\Program Files\Git\bin\bash.exe
      const base = gitPath.replace(/\\cmd\\git\.exe$/i, '')
      const candidate = `${base}\\bin\\bash.exe`
      if (existsSync(candidate)) return candidate
    }
  } catch {
    /* git not on PATH */
  }
  return null
}

export function detectShells(): ShellOption[] {
  if (!isWindows) {
    const shells: ShellOption[] = []
    const envShell = process.env.SHELL
    if (envShell && existsSync(envShell)) {
      shells.push({ label: envShell.split('/').pop() ?? envShell, path: envShell })
    }
    for (const p of ['/bin/zsh', '/bin/bash', '/bin/fish', '/bin/sh']) {
      if (p !== envShell && existsSync(p)) {
        shells.push({ label: p.split('/').pop() ?? p, path: p })
      }
    }
    return shells
  }

  const shells: ShellOption[] = []

  // PowerShell 7+ (pwsh)
  try {
    const pwsh = execSync('where pwsh', { encoding: 'utf8', timeout: 2000 }).split('\n')[0].trim()
    if (pwsh && existsSync(pwsh)) shells.push({ label: 'PowerShell 7 (pwsh)', path: pwsh })
  } catch {
    /* not installed */
  }

  // Windows PowerShell 5
  const ps5 = `${process.env.SystemRoot ?? 'C:\\Windows'}\\System32\\WindowsPowerShell\\v1.0\\powershell.exe`
  if (existsSync(ps5)) shells.push({ label: 'Windows PowerShell', path: ps5 })

  // Git Bash
  const gitBash = findGitBash()
  if (gitBash) shells.push({ label: 'Git Bash', path: gitBash })

  // WSL
  const wsl = `${process.env.SystemRoot ?? 'C:\\Windows'}\\System32\\wsl.exe`
  if (existsSync(wsl)) shells.push({ label: 'WSL', path: wsl })

  // cmd.exe
  const cmd = process.env.COMSPEC ?? 'C:\\Windows\\System32\\cmd.exe'
  if (existsSync(cmd)) shells.push({ label: 'Command Prompt (cmd)', path: cmd })

  return shells
}

const defaultShell = (): string => {
  if (isWindows) {
    const comspec = process.env.COMSPEC
    if (comspec && existsSync(comspec)) return comspec
    return 'powershell.exe'
  }
  const env = process.env.SHELL
  if (env && existsSync(env)) return env
  for (const candidate of ['/bin/zsh', '/bin/bash', '/bin/sh']) {
    if (existsSync(candidate)) return candidate
  }
  return '/bin/sh'
}

const shellArgs = (shell: string): string[] => {
  if (!isWindows) return ['-l']
  const lower = shell.toLowerCase()
  // Git Bash needs --login -i for a proper interactive session
  if (lower.includes('bash.exe')) return ['--login', '-i']
  // WSL and cmd need no extra args; PowerShell loads profile automatically
  return []
}

export function spawnPty(args: PtySpawnArgs): void {
  // A tab whose session already exists (e.g. it was just moved to another
  // window and its TerminalPane remounted) must not spawn a second process —
  // the original would leak, orphaned and unkillable via closePty. Treat this
  // as a no-op: the caller just starts receiving the existing session's
  // already-broadcast term:data events.
  if (sessions.has(args.sessionId)) return

  const cwd = args.cwd && existsSync(args.cwd) ? args.cwd : homedir()
  const shell = args.shell ?? defaultShell()
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    TERM: 'xterm-256color',
    COLORTERM: 'truecolor',
    LANG: process.env.LANG ?? 'en_US.UTF-8',
    ...(args.env ?? {})
  }

  // "Open Claude Code in this project" tabs run inside a named tmux session
  // (when tmux is installed) instead of a bare shell. tmux's server is a
  // separate daemon process, not a child of Electron — so if Saterm crashes
  // or is quit, killing this pty only kills the tmux *client*; the server,
  // the `claude` process inside it, and its conversation all keep running.
  // The session name is derived from the tab's stable id (tabs/ids are
  // persisted across restarts), so reopening the same tab attaches to
  // whatever was left running (`-A`) instead of starting a fresh session.
  const tmuxBin = !isWindows && args.initialCommand === 'claude' ? findTmux() : null
  const tmuxName = tmuxBin ? tmuxSessionName(args.sessionId) : null

  const file = tmuxBin ?? shell
  const fileArgs = tmuxBin
    ? ['new-session', '-A', '-s', tmuxName as string, '-c', cwd, shell, '-i', '-l', '-c', 'claude']
    : shellArgs(shell)

  const pty = spawn(file, fileArgs, {
    name: 'xterm-256color',
    cols: args.cols,
    rows: args.rows,
    cwd,
    env,
    useConpty: isWindows ? true : undefined
  } as Parameters<typeof spawn>[2])
  sessions.set(args.sessionId, { pty, tmuxSession: tmuxName ?? undefined })
  pty.onData((data) =>
    send('term:data', { sessionId: args.sessionId, data } satisfies TermDataEvent)
  )
  pty.onExit(({ exitCode, signal }) => {
    sessions.delete(args.sessionId)
    send('term:exit', {
      sessionId: args.sessionId,
      code: exitCode,
      signal: signal ? String(signal) : null
    } satisfies TermExitEvent)
  })
  // Auto-run a command as if the user typed it at the first prompt. Give the
  // login shell a moment to finish sourcing rc files (so PATH is populated)
  // before we write — otherwise the command can race the shell's startup and
  // land before the prompt is drawn, or run in a shell that hasn't yet
  // picked up user-installed CLIs like `claude`. Not needed on the tmux path
  // above, which already runs the command directly (and re-attaches rather
  // than re-running it when the session already existed).
  if (args.initialCommand && !tmuxBin) {
    const cmd = args.initialCommand
    setTimeout(() => {
      sessions.get(args.sessionId)?.pty.write(`${cmd}\r`)
    }, 400)
  }
}

export function writePty(sessionId: SessionId, data: string): void {
  sessions.get(sessionId)?.pty.write(data)
}

export function resizePty(sessionId: SessionId, cols: number, rows: number): void {
  sessions.get(sessionId)?.pty.resize(cols, rows)
}

export function closePty(sessionId: SessionId): void {
  const s = sessions.get(sessionId)
  if (!s) return
  // Explicitly closing a tab is the one path that should actually end a
  // tmux-backed claude session — app quit/crash intentionally leave it
  // running (see spawnPty), so this is the only place kill-session belongs.
  if (s.tmuxSession) {
    const tmuxBin = findTmux()
    if (tmuxBin) {
      try {
        execFileSync(tmuxBin, ['kill-session', '-t', s.tmuxSession])
      } catch {
        /* session may already be gone */
      }
    }
  }
  try {
    s.pty.kill()
  } catch {
    /* noop */
  }
  sessions.delete(sessionId)
}

export function isPtySession(sessionId: SessionId): boolean {
  return sessions.has(sessionId)
}

// Kill every live pty and wait for their exit callbacks to fire (or a short
// deadline). Must run before Electron begins tearing down the Node env —
// otherwise node-pty's ThreadSafeFunction fires into a half-destroyed napi
// env, ThrowAsJavaScriptException escapes through noexcept, and the process
// aborts. See crash trace: pty.node → Napi::Error::ThrowAsJavaScriptException
// → __cxa_throw → abort during node::Environment::RunCleanup.
export async function closeAllPtys(timeoutMs = 1500): Promise<void> {
  const entries = Array.from(sessions.entries())
  if (entries.length === 0) return
  const waits = entries.map(
    ([id, s]) =>
      new Promise<void>((resolveWait) => {
        let done = false
        const finish = (): void => {
          if (done) return
          done = true
          sessions.delete(id)
          resolveWait()
        }
        try {
          s.pty.onExit(finish)
        } catch {
          finish()
          return
        }
        try {
          s.pty.kill()
        } catch {
          finish()
        }
      })
  )
  const deadline = new Promise<void>((r) => setTimeout(r, timeoutMs))
  await Promise.race([Promise.all(waits), deadline])
}
