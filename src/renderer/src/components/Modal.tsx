import { useEffect } from 'react'
import { createPortal } from 'react-dom'

interface Props {
  onClose: () => void
  children: React.ReactNode
  closeOnEsc?: boolean
}

// Renders a full-screen dialog backdrop into document.body via a portal so
// dialogs escape any ancestor that establishes a containing block (e.g. the
// sidebar's backdrop-filter) and land centered on the viewport.
export default function Modal({ onClose, children, closeOnEsc = true }: Props): React.JSX.Element {
  useEffect(() => {
    if (!closeOnEsc) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [closeOnEsc, onClose])

  return createPortal(
    <div
      className="dialog-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      {children}
    </div>,
    document.body
  )
}
