import { useState } from 'react'
import type { Snippet } from '../../../shared/types'
import Modal from './Modal'

interface Props {
  initial: Snippet | null
  onSave: (
    title: string,
    body: string,
    hostFilter: string | null,
    confirmBeforeRun: boolean
  ) => Promise<void>
  onCancel: () => void
  onDelete?: () => Promise<void>
}

export default function SnippetForm({
  initial,
  onSave,
  onCancel,
  onDelete
}: Props): React.JSX.Element {
  const [title, setTitle] = useState(initial?.title ?? '')
  const [body, setBody] = useState(initial?.body ?? '')
  const [hostFilter, setHostFilter] = useState(initial?.hostFilter ?? '')
  const [confirmBeforeRun, setConfirmBeforeRun] = useState(initial?.confirmBeforeRun ?? false)
  const [saving, setSaving] = useState(false)

  const submit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault()
    if (!title.trim() || !body.trim()) return
    setSaving(true)
    try {
      await onSave(title.trim(), body.trim(), hostFilter.trim() || null, confirmBeforeRun)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal onClose={onCancel}>
      <form className="dialog" onSubmit={(e) => void submit(e)}>
        <h2>{initial ? 'Edit snippet' : 'New snippet'}</h2>

        <div className="col">
          <label>Title</label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Restart services"
            autoFocus
            required
          />
        </div>

        <div className="col">
          <label>Command</label>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="e.g. sudo systemctl restart nginx"
            rows={4}
            style={{ resize: 'vertical', fontFamily: 'monospace', fontSize: 12 }}
            required
          />
        </div>

        <div className="col">
          <label>Host filter (optional tag or host name)</label>
          <input
            value={hostFilter}
            onChange={(e) => setHostFilter(e.target.value)}
            placeholder="e.g. production"
          />
        </div>

        <label
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            margin: '0 0 10px',
            cursor: 'pointer',
            fontSize: 'var(--fs-sm)'
          }}
        >
          <input
            type="checkbox"
            checked={confirmBeforeRun}
            onChange={(e) => setConfirmBeforeRun(e.target.checked)}
            style={{ margin: 0 }}
          />
          <span>
            Require confirmation before inserting{' '}
            <span style={{ opacity: 0.5 }}>(for destructive or critical commands)</span>
          </span>
        </label>

        <div className="dialog-actions">
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
          <button type="button" onClick={onCancel}>
            Cancel
          </button>
          <button
            type="submit"
            className="primary"
            disabled={saving || !title.trim() || !body.trim()}
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
