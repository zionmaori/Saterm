import { useEffect, useMemo, useState } from 'react'
import TerminalPane from './TerminalPane'
import type { Tab } from '../store/app'
import type { ShellOption } from '../../../shared/types'

interface Props {
  tab: Tab
  visible: boolean
}

export default function LocalTerminalView({ tab, visible }: Props): React.JSX.Element {
  const [shells, setShells] = useState<ShellOption[]>([])
  const [shell, setShell] = useState<string>('')
  const [shellKey, setShellKey] = useState(0)

  useEffect(() => {
    void window.api.pty.shells().then(setShells)
  }, [])

  const switchShell = (next: string): void => {
    setShell(next)
    setShellKey((k) => k + 1)
  }

  // Keep a stable session id scoped to the shell key so remounting
  // produces a new PTY session while the outer tab id stays the same.
  const sessionId = shellKey === 0 ? tab.id : `${tab.id}-${shellKey}`
  const activeTab = useMemo<Tab>(
    () => ({ ...tab, id: sessionId, shell: shell || undefined }),
    [tab, sessionId, shell]
  )

  return (
    <div
      style={{ display: visible ? 'flex' : 'none', flex: 1, minHeight: 0, flexDirection: 'column' }}
    >
      {shells.length > 1 && (
        <div className="local-term-header">
          <span className="local-term-title">{tab.title}</span>
          <select
            className="shell-select"
            value={shell}
            onChange={(e) => switchShell(e.target.value)}
            title="Switch shell (restarts session)"
          >
            <option value="">Default</option>
            {shells.map((s) => (
              <option key={s.path} value={s.path}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
      )}
      <TerminalPane key={`${tab.id}-${shellKey}`} tab={activeTab} visible={visible} />
    </div>
  )
}
