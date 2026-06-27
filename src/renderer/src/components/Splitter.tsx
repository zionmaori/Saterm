import { useCallback, useEffect, useRef } from 'react'

interface Props {
  /** Which dimension the handle scrubs. */
  axis: 'horizontal' | 'vertical'
  /** Current size in px of the pane being resized. */
  size: number
  /** Called as the user drags; receives the new pixel size, clamped. */
  onSize: (px: number) => void
  /** Hard min/max in px. */
  min?: number
  max?: number
  /**
   * Resize direction. By default a vertical handle (axis: vertical) grows the
   * pane *above* the handle as you drag down. Set inverse=true to grow the
   * pane *below* / to the right.
   */
  inverse?: boolean
  /** Optional label for screen readers. */
  ariaLabel?: string
}

/**
 * A 4px-thick draggable handle. Vertical axis = horizontal handle (drag up/down
 * to resize the row above it). Horizontal axis = vertical handle (drag left/
 * right to resize the column to the left of it).
 */
export default function Splitter({
  axis,
  size,
  onSize,
  min = 80,
  max = 4000,
  inverse = false,
  ariaLabel
}: Props): React.JSX.Element {
  const dragging = useRef<{ start: number; origin: number } | null>(null)

  const onMove = useCallback(
    (e: PointerEvent) => {
      const d = dragging.current
      if (!d) return
      const cursor = axis === 'vertical' ? e.clientY : e.clientX
      const delta = (cursor - d.start) * (inverse ? -1 : 1)
      const next = Math.max(min, Math.min(max, d.origin + delta))
      onSize(next)
    },
    [axis, inverse, min, max, onSize]
  )

  const onUp = useCallback(() => {
    dragging.current = null
    document.body.style.cursor = ''
    document.body.style.userSelect = ''
    window.removeEventListener('pointermove', onMove)
    window.removeEventListener('pointerup', onUp)
  }, [onMove])

  const onDown = (e: React.PointerEvent): void => {
    e.preventDefault()
    dragging.current = {
      start: axis === 'vertical' ? e.clientY : e.clientX,
      origin: size
    }
    document.body.style.cursor = axis === 'vertical' ? 'row-resize' : 'col-resize'
    document.body.style.userSelect = 'none'
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  useEffect(
    () => () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    },
    [onMove, onUp]
  )

  return (
    <div
      role="separator"
      aria-orientation={axis === 'vertical' ? 'horizontal' : 'vertical'}
      aria-label={ariaLabel}
      onPointerDown={onDown}
      onDoubleClick={() => onSize(axis === 'vertical' ? 220 : 240)}
      className={`splitter splitter-${axis}`}
      title="Drag to resize · double-click to reset"
    />
  )
}
