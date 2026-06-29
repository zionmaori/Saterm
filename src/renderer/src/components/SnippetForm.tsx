import { useState } from 'react'
import type { Snippet } from '../../../shared/types'

interface Props {
  initial: Snippet | null
  onSave: (title: string, body: string, hostFilter: string | null) => Promise<void>
  onCancel: () => void
  onDelete?: () => Promise<void>
}

export default function SnippetForm({ initial, onSave, onCancel, onDelete }: Props): React.JSX.Element {
  const [title, setTitle] = useState(initial?.title ?? '')
  const [body, setBody] = useState(initial?.body ?? '')
  const [hostFilter, setHostFilter] = useState(initial?.hostFilter ?? '')
  const [saving, setSaving] = useState(false)

  const submit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault()
    if (!title.trim() || !body.trim()) return
    setSaving(true)
    try {
      await onSave(title.trim(), body.trim(), hostFilter.trim() || null)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="host-form-backdrop" onClick={onCancel}>
      <form
        className="host-form"
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => void submit(e)}
      >
        <div className="host-form-title">{initial ? 'Edit snippet' : 'New snippet'}</div>

        <label className="host-form-label">
          Title
          <input
            className="host-form-input"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Restart services"
            autoFocus
            required
          />
        </label>

        <label className="host-form-label">
          Command
          <textarea
            className="host-form-input"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="e.g. sudo systemctl restart nginx"
            rows={4}
            style={{ resize: 'vertical', fontFamily: 'monospace', fontSize: 12 }}
            required
          />
        </label>

        <label className="host-form-label">
          Host filter <span style={{ opacity: 0.5, fontWeight: 400 }}>(optional tag or host name)</span>
          <input
            className="host-form-input"
            value={hostFilter}
            onChange={(e) => setHostFilter(e.target.value)}
            placeholder="e.g. production"
          />
        </label>

        <div className="host-form-actions">
          {onDelete && (
            <button
              type="button"
              className="danger"
              onClick={() => void onDelete()}
              style={{ marginRight: 'auto' }}
            >
              Delete
            </button>
          )}
          <button type="button" onClick={onCancel}>Cancel</button>
          <button type="submit" className="primary" disabled={saving || !title.trim() || !body.trim()}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </form>
    </div>
  )
}
