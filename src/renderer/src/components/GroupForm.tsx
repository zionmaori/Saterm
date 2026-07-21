import { useMemo, useState } from 'react'
import type { Host } from '../../../shared/types'
import Modal from './Modal'

interface Props {
  hosts: Host[]
  existingGroups: string[]
  onCancel: () => void
  onSave: (group: string, hostIds: number[]) => Promise<void>
}

export default function GroupForm({
  hosts,
  existingGroups,
  onCancel,
  onSave
}: Props): React.JSX.Element {
  const [group, setGroup] = useState('')
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [busy, setBusy] = useState(false)

  const trimmed = group.trim()
  const conflict = trimmed && existingGroups.some((g) => g.toLowerCase() === trimmed.toLowerCase())

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return hosts
    return hosts.filter(
      (h) =>
        h.name.toLowerCase().includes(q) ||
        h.hostname.toLowerCase().includes(q) ||
        (h.group ?? '').toLowerCase().includes(q)
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
    if (!trimmed) return
    setBusy(true)
    try {
      await onSave(trimmed, Array.from(selected))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal onClose={onCancel}>
      <form className="dialog" onSubmit={submit} style={{ minWidth: 440 }}>
        <h2>New group</h2>
        <div className="col">
          <label>Group name</label>
          <input
            value={group}
            onChange={(e) => setGroup(e.target.value)}
            placeholder="e.g. eu-prod"
            autoFocus
          />
          {trimmed && conflict && (
            <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 2 }}>
              Group already exists — selected hosts will be reassigned to it.
            </div>
          )}
        </div>

        <div className="col">
          <label>Assign hosts to this group</label>
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
                  {h.group ? `now: ${h.group}` : `${h.user}@${h.hostname}`}
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
            disabled={busy || !trimmed || selected.size === 0}
            title={
              !trimmed
                ? 'Enter a group name'
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
