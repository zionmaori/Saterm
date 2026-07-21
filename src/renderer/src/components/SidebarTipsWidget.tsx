import { useEffect, useMemo, useState } from 'react'
import { ChevronRight, RefreshCw, Sparkles } from 'lucide-react'
import { categoryLabel, contextualTip } from '../lib/tips'
import { useTipContext } from '../lib/useTipContext'

const COLLAPSE_KEY = 'sidebar.tips.collapsed'
const ROTATE_MS = 45_000

export default function SidebarTipsWidget(): React.JSX.Element {
  const ctx = useTipContext()
  const [seed, setSeed] = useState<number>(() => Math.floor(Math.random() * 1000))
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem(COLLAPSE_KEY) === 'true'
    } catch {
      return false
    }
  })

  useEffect(() => {
    if (collapsed) return
    const t = window.setInterval(() => setSeed((s) => s + 1), ROTATE_MS)
    return () => window.clearInterval(t)
  }, [collapsed])

  const toggle = (): void => {
    setCollapsed((c) => {
      const next = !c
      try {
        localStorage.setItem(COLLAPSE_KEY, String(next))
      } catch {
        /* noop */
      }
      return next
    })
  }

  const tip = useMemo(() => contextualTip(ctx, seed), [ctx, seed])

  if (collapsed) {
    return (
      <div className="tips-widget tips-widget-collapsed">
        <button className="tips-widget-toggle" onClick={toggle} title="Show tips">
          <Sparkles size={12} strokeWidth={2} />
          <span>Tips</span>
          <ChevronRight size={12} className="tips-widget-chev" />
        </button>
      </div>
    )
  }

  return (
    <div className="tips-widget">
      <div className="tips-widget-header">
        <div className="tips-widget-title">
          <Sparkles size={11} strokeWidth={2} />
          <span>Nav computer</span>
        </div>
        <div className="tips-widget-actions">
          <button
            className="tips-widget-icon"
            onClick={() => setSeed((s) => s + 1)}
            title="Next tip"
          >
            <RefreshCw size={11} strokeWidth={2} />
          </button>
          <button className="tips-widget-icon" onClick={toggle} title="Hide">
            <span className="tips-widget-chev-down">−</span>
          </button>
        </div>
      </div>
      <div className="tips-widget-body">
        <div className="tips-widget-cat">{categoryLabel(tip.category)}</div>
        <div className="tips-widget-headline">{tip.title}</div>
        <div className="tips-widget-text">{tip.body}</div>
      </div>
    </div>
  )
}
