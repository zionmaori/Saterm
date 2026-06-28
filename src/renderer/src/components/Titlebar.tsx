import { useEffect, useState } from 'react'
import { Monitor, Moon, PanelLeft, Search, Sun } from 'lucide-react'

export type Theme = 'dark' | 'light' | 'system'

interface Props {
  onOpenPalette: () => void
  sidebarOpen: boolean
  onToggleSidebar: () => void
  theme: Theme
  onTheme: (t: Theme) => void
}

export default function Titlebar({ onOpenPalette, sidebarOpen, onToggleSidebar, theme, onTheme }: Props): React.JSX.Element {
  const [version, setVersion] = useState<string | null>(null)
  const [platform, setPlatform] = useState<NodeJS.Platform | null>(null)
  useEffect(() => {
    void window.api.app.version().then(setVersion)
    void window.api.app.platform().then(setPlatform)
  }, [])
  const isMac = platform === 'darwin'

  return (
    <div className={`titlebar ${isMac ? 'titlebar-mac' : 'titlebar-non-mac'}`}>
      <div className="titlebar-left">
        <button
          type="button"
          className={`titlebar-icon-btn${sidebarOpen ? ' active' : ''}`}
          onClick={onToggleSidebar}
          title={sidebarOpen ? 'Hide sidebar' : 'Show sidebar'}
        >
          <PanelLeft size={14} strokeWidth={2} />
        </button>
      </div>

      <button
        type="button"
        className="titlebar-search"
        onClick={onOpenPalette}
        title="Search hosts and projects (⌘K)"
      >
        <Search size={12} strokeWidth={2} />
        <span className="titlebar-search-label">Search hosts and projects</span>
        <kbd className="titlebar-kbd">⌘K</kbd>
      </button>

      <div className="titlebar-right">
        <div className="theme-toggle">
          <button
            type="button"
            className={`titlebar-icon-btn${theme === 'light' ? ' active' : ''}`}
            onClick={() => onTheme('light')}
            title="Light theme"
          >
            <Sun size={13} strokeWidth={2} />
          </button>
          <button
            type="button"
            className={`titlebar-icon-btn${theme === 'system' ? ' active' : ''}`}
            onClick={() => onTheme('system')}
            title="System theme"
          >
            <Monitor size={13} strokeWidth={2} />
          </button>
          <button
            type="button"
            className={`titlebar-icon-btn${theme === 'dark' ? ' active' : ''}`}
            onClick={() => onTheme('dark')}
            title="Dark theme"
          >
            <Moon size={13} strokeWidth={2} />
          </button>
        </div>
        <div className="titlebar-meta" title={version ? `Termion v${version}` : 'Termion'}>
          <span className="titlebar-meta-name">Termion</span>
          {version && <span className="titlebar-meta-version">v{version}</span>}
        </div>
      </div>
    </div>
  )
}
