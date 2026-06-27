import type React from 'react'

type Kind = 'tag' | 'count' | 'env' | 'status' | 'mono'

interface Props {
  kind?: Kind
  active?: boolean
  intent?: 'neutral' | 'success' | 'warning' | 'danger' | 'info' | 'magenta'
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

/** Pick a color intent based on a tag string. `prod` → danger-tinted,
 *  `dev`/`test` → info, `couchbase`/`db` → magenta, otherwise neutral. */
export function intentForTag(tag: string): NonNullable<Props['intent']> {
  const t = tag.toLowerCase()
  if (t === 'prod' || t === 'production') return 'danger'
  if (t === 'test' || t === 'staging') return 'warning'
  if (t === 'dev' || t === 'development') return 'info'
  if (t === 'couchbase' || t === 'db' || t === 'database') return 'magenta'
  if (t === 'app' || t === 'admin') return 'success'
  return 'neutral'
}
