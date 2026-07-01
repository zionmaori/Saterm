import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useApp } from '../store/app'
import type { BugTabContext } from '../../../shared/types'

interface Props {
  onClose: () => void
}

export default function BugReportDialog({ onClose }: Props): React.JSX.Element {
  const tabs = useApp((s) => s.tabs)
  const hosts = useApp((s) => s.hosts)
  const projects = useApp((s) => s.projects)
  const activeTabId = useApp((s) => s.activeTabId)
  const activeTab = tabs.find((t) => t.id === activeTabId) ?? null

  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [includeContext, setIncludeContext] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [doneMsg, setDoneMsg] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const baseCtx = useMemo<Omit<BugTabContext, 'appVersion' | 'platform'> | null>(() => {
    if (!activeTab) return null
    const host = activeTab.hostId ? (hosts.find((h) => h.id === activeTab.hostId) ?? null) : null
    const project = activeTab.projectId
      ? (projects.find((p) => p.id === activeTab.projectId) ?? null)
      : null
    return {
      kind: activeTab.kind,
      title: activeTab.title,
      hostName: host?.name ?? null,
      projectPath: project?.path ?? null
    }
  }, [activeTab, hosts, projects])

  const submitRef = useRef<() => Promise<void>>(async () => {})

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        onClose()
      } else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
        void submitRef.current()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const submit = useCallback(async (): Promise<void> => {
    if (submitting) return
    const t = title.trim()
    const d = description.trim()
    if (!t || !d) return
    setSubmitting(true)
    setError(null)
    try {
      let context: BugTabContext | null = null
      if (includeContext && baseCtx) {
        const [appVersion, platform] = await Promise.all([
          window.api.app.version(),
          window.api.app.platform()
        ])
        context = { ...baseCtx, appVersion, platform }
      } else if (includeContext) {
        const [appVersion, platform] = await Promise.all([
          window.api.app.version(),
          window.api.app.platform()
        ])
        context = {
          kind: null,
          title: null,
          hostName: null,
          projectPath: null,
          appVersion,
          platform
        }
      }
      const res = await window.api.bugs.report({ title: t, description: d, context })
      setDoneMsg(`Saved to ${res.path}`)
      setTitle('')
      setDescription('')
      setTimeout(() => onClose(), 900)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSubmitting(false)
    }
  }, [submitting, title, description, includeContext, baseCtx, onClose])

  useEffect(() => {
    submitRef.current = submit
  }, [submit])

  return (
    <div
      className="dialog-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <form
        className="dialog"
        style={{ minWidth: 460, maxWidth: 640 }}
        onSubmit={(e) => {
          e.preventDefault()
          void submit()
        }}
      >
        <h2>Report a bug</h2>

        <div className="col">
          <label>Title</label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="One-line summary"
            autoFocus
            required
          />
        </div>

        <div className="col">
          <label>What happened?</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Steps to reproduce, expected vs. actual, anything else useful…"
            rows={6}
            style={{ resize: 'vertical', fontFamily: 'inherit' }}
            required
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
            checked={includeContext}
            onChange={(e) => setIncludeContext(e.target.checked)}
            style={{ margin: 0 }}
          />
          <span>
            Include current tab context
            {baseCtx && (
              <span style={{ opacity: 0.6, marginLeft: 6, fontSize: 11 }}>
                ({baseCtx.kind}
                {baseCtx.title ? ` / ${baseCtx.title}` : ''})
              </span>
            )}
          </span>
        </label>

        {error && (
          <div style={{ color: 'var(--danger, #ef4444)', marginBottom: 10, fontSize: 12 }}>
            {error}
          </div>
        )}
        {doneMsg && (
          <div style={{ color: 'var(--ok, #10b981)', marginBottom: 10, fontSize: 12 }}>
            {doneMsg}
          </div>
        )}

        <div className="row" style={{ justifyContent: 'flex-end', gap: 8 }}>
          <span style={{ flex: 1, fontSize: 11, opacity: 0.5 }}>⌘/Ctrl + Enter to submit</span>
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button
            type="submit"
            className="primary"
            disabled={submitting || !title.trim() || !description.trim()}
          >
            {submitting ? 'Saving…' : 'Submit'}
          </button>
        </div>
      </form>
    </div>
  )
}
