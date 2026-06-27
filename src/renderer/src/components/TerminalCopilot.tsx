import ChatPanel from './ChatPanel'
import type { Tab } from '../store/app'
import { useApp } from '../store/app'

interface Props {
  tab: Tab
  onClose: () => void
}

export default function TerminalCopilot({ tab, onClose }: Props): React.JSX.Element {
  const hosts = useApp((s) => s.hosts)

  const buildContext = (): import('../../../shared/types').AiContext => {
    const scrollback =
      window.__termionGetScrollback?.(tab.id, 200) ?? '(no terminal buffer attached)'
    const host = tab.hostId ? hosts.find((h) => h.id === tab.hostId) : null
    return {
      kind: 'terminal',
      hostName: host ? `${host.user}@${host.name}` : null,
      cwd: tab.kind === 'local' ? tab.cwd ?? null : null,
      scrollback
    }
  }

  const onInsertCommand = (cmd: string): void => {
    window.__termionInsertText?.(tab.id, cmd)
  }

  const subtitle =
    tab.kind === 'ssh'
      ? hosts.find((h) => h.id === tab.hostId)?.name ?? 'ssh'
      : tab.kind === 'local'
        ? tab.cwd ?? 'local'
        : tab.title

  return (
    <ChatPanel
      sessionKey={`term:${tab.id}`}
      kind="terminal"
      title="Terminal copilot"
      subtitle={subtitle}
      buildContext={buildContext}
      onInsertCommand={onInsertCommand}
      onClose={onClose}
    />
  )
}

declare global {
  interface Window {
    /** Read the last N lines from a terminal's xterm buffer. Installed by TerminalPane. */
    __termionGetScrollback?: (tabId: string, lines: number) => string
    /** Write text into a terminal (no execute). Installed by TerminalPane. */
    __termionInsertText?: (tabId: string, text: string) => void
  }
}
