import { useEffect, useMemo, useRef, useState } from 'react'
import { Eye, Pencil } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

interface Props {
  projectId?: number
}

type Scope = 'global' | 'project'
type Mode = 'edit' | 'preview'

const GLOBAL_KEY = 'notes.global'
const SCOPE_PREF_KEY = 'notes.scope'
const MODE_PREF_KEY = 'notes.mode'

interface Section {
  heading: string | null
  body: string
}

/** Split markdown text into sections at `##` headings, preserving order. */
function splitSections(text: string): Section[] {
  if (!text.trim()) return []
  const lines = text.split('\n')
  const sections: Section[] = []
  let current: Section = { heading: null, body: '' }
  for (const line of lines) {
    const m = /^##\s+(.+?)\s*$/.exec(line)
    if (m) {
      if (current.heading != null || current.body.trim()) sections.push(current)
      current = { heading: m[1], body: '' }
    } else {
      current.body += (current.body ? '\n' : '') + line
    }
  }
  if (current.heading != null || current.body.trim()) sections.push(current)
  return sections
}

export default function ProjectNotesPanel({ projectId }: Props): React.JSX.Element {
  const [scope, setScope] = useState<Scope>('global')
  const [mode, setMode] = useState<Mode>('edit')
  const [value, setValue] = useState('')
  const [loaded, setLoaded] = useState(false)
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved'>('idle')
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const savedFlashTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const key = scope === 'project' && projectId != null ? `project.notes:${projectId}` : GLOBAL_KEY

  useEffect(() => {
    let cancelled = false
    void window.api.kv.get(SCOPE_PREF_KEY).then((s) => {
      if (cancelled) return
      setScope(s === 'project' && projectId != null ? 'project' : 'global')
    })
    void window.api.kv.get(MODE_PREF_KEY).then((m) => {
      if (cancelled) return
      if (m === 'preview' || m === 'edit') setMode(m)
    })
    return () => {
      cancelled = true
    }
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

  const switchMode = (m: Mode): void => {
    setMode(m)
    void window.api.kv.set(MODE_PREF_KEY, m)
  }

  const sections = useMemo(() => (mode === 'preview' ? splitSections(value) : []), [mode, value])

  return (
    <div
      className="vcs-body notes-panel"
      style={{ display: 'flex', flexDirection: 'column', minHeight: 0, flex: 1, padding: 0 }}
    >
      <div className="notes-header">
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
        <div className="notes-mode-toggle">
          <button
            type="button"
            className={`notes-mode-btn ${mode === 'edit' ? 'active' : ''}`}
            onClick={() => switchMode('edit')}
            title="Edit (raw markdown)"
          >
            <Pencil size={11} />
          </button>
          <button
            type="button"
            className={`notes-mode-btn ${mode === 'preview' ? 'active' : ''}`}
            onClick={() => switchMode('preview')}
            title="Preview (rendered markdown)"
          >
            <Eye size={11} />
          </button>
        </div>
      </div>
      {mode === 'edit' ? (
        <textarea
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={
            scope === 'global'
              ? 'Global notes — markdown supported. Use ## Heading to group sections. Saved automatically.'
              : 'Project notes — markdown supported. Use ## Heading to group sections. Saved automatically.'
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
      ) : (
        <div className="notes-preview">
          {sections.length === 0 ? (
            <div className="notes-preview-empty">Nothing to preview yet.</div>
          ) : sections.length === 1 && sections[0].heading == null ? (
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{sections[0].body}</ReactMarkdown>
          ) : (
            sections.map((sec, i) =>
              sec.heading == null ? (
                <ReactMarkdown key={i} remarkPlugins={[remarkGfm]}>
                  {sec.body}
                </ReactMarkdown>
              ) : (
                <details key={i} open>
                  <summary>{sec.heading}</summary>
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{sec.body}</ReactMarkdown>
                </details>
              )
            )
          )}
        </div>
      )}
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
