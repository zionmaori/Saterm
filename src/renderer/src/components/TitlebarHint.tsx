import { useEffect, useState } from 'react'
import { ChevronRight, Sparkles } from 'lucide-react'
import { contextualTip } from '../lib/tips'
import { useTipContext } from '../lib/useTipContext'

const ROTATE_MS = 30_000
const FADE_MS = 220

/* Compact rotating "transmission" hint that lives in the titlebar centre-left
 * area. Hover reveals a "next" chevron. Click anywhere on the pill advances. */
export default function TitlebarHint(): React.JSX.Element {
  const ctx = useTipContext()
  const [seed, setSeed] = useState<number>(() => Math.floor(Math.random() * 1000))
  const [visible, setVisible] = useState(true)

  const advance = (): void => {
    setVisible(false)
    window.setTimeout(() => {
      setSeed((s) => s + 1)
      setVisible(true)
    }, FADE_MS - 40)
  }

  useEffect(() => {
    const t = window.setInterval(advance, ROTATE_MS)
    return () => window.clearInterval(t)
  }, [])

  const tip = contextualTip(ctx, seed)

  return (
    <button
      className={`titlebar-hint${visible ? ' fade-in' : ' fade-out'}`}
      onClick={advance}
      title={`${tip.title} — ${tip.body}`}
    >
      <span className="titlebar-hint-badge" aria-hidden="true">
        <Sparkles size={10} strokeWidth={2} />
      </span>
      <span className="titlebar-hint-label">tip</span>
      <span className="titlebar-hint-text">{tip.title}</span>
      <span className="titlebar-hint-next" aria-hidden="true">
        <ChevronRight size={10} strokeWidth={2} />
      </span>
    </button>
  )
}
