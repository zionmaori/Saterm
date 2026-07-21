import { useCallback, useEffect, useMemo, useState } from 'react'
import { Rocket, Sparkles, X } from 'lucide-react'
import { categoryLabel, tipOfTheDay } from '../lib/tips'
import { useTipContext } from '../lib/useTipContext'

const STORAGE_KEY = 'tipOfTheDay'
const DISABLED_KEY = 'tipOfTheDay.disabled'

function todayIso(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export default function TipOfTheDay({ suppress }: { suppress: boolean }): React.JSX.Element | null {
  const ctx = useTipContext()
  const [open, setOpen] = useState(false)
  const [dontShow, setDontShow] = useState(false)

  // Decide whether to open on mount. Once per calendar day, never if disabled.
  useEffect(() => {
    if (suppress) return
    let disabled = false
    let lastShown = ''
    try {
      disabled = localStorage.getItem(DISABLED_KEY) === 'true'
      lastShown = localStorage.getItem(STORAGE_KEY) ?? ''
    } catch {
      /* noop */
    }
    if (disabled) return
    if (lastShown === todayIso()) return
    // Small delay so the app finishes rendering before the tip pops.
    const t = window.setTimeout(() => setOpen(true), 600)
    return () => window.clearTimeout(t)
  }, [suppress])

  const tip = useMemo(() => tipOfTheDay(ctx), [ctx])

  const dismiss = useCallback((): void => {
    try {
      localStorage.setItem(STORAGE_KEY, todayIso())
      if (dontShow) localStorage.setItem(DISABLED_KEY, 'true')
    } catch {
      /* noop */
    }
    setOpen(false)
  }, [dontShow])

  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') dismiss()
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open, dismiss])

  if (!open) return null

  return (
    <div
      className="tip-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) dismiss()
      }}
    >
      <div className="tip-modal" role="dialog" aria-label="Tip of the day">
        <div className="tip-modal-orbit" aria-hidden="true">
          <span className="tip-orbit-star tip-orbit-star-1" />
          <span className="tip-orbit-star tip-orbit-star-2" />
          <span className="tip-orbit-star tip-orbit-star-3" />
        </div>
        <div className="tip-modal-header">
          <div className="tip-modal-badge">
            <Rocket size={13} strokeWidth={2} />
            <span>Transmission</span>
          </div>
          <button className="tip-modal-close" onClick={dismiss} title="Dismiss (Esc)">
            <X size={14} />
          </button>
        </div>

        <div className="tip-modal-body">
          <div className="tip-modal-eyebrow">
            <Sparkles size={11} strokeWidth={2} />
            <span>{categoryLabel(tip.category)} · tip of the day</span>
          </div>
          <h2 className="tip-modal-title">{tip.title}</h2>
          <p className="tip-modal-text">{tip.body}</p>
        </div>

        <div className="tip-modal-footer">
          <label className="tip-modal-check">
            <input
              type="checkbox"
              checked={dontShow}
              onChange={(e) => setDontShow(e.target.checked)}
            />
            <span>Silence transmissions</span>
          </label>
          <button className="tip-modal-cta" onClick={dismiss}>
            Engage
          </button>
        </div>
      </div>
    </div>
  )
}
