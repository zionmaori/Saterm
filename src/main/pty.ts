import { spawn, type IPty } from 'node-pty'
import { BrowserWindow } from 'electron'
import { homedir } from 'os'
import { existsSync } from 'fs'
import { execSync } from 'child_process'
import type { PtySpawnArgs, SessionId, ShellOption, TermDataEvent, TermExitEvent } from '../shared/types'

interface Session {
  pty: IPty
}

const sessions = new Map<SessionId, Session>()

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
  } catch { /* not installed */ }

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
  const cwd = args.cwd && existsSync(args.cwd) ? args.cwd : homedir()
  const shell = args.shell ?? defaultShell()
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    TERM: 'xterm-256color',
    COLORTERM: 'truecolor',
    LANG: process.env.LANG ?? 'en_US.UTF-8',
    ...(args.env ?? {})
  }
  const pty = spawn(shell, shellArgs(shell), {
    name: 'xterm-256color',
    cols: args.cols,
    rows: args.rows,
    cwd,
    env,
    useConpty: isWindows ? true : undefined
  } as Parameters<typeof spawn>[2])
  sessions.set(args.sessionId, { pty })
  pty.onData((data) => send('term:data', { sessionId: args.sessionId, data } satisfies TermDataEvent))
  pty.onExit(({ exitCode, signal }) => {
    sessions.delete(args.sessionId)
    send('term:exit', {
      sessionId: args.sessionId,
      code: exitCode,
      signal: signal ? String(signal) : null
    } satisfies TermExitEvent)
  })
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
  try {
    s.pty.kill()
  } catch { /* noop */ }
  sessions.delete(sessionId)
}

export function isPtySession(sessionId: SessionId): boolean {
  return sessions.has(sessionId)
}
