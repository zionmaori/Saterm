import { spawn, type IPty } from 'node-pty'
import { BrowserWindow } from 'electron'
import { homedir } from 'os'
import { existsSync } from 'fs'
import type { PtySpawnArgs, SessionId, TermDataEvent, TermExitEvent } from '../shared/types'

interface Session {
  pty: IPty
}

const sessions = new Map<SessionId, Session>()

const send = (event: string, payload: unknown): void => {
  for (const win of BrowserWindow.getAllWindows()) win.webContents.send(event, payload)
}

const defaultShell = (): string => {
  const env = process.env.SHELL
  if (env && existsSync(env)) return env
  for (const candidate of ['/bin/zsh', '/bin/bash', '/bin/sh']) {
    if (existsSync(candidate)) return candidate
  }
  return '/bin/sh'
}

export function spawnPty(args: PtySpawnArgs): void {
  const cwd = args.cwd && existsSync(args.cwd) ? args.cwd : homedir()
  const shell = defaultShell()
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    TERM: 'xterm-256color',
    COLORTERM: 'truecolor',
    LANG: process.env.LANG ?? 'en_US.UTF-8'
  }
  const pty = spawn(shell, ['-l'], {
    name: 'xterm-256color',
    cols: args.cols,
    rows: args.rows,
    cwd,
    env
  })
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
