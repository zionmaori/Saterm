import { useMemo, useState } from 'react'
import type { Host } from '../../../shared/types'
import Modal from './Modal'

interface Props {
  hosts: Host[]
  existingTags: string[]
  onCancel: () => void
  onSave: (tag: string, hostIds: number[]) => Promise<void>
}

const normalize = (t: string): string =>
  t.trim().toLowerCase().replace(/^#/, '').replace(/\s+/g, '-').slice(0, 64)

export default function TagForm({
  hosts,
  existingTags,
  onCancel,
  onSave
}: Props): React.JSX.Element {
  const [tag, setTag] = useState('')
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [busy, setBusy] = useState(false)

  const normalized = normalize(tag)
  const conflict = normalized && existingTags.includes(normalized)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return hosts
    return hosts.filter(
      (h) =>
        h.name.toLowerCase().includes(q) ||
        h.hostname.toLowerCase().includes(q) ||
        h.tags.some((t) => t.includes(q))
    )
  }, [hosts, query])

  const toggle = (id: number): void => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }
  const selectAll = (): void => setSelected(new Set(filtered.map((h) => h.id)))
  const clearAll = (): void => setSelected(new Set())

  const submit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault()
    if (!normalized) return
    setBusy(true)
    try {
      await onSave(normalized, Array.from(selected))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal onClose={onCancel}>
      <form className="dialog" onSubmit={submit} style={{ minWidth: 440 }}>
        <h2>New tag</h2>
        <div className="col">
          <label>Tag name</label>
          <input
            value={tag}
            onChange={(e) => setTag(e.target.value)}
            placeholder="e.g. staging"
            autoFocus
          />
          {tag && (
            <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 2 }}>
              Will be saved as <code>#{normalized}</code>
              {conflict ? ' — tag already exists (adds to hosts below)' : ''}
            </div>
          )}
        </div>

        <div className="col">
          <label>Apply to hosts</label>
          <div className="row" style={{ gap: 6, marginBottom: 6 }}>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Filter hosts…"
              style={{ flex: 1 }}
            />
            <button type="button" onClick={selectAll}>
              All ({filtered.length})
            </button>
            <button type="button" onClick={clearAll}>
              None
            </button>
          </div>
          <div
            style={{
              maxHeight: 240,
              overflowY: 'auto',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-sm)',
              padding: 4,
              background: 'var(--bg-1)'
            }}
          >
            {filtered.length === 0 && (
              <div style={{ padding: 12, color: 'var(--text-dim)', fontSize: 12 }}>
                No hosts match.
              </div>
            )}
            {filtered.map((h) => (
              <label
                key={h.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '4px 6px',
                  borderRadius: 3,
                  cursor: 'pointer',
                  fontSize: 12
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-3)')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
              >
                <input
                  type="checkbox"
                  checked={selected.has(h.id)}
                  onChange={() => toggle(h.id)}
                  style={{ margin: 0 }}
                />
                <span style={{ flex: 1 }}>{h.name}</span>
                <span style={{ color: 'var(--text-dimer)', fontSize: 11 }}>
                  {h.user}@{h.hostname}
                </span>
              </label>
            ))}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 4 }}>
            {selected.size} host{selected.size === 1 ? '' : 's'} selected
          </div>
        </div>

        <div className="dialog-actions">
          <button type="button" onClick={onCancel}>
            Cancel
          </button>
          <button
            type="submit"
            className="primary"
            disabled={busy || !normalized || selected.size === 0}
            title={
              !normalized
                ? 'Enter a tag name'
                : selected.size === 0
                  ? 'Select at least one host'
                  : ''
            }
          >
            Save
          </button>
        </div>
      </form>
    </Modal>
  )
}
