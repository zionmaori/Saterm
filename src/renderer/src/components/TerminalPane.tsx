import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import { SearchAddon } from '@xterm/addon-search'
import { WebglAddon } from '@xterm/addon-webgl'
import type { Tab } from '../store/app'

interface Props {
  tab: Tab
  visible: boolean
  resizeKey?: number | string
}

const THEME = {
  background: '#0a0c10',
  foreground: '#e6edf3',
  cursor: '#7ee2b8',
  cursorAccent: '#0a0c10',
  selectionBackground: '#264f78',
  black: '#484f58',
  red: '#ff7b72',
  green: '#3fb950',
  yellow: '#d29922',
  blue: '#58a6ff',
  magenta: '#bc8cff',
  cyan: '#39c5cf',
  white: '#b1bac4',
  brightBlack: '#6e7681',
  brightRed: '#ffa198',
  brightGreen: '#56d364',
  brightYellow: '#e3b341',
  brightBlue: '#79c0ff',
  brightMagenta: '#d2a8ff',
  brightCyan: '#56d4dd',
  brightWhite: '#f0f6fc'
}

export default function TerminalPane({ tab, visible, resizeKey }: Props): React.JSX.Element {
  const hostRef = useRef<HTMLDivElement>(null)
  const termRef = useRef<Terminal | null>(null)
  const fitRef = useRef<FitAddon | null>(null)
  const startedRef = useRef(false)
  const [status, setStatus] = useState<string | null>(null)
  const [reconnectKey, setReconnectKey] = useState(0)
  const sessionId = reconnectKey === 0 ? tab.id : `${tab.id}-r${reconnectKey}`

  // Initialize xterm once per session id.
  useLayoutEffect(() => {
    if (!hostRef.current || termRef.current) return
    const term = new Terminal({
      theme: THEME,
      fontFamily: 'ui-monospace, SFMono-Regular, "JetBrains Mono", Menlo, monospace',
      fontSize: 13,
      cursorBlink: true,
      scrollback: 10000,
      allowProposedApi: true
    })
    const fit = new FitAddon()
    term.loadAddon(fit)
    term.loadAddon(new WebLinksAddon())
    term.loadAddon(new SearchAddon())
    try {
      term.loadAddon(new WebglAddon())
    } catch {
      /* webgl optional */
    }
    term.open(hostRef.current)
    fit.fit()
    termRef.current = term
    fitRef.current = fit

    // Register global helpers the copilot uses to read recent output and to
    // type drafted commands into the shell. Keyed by tab id so multiple tabs
    // co-exist. Unregistered in the cleanup below.
    const g = window as Window & {
      __termionTerms?: Map<string, Terminal>
      __termionGetScrollback?: (id: string, n: number) => string
      __termionInsertText?: (id: string, text: string) => void
    }
    if (!g.__termionTerms) {
      g.__termionTerms = new Map()
      g.__termionGetScrollback = (id, n): string => {
        const t = g.__termionTerms!.get(id)
        if (!t) return ''
        const out: string[] = []
        const buf = t.buffer.active
        const start = Math.max(0, buf.baseY + buf.cursorY - n + 1)
        const end = buf.baseY + buf.cursorY
        for (let i = start; i <= end; i++) {
          const line = buf.getLine(i)
          if (line) out.push(line.translateToString(true))
        }
        return out.join('\n')
      }
      g.__termionInsertText = (id, text): void => {
        // We send the text to the *pty/ssh* input channel rather than typing
        // it as keystrokes — that puts it at the prompt without executing.
        // Strip a trailing newline so the command isn't auto-run.
        const clean = text.replace(/\n+$/, '')
        void window.api.term.input({ sessionId: id, data: clean })
      }
    }
    g.__termionTerms.set(tab.id, term)

    const offData = window.api.term.onData((evt) => {
      if (evt.sessionId === sessionId) term.write(evt.data)
    })
    const offExit = window.api.term.onExit((evt) => {
      if (evt.sessionId === sessionId) {
        const msg = evt.message ?? `\r\n[session exited${evt.code != null ? ` code=${evt.code}` : ''}${evt.signal ? ` signal=${evt.signal}` : ''}]\r\n`
        term.write(msg)
        setStatus('disconnected')
      }
    })

    term.onData((data) => {
      void window.api.term.input({ sessionId, data })
    })

    const startSession = async (): Promise<void> => {
      if (startedRef.current) return
      startedRef.current = true
      const cols = term.cols
      const rows = term.rows
      try {
        if (tab.kind === 'ssh' && tab.hostId) {
          setStatus('connecting…')
          await window.api.ssh.connect({ sessionId, hostId: tab.hostId, cols, rows })
          setStatus(null)
        } else if (tab.kind === 'local') {
          await window.api.pty.spawn({
            sessionId,
            cwd: tab.cwd,
            cols,
            rows,
            shell: tab.shell,
            env: tab.env
          })
        }
      } catch (err) {
        const msg = (err as Error).message
        term.write(`\r\n\x1b[31m[connect failed] ${msg}\x1b[0m\r\n`)
        setStatus('failed')
      }
    }
    void startSession()

    const ro = new ResizeObserver(() => {
      try {
        fit.fit()
        void window.api.term.resize({ sessionId, cols: term.cols, rows: term.rows })
      } catch {
        /* noop */
      }
    })
    ro.observe(hostRef.current)

    return () => {
      offData()
      offExit()
      ro.disconnect()
      term.dispose()
      termRef.current = null
      fitRef.current = null
      startedRef.current = false
      g.__termionTerms?.delete(tab.id)
    }
  }, [tab.id, tab.kind, tab.hostId, tab.cwd, sessionId])

  // Re-fit when the tab becomes visible (xterm needs a real layout).
  useEffect(() => {
    if (visible && termRef.current && fitRef.current) {
      const t = setTimeout(() => {
        try {
          fitRef.current!.fit()
          termRef.current!.focus()
          void window.api.term.resize({
            sessionId,
            cols: termRef.current!.cols,
            rows: termRef.current!.rows
          })
        } catch {
          /* noop */
        }
      }, 20)
      return () => clearTimeout(t)
    }
    return undefined
  }, [visible, sessionId])

  // Re-fit when the container is repositioned (e.g. terminal flips top/bottom).
  useEffect(() => {
    if (resizeKey === undefined) return
    const t = setTimeout(() => {
      try {
        fitRef.current?.fit()
        if (termRef.current && fitRef.current) {
          void window.api.term.resize({
            sessionId,
            cols: termRef.current.cols,
            rows: termRef.current.rows
          })
        }
      } catch {
        /* noop */
      }
    }, 50)
    return () => clearTimeout(t)
  }, [resizeKey, sessionId])

  const canReconnect = status === 'disconnected' || status === 'failed'

  return (
    <div className="terminal-host" ref={hostRef} style={{ display: visible ? 'block' : 'none' }}>
      {status && (
        <div
          style={{
            position: 'absolute',
            top: 12,
            right: 16,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            color: 'var(--text-dim)',
            fontSize: 11
          }}
        >
          {status}
          {canReconnect && (
            <button
              style={{ fontSize: 11, padding: '2px 8px' }}
              onClick={() => {
                setStatus(null)
                setReconnectKey((k) => k + 1)
              }}
            >
              Reconnect
            </button>
          )}
        </div>
      )}
    </div>
  )
}
