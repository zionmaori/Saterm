import { useEffect, useRef, useState } from 'react'

interface Props {
  projectId?: number
}

type Scope = 'global' | 'project'

const GLOBAL_KEY = 'notes.global'
const SCOPE_PREF_KEY = 'notes.scope'

export default function ProjectNotesPanel({ projectId }: Props): React.JSX.Element {
  const [scope, setScope] = useState<Scope>('global')
  const [value, setValue] = useState('')
  const [loaded, setLoaded] = useState(false)
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved'>('idle')
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const savedFlashTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const key = scope === 'project' && projectId != null
    ? `project.notes:${projectId}`
    : GLOBAL_KEY

  useEffect(() => {
    let cancelled = false
    void window.api.kv.get(SCOPE_PREF_KEY).then((s) => {
      if (cancelled) return
      setScope(s === 'project' && projectId != null ? 'project' : 'global')
    })
    return () => { cancelled = true }
  }, [projectId])

  useEffect(() => {
    let cancelled = false
    setLoaded(false)
    void window.api.kv.getJSON<{ text: string }>(key).then((saved) => {
      if (cancelled) return
      setValue(saved?.text ?? '')
      setLoaded(true)
    })
    return () => {
      cancelled = true
    }
  }, [key])

  useEffect(() => {
    if (!loaded) return
    setStatus('saving')
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      void window.api.kv.setJSON(key, { text: value }).then(() => {
        setStatus('saved')
        if (savedFlashTimer.current) clearTimeout(savedFlashTimer.current)
        savedFlashTimer.current = setTimeout(() => setStatus('idle'), 1200)
      })
    }, 500)
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current)
    }
  }, [value, key, loaded])

  const switchScope = (s: Scope): void => {
    if (s === 'project' && projectId == null) return
    setScope(s)
    void window.api.kv.set(SCOPE_PREF_KEY, s)
  }

  return (
    <div className="vcs-body" style={{ display: 'flex', flexDirection: 'column', minHeight: 0, flex: 1, padding: 0 }}>
      <div className="notes-scope">
        <button
          type="button"
          className={`notes-scope-btn ${scope === 'global' ? 'active' : ''}`}
          onClick={() => switchScope('global')}
        >
          Global
        </button>
        <button
          type="button"
          className={`notes-scope-btn ${scope === 'project' ? 'active' : ''}`}
          onClick={() => switchScope('project')}
          disabled={projectId == null}
          title={projectId == null ? 'Open a project to use project-specific notes' : undefined}
        >
          This project
        </button>
      </div>
      <textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={
          scope === 'global'
            ? 'Global notes — shared across every project. Saved automatically.'
            : 'Notes for this project only. Saved automatically.'
        }
        spellCheck={false}
        style={{
          flex: 1,
          minHeight: 0,
          width: '100%',
          resize: 'none',
          background: 'transparent',
          color: 'inherit',
          border: 'none',
          outline: 'none',
          padding: '10px 12px',
          fontFamily: 'var(--mono, monospace)',
          fontSize: 12,
          lineHeight: 1.5
        }}
      />
      <div
        style={{
          fontSize: 11,
          padding: '4px 12px',
          opacity: 0.55,
          borderTop: '1px solid var(--border)',
          textAlign: 'right'
        }}
      >
        {status === 'saving' && 'Saving…'}
        {status === 'saved' && 'Saved'}
        {status === 'idle' && (loaded ? ' ' : 'Loading…')}
      </div>
    </div>
  )
}
