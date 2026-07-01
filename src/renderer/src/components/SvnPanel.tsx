import { useEffect, useState } from 'react'
import { CodeEditor } from './Editor'

interface Props {
  repoPath: string
  onOpenLog: (log: string) => void
}

interface SvnStatusEntry {
  path: string
  status: string
  revision: number | null
}

interface SvnLogEntry {
  revision: number
  author: string
  date: string
  message: string
}

const STATUS_BADGE: Record<string, string> = {
  modified: 'M',
  added: 'A',
  deleted: 'D',
  unversioned: '?',
  conflicted: '!',
  missing: '–',
  replaced: 'R',
  normal: ' '
}

export default function SvnPanel({ repoPath, onOpenLog }: Props): React.JSX.Element {
  const [files, setFiles] = useState<SvnStatusEntry[]>([])
  const [info, setInfo] = useState<{ url: string; revision: number; author: string | null } | null>(
    null
  )
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [selectedFile, setSelectedFile] = useState<string | null>(null)
  const [diff, setDiff] = useState('')
  const [commitMsg, setCommitMsg] = useState('')
  const [busy, setBusy] = useState(false)
  const [view, setView] = useState<'changes' | 'history'>('changes')
  const [log, setLog] = useState<SvnLogEntry[]>([])

  const refresh = async (): Promise<void> => {
    try {
      const [s, i] = await Promise.all([
        window.api.svn.status(repoPath),
        window.api.svn.info(repoPath)
      ])
      setFiles((s as { files: SvnStatusEntry[] }).files)
      setInfo(i as { url: string; revision: number; author: string | null })
    } catch (e) {
      onOpenLog((e as Error).message)
    }
  }

  useEffect(() => {
    void refresh()
  }, [repoPath])

  useEffect(() => {
    if (!selectedFile) {
      setDiff('')
      return
    }
    void (async () => {
      try {
        const d = (await window.api.svn.diff(repoPath, selectedFile)) as string
        setDiff(d)
      } catch (e) {
        setDiff(`error: ${(e as Error).message}`)
      }
    })()
  }, [selectedFile, repoPath])

  const toggle = (path: string): void =>
    setSelected((s) => {
      const next = new Set(s)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })

  const commit = async (): Promise<void> => {
    if (!commitMsg.trim()) return
    setBusy(true)
    try {
      const r = (await window.api.svn.commit(repoPath, commitMsg.trim(), [...selected])) as string
      onOpenLog(r)
      setCommitMsg('')
      setSelected(new Set())
      await refresh()
    } catch (e) {
      alert((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const update = async (): Promise<void> => {
    setBusy(true)
    try {
      const r = (await window.api.svn.update(repoPath)) as string
      onOpenLog(r)
      await refresh()
    } catch (e) {
      alert((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const revert = async (path: string): Promise<void> => {
    if (!confirm(`Revert ${path}?`)) return
    await window.api.svn.revert(repoPath, [path])
    await refresh()
  }

  const addFile = async (path: string): Promise<void> => {
    await window.api.svn.add(repoPath, [path])
    await refresh()
  }

  const openLog = async (): Promise<void> => {
    const entries = (await window.api.svn.log(repoPath)) as SvnLogEntry[]
    setLog(entries)
    setView('history')
  }

  return (
    <>
      <div className="vcs-tabs">
        <div
          className={`vt ${view === 'changes' ? 'active' : ''}`}
          onClick={() => setView('changes')}
        >
          Changes
        </div>
        <div className={`vt ${view === 'history' ? 'active' : ''}`} onClick={() => void openLog()}>
          History
        </div>
      </div>
      <div className="vcs-body">
        {view === 'changes' ? (
          <>
            <div style={{ color: 'var(--text-dim)', fontSize: 11 }}>
              {info ? `r${info.revision} — ${info.url}` : ''}
            </div>
            <div className="vcs-actions">
              <button onClick={update} disabled={busy}>
                Update
              </button>
              <button onClick={refresh} disabled={busy}>
                Refresh
              </button>
            </div>

            <div className="vcs-section-title">Changes ({files.length})</div>
            {files.map((f) => {
              const badge = STATUS_BADGE[f.status] ?? f.status[0]?.toUpperCase() ?? '?'
              return (
                <div key={f.path} className="vcs-file" onClick={() => setSelectedFile(f.path)}>
                  <input
                    type="checkbox"
                    checked={selected.has(f.path)}
                    onChange={(e) => {
                      e.stopPropagation()
                      toggle(f.path)
                    }}
                    onClick={(e) => e.stopPropagation()}
                  />
                  <span className={`badge ${badge}`}>{badge}</span>
                  <span className="name">{f.path}</span>
                  {f.status === 'unversioned' && (
                    <button
                      style={{ padding: '0 4px' }}
                      onClick={(e) => {
                        e.stopPropagation()
                        void addFile(f.path)
                      }}
                    >
                      Add
                    </button>
                  )}
                  {f.status !== 'unversioned' && (
                    <button
                      className="danger"
                      style={{ padding: '0 4px' }}
                      onClick={(e) => {
                        e.stopPropagation()
                        void revert(f.path)
                      }}
                    >
                      ↺
                    </button>
                  )}
                </div>
              )
            })}

            <div className="vcs-commit">
              <textarea
                placeholder="Commit message"
                value={commitMsg}
                onChange={(e) => setCommitMsg(e.target.value)}
              />
              <div className="row" style={{ justifyContent: 'flex-end' }}>
                <button
                  className="primary"
                  onClick={commit}
                  disabled={busy || !commitMsg.trim() || selected.size === 0}
                >
                  Commit ({selected.size})
                </button>
              </div>
            </div>

            {selectedFile && diff && (
              <>
                <div className="vcs-section-title">Diff: {selectedFile}</div>
                <div style={{ height: 300, border: '1px solid var(--border)' }}>
                  <CodeEditor value={diff} language="diff" readOnly />
                </div>
              </>
            )}
          </>
        ) : (
          <div>
            <button onClick={() => setView('changes')} style={{ marginBottom: 8 }}>
              ← Back to changes
            </button>
            {log.map((e) => (
              <div
                key={e.revision}
                style={{
                  padding: '4px 0',
                  borderBottom: '1px solid var(--border)',
                  fontFamily: 'var(--font-mono)',
                  fontSize: 11
                }}
              >
                <div style={{ color: 'var(--yellow)' }}>r{e.revision}</div>
                <div style={{ color: 'var(--text)' }}>{e.message}</div>
                <div style={{ color: 'var(--text-dim)' }}>
                  {e.author} — {e.date}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  )
}
