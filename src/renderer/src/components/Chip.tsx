import type React from 'react'
import type { ChipIntent } from './chipIntent'

type Kind = 'tag' | 'count' | 'env' | 'status' | 'mono'

interface Props {
  kind?: Kind
  active?: boolean
  intent?: ChipIntent
  onClick?: (e: React.MouseEvent) => void
  onContextMenu?: (e: React.MouseEvent) => void
  title?: string
  children: React.ReactNode
}

/** Tiny reusable pill. Kinds differ in font + decoration; intent picks color. */
export default function Chip({
  kind = 'tag',
  active = false,
  intent = 'neutral',
  onClick,
  onContextMenu,
  title,
  children
}: Props): React.JSX.Element {
  const className = [
    'chip',
    `chip-${kind}`,
    `chip-${intent}`,
    active ? 'chip-active' : '',
    onClick ? 'chip-clickable' : ''
  ]
    .filter(Boolean)
    .join(' ')
  return (
    <span
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      className={className}
      onClick={onClick}
      onContextMenu={onContextMenu}
      onKeyDown={(e) => {
        if (onClick && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault()
          onClick(e as unknown as React.MouseEvent)
        }
      }}
      title={title}
    >
      {children}
    </span>
  )
}
