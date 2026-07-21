import { useEffect, useState } from 'react'
import { Sparkles } from 'lucide-react'
import { contextualTip } from '../lib/tips'
import { useTipContext } from '../lib/useTipContext'

const ROTATE_MS = 30_000

/* Compact rotating hint that lives in the titlebar centre-left area.
 * Kept tiny — one line, click to advance. */
export default function TitlebarHint(): React.JSX.Element {
  const ctx = useTipContext()
  const [seed, setSeed] = useState<number>(() => Math.floor(Math.random() * 1000))
  const [visible, setVisible] = useState(true)

  useEffect(() => {
    const t = window.setInterval(() => {
      // Fade out → advance → fade in for a subtle transition.
      setVisible(false)
      window.setTimeout(() => {
        setSeed((s) => s + 1)
        setVisible(true)
      }, 220)
    }, ROTATE_MS)
    return () => window.clearInterval(t)
  }, [])

  const tip = contextualTip(ctx, seed)

  return (
    <button
      className={`titlebar-hint${visible ? ' fade-in' : ' fade-out'}`}
      onClick={() => {
        setVisible(false)
        window.setTimeout(() => {
          setSeed((s) => s + 1)
          setVisible(true)
        }, 180)
      }}
      title={tip.body}
    >
      <Sparkles size={10} strokeWidth={2} />
      <span className="titlebar-hint-text">{tip.title}</span>
    </button>
  )
}
