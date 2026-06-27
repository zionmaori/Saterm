import { useEffect, useState } from 'react'
import { Search } from 'lucide-react'

interface Props {
  onOpenPalette: () => void
}

/**
 * 32px titlebar. The macOS traffic lights overlay on the left via
 * `titleBarStyle: 'hiddenInset'` on the BrowserWindow. We render a centered
 * "palette trigger" that looks like a search box but actually just opens the
 * ⌘K palette — real focus tends to be in terminals, so dedicated chrome input
 * would steal too much.
 */
export default function Titlebar({ onOpenPalette }: Props): React.JSX.Element {
  const [version, setVersion] = useState<string | null>(null)
  const [platform, setPlatform] = useState<NodeJS.Platform | null>(null)
  useEffect(() => {
    void window.api.app.version().then(setVersion)
    void window.api.app.platform().then(setPlatform)
  }, [])
  // macOS leaves 80px for the traffic lights; Windows/Linux have system controls
  // on the right, so the left edge can flush up against the search pill.
  const isMac = platform === 'darwin'
  return (
    <div className={`titlebar ${isMac ? 'titlebar-mac' : 'titlebar-non-mac'}`}>
      <div className="titlebar-spacer" />
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
      <div className="titlebar-meta" title={version ? `Termion v${version}` : 'Termion'}>
        <span className="titlebar-meta-name">Termion</span>
        {version && <span className="titlebar-meta-version">v{version}</span>}
      </div>
    </div>
  )
}
