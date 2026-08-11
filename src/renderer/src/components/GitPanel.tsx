import { useCallback, useEffect, useRef, useState } from 'react'

interface Props {
  repoPath: string
  onOpenLog: (log: string) => void
  onOpenDiff: (path: string, staged: boolean) => void
  view: ViewMode
  onViewChange: (view: ViewMode) => void
}

interface GitStatus {
  current: string | null
  tracking: string | null
  ahead: number
  behind: number
  files: { path: string; index: string; workingDir: string }[]
  conflicted: string[]
}

interface GitLogEntry {
  hash: string
  date: string
  message: string
  author: string
  refs: string
}

export type ViewMode = 'changes' | 'history' | 'tags'

export default function GitPanel({
  repoPath,
  onOpenLog,
  onOpenDiff,
  view,
  onViewChange
}: Props): React.JSX.Element {
  const [status, setStatus] = useState<GitStatus | null>(null)
  const [branches, setBranches] = useState<{ current: string; all: string[] }>({
    current: '',
    all: []
  })
  const [loadError, setLoadError] = useState<string | null>(null)
  const [commitMsg, setCommitMsg] = useState('')
  const [amend, setAmend] = useState(false)
  const [busy, setBusy] = useState(false)
  const [log, setLog] = useState<GitLogEntry[]>([])
  const [tags, setTags] = useState<string[]>([])
  const [newTag, setNewTag] = useState('')
  const [tagMsg, setTagMsg] = useState('')
  const historyLoadedRef = useRef(false)
  const tagsLoadedRef = useRef(false)

  const refresh = useCallback(async (): Promise<void> => {
    try {
      const [s, b] = await Promise.all([
        window.api.git.status(repoPath),
        window.api.git.branches(repoPath)
      ])
      setStatus(s as GitStatus)
      setBranches(b as { current: string; all: string[] })
      setLoadError(null)
    } catch (e) {
      console.error(e)
      setLoadError((e as Error).message || 'Failed to load git status')
    }
  }, [repoPath])

  useEffect(() => {
    void refresh()
    const id = setInterval(() => void refresh(), 5000)
    return () => clearInterval(id)
  }, [refresh])

  const openLog = useCallback(async (): Promise<void> => {
    const entries = (await window.api.git.log(repoPath)) as GitLogEntry[]
    setLog(entries)
  }, [repoPath])

  const openTags = useCallback(async (): Promise<void> => {
    const t = await window.api.git.listTags(repoPath)
    setTags(t)
  }, [repoPath])

  // Lazy-load list data the first time each subtab is opened after mount.
  useEffect(() => {
    if (view === 'history' && !historyLoadedRef.current) {
      historyLoadedRef.current = true
      void openLog()
    }
    if (view === 'tags' && !tagsLoadedRef.current) {
      tagsLoadedRef.current = true
      void openTags()
    }
  }, [view, openLog, openTags])

  if (!status) {
    return (
      <div className="empty">
        {loadError ? (
          <>
            Couldn&apos;t load git status: {loadError}
            <div>
              <button onClick={() => void refresh()}>Retry</button>
            </div>
          </>
        ) : (
          'Loading…'
        )}
      </div>
    )
  }

  const staged = status.files.filter((f) => f.index !== ' ' && f.index !== '?')
  const unstaged = status.files.filter((f) => f.workingDir !== ' ' && f.index !== '?')
  const untracked = status.files.filter((f) => f.index === '?')

  const fileBadge = (
    f: { index: string; workingDir: string },
    isStagedSection: boolean
  ): string => {
    const code = isStagedSection ? f.index : f.workingDir
    return code === ' ' || code === '?' ? '?' : code
  }

  const stage = async (file: string): Promise<void> => {
    await window.api.git.stage(repoPath, [file])
    await refresh()
  }
  const unstage = async (file: string): Promise<void> => {
    await window.api.git.unstage(repoPath, [file])
    await refresh()
  }
  const discard = async (file: string): Promise<void> => {
    if (!confirm(`Discard changes in ${file}?`)) return
    await window.api.git.discard(repoPath, [file])
    await refresh()
  }
  const stageAll = async (): Promise<void> => {
    const files = [...unstaged, ...untracked].map((f) => f.path)
    if (!files.length) return
    await window.api.git.stage(repoPath, files)
    await refresh()
  }
  const commit = async (stageEverythingFirst = false): Promise<void> => {
    if (!commitMsg.trim()) return
    setBusy(true)
    try {
      if (stageEverythingFirst) {
        const toStage = [...unstaged, ...untracked].map((f) => f.path)
        if (toStage.length) await window.api.git.stage(repoPath, toStage)
      }
      const result = await window.api.git.commit(repoPath, commitMsg.trim(), amend)
      onOpenLog(`commit ${(result as { commit: string })?.commit ?? '(ok)'}`)
      setCommitMsg('')
      setAmend(false)
      await refresh()
    } catch (e) {
      const msg = (e as Error).message || 'commit failed (no error message returned)'
      alert(`Commit failed: ${msg}`)
    } finally {
      setBusy(false)
    }
  }
  const doFetch = async (): Promise<void> => {
    setBusy(true)
    try {
      await window.api.git.fetch(repoPath)
      onOpenLog('fetched')
      await refresh()
    } catch (e) {
      alert((e as Error).message)
    } finally {
      setBusy(false)
    }
  }
  const doPull = async (): Promise<void> => {
    setBusy(true)
    try {
      const r = await window.api.git.pull(repoPath)
      onOpenLog(`pull: ${r}`)
      await refresh()
    } catch (e) {
      alert((e as Error).message)
    } finally {
      setBusy(false)
    }
  }
  const doPush = async (): Promise<void> => {
    setBusy(true)
    try {
      const r = await window.api.git.push(repoPath)
      onOpenLog(`push: ${r}`)
      await refresh()
    } catch (e) {
      alert((e as Error).message)
    } finally {
      setBusy(false)
    }
  }
  const checkout = async (branch: string): Promise<void> => {
    setBusy(true)
    try {
      await window.api.git.checkout(repoPath, branch, false)
      await refresh()
    } catch (e) {
      alert((e as Error).message)
    } finally {
      setBusy(false)
    }
  }
  const newBranch = async (): Promise<void> => {
    const name = prompt('New branch name')?.trim()
    if (!name) return
    setBusy(true)
    try {
      await window.api.git.checkout(repoPath, name, true)
      await refresh()
    } catch (e) {
      alert((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const goHistory = (): void => {
    onViewChange('history')
    void openLog()
  }
  const goTags = (): void => {
    onViewChange('tags')
    void openTags()
  }

  const createTag = async (): Promise<void> => {
    const tag = newTag.trim()
    if (!tag) return
    setBusy(true)
    try {
      await window.api.git.createTag(repoPath, tag, tagMsg.trim() || undefined)
      onOpenLog(`tag created: ${tag}`)
      setNewTag('')
      setTagMsg('')
      const t = await window.api.git.listTags(repoPath)
      setTags(t)
    } catch (e) {
      alert((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const pushTags = async (): Promise<void> => {
    setBusy(true)
    try {
      await window.api.git.pushTags(repoPath)
      onOpenLog('tags pushed — GitHub Actions will start building')
    } catch (e) {
      alert((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const deleteTag = async (tag: string): Promise<void> => {
    if (!confirm(`Delete local tag "${tag}"?`)) return
    setBusy(true)
    try {
      await window.api.git.deleteTag(repoPath, tag)
      setTags((prev) => prev.filter((t) => t !== tag))
    } catch (e) {
      alert((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <div className="vcs-tabs">
        <div
          className={`vt ${view === 'changes' ? 'active' : ''}`}
          onClick={() => onViewChange('changes')}
        >
          Changes
        </div>
        <div className={`vt ${view === 'history' ? 'active' : ''}`} onClick={goHistory}>
          History
        </div>
        <div className={`vt ${view === 'tags' ? 'active' : ''}`} onClick={goTags}>
          Tags
        </div>
      </div>
      <div className="vcs-body">
        {view === 'changes' ? (
          <>
            <div className="vcs-headerbar">
              <select
                className="vcs-branch-select"
                value={branches.current}
                onChange={(e) => void checkout(e.target.value)}
              >
                {branches.all.map((b) => (
                  <option key={b} value={b}>
                    {b}
                  </option>
                ))}
              </select>
              <button className="ghost vcs-newbranch" title="New branch" onClick={newBranch}>
                +
              </button>
              {status.ahead ? (
                <span
                  className="chip chip-mono chip-success"
                  title={`${status.ahead} ahead of ${status.tracking ?? 'upstream'}`}
                >
                  ↑{status.ahead}
                </span>
              ) : null}
              {status.behind ? (
                <span
                  className="chip chip-mono chip-warning"
                  title={`${status.behind} behind ${status.tracking ?? 'upstream'}`}
                >
                  ↓{status.behind}
                </span>
              ) : null}
              {status.tracking ? (
                <span className="vcs-tracking" title={`tracking ${status.tracking}`}>
                  → {status.tracking}
                </span>
              ) : null}
            </div>
            <div className="vcs-actions">
              <button onClick={doFetch} disabled={busy}>
                Fetch
              </button>
              <button onClick={doPull} disabled={busy}>
                Pull
              </button>
              <button onClick={doPush} disabled={busy}>
                Push
              </button>
            </div>

            {status.conflicted.length > 0 && (
              <>
                <div className="vcs-section-title">Conflicts</div>
                {status.conflicted.map((p) => (
                  <div key={p} className="vcs-file" onClick={() => onOpenDiff(p, false)}>
                    <span className="badge D">!</span>
                    <span className="name">{p}</span>
                  </div>
                ))}
              </>
            )}

            <div className="vcs-section-title">
              Staged ({staged.length}){' '}
              {staged.length > 0 && (
                <button
                  style={{ float: 'right', padding: '0 6px', fontSize: 10 }}
                  onClick={() =>
                    void window.api.git
                      .unstage(
                        repoPath,
                        staged.map((f) => f.path)
                      )
                      .then(refresh)
                  }
                >
                  Unstage all
                </button>
              )}
            </div>
            {staged.map((f) => (
              <div
                key={f.path}
                className="vcs-file"
                onClick={() => onOpenDiff(f.path, true)}
                title="Open diff in editor"
              >
                <span className={`badge ${fileBadge(f, true)}`}>{fileBadge(f, true)}</span>
                <span className="name">{f.path}</span>
                <button
                  style={{ padding: '0 4px' }}
                  onClick={(e) => {
                    e.stopPropagation()
                    void unstage(f.path)
                  }}
                >
                  −
                </button>
              </div>
            ))}

            <div className="vcs-section-title">
              Changes ({unstaged.length + untracked.length}){' '}
              {unstaged.length + untracked.length > 0 && (
                <button
                  style={{ float: 'right', padding: '0 6px', fontSize: 10 }}
                  onClick={stageAll}
                >
                  Stage all
                </button>
              )}
            </div>
            {[...unstaged, ...untracked].map((f) => (
              <div
                key={f.path}
                className="vcs-file"
                onClick={() => onOpenDiff(f.path, false)}
                title="Open diff in editor"
              >
                <span className={`badge ${fileBadge(f, false)}`}>{fileBadge(f, false)}</span>
                <span className="name">{f.path}</span>
                <button
                  style={{ padding: '0 4px' }}
                  onClick={(e) => {
                    e.stopPropagation()
                    void stage(f.path)
                  }}
                >
                  +
                </button>
                {f.index !== '?' && (
                  <button
                    className="danger"
                    style={{ padding: '0 4px' }}
                    onClick={(e) => {
                      e.stopPropagation()
                      void discard(f.path)
                    }}
                  >
                    ✕
                  </button>
                )}
              </div>
            ))}

            <div className="vcs-commit">
              <textarea
                placeholder="Commit message"
                value={commitMsg}
                onChange={(e) => setCommitMsg(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && !busy) {
                    e.preventDefault()
                    if (commitMsg.trim()) {
                      void commit(staged.length === 0)
                    }
                  }
                }}
              />
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <label style={{ color: 'var(--text-dim)', fontSize: 11 }}>
                  <input
                    type="checkbox"
                    checked={amend}
                    onChange={(e) => setAmend(e.target.checked)}
                  />{' '}
                  Amend
                </label>
                {staged.length === 0 && unstaged.length + untracked.length > 0 ? (
                  <button
                    className="primary"
                    onClick={() => void commit(true)}
                    disabled={busy || !commitMsg.trim()}
                    title="Stage every change and commit (⌘↵)"
                  >
                    Stage all &amp; commit
                  </button>
                ) : (
                  <button
                    className="primary"
                    onClick={() => void commit(false)}
                    disabled={busy || !commitMsg.trim() || staged.length === 0}
                    title={
                      staged.length === 0
                        ? 'Stage at least one file (click + next to a change) — or use ⌘↵ to stage all and commit'
                        : 'Commit staged files (⌘↵)'
                    }
                  >
                    Commit
                  </button>
                )}
              </div>
              {staged.length === 0 && unstaged.length + untracked.length === 0 && (
                <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>
                  Nothing to commit — working tree clean.
                </div>
              )}
            </div>
          </>
        ) : view === 'history' ? (
          <div>
            <button onClick={() => onViewChange('changes')} style={{ marginBottom: 8 }}>
              ← Back to changes
            </button>
            {log.map((e) => (
              <div
                key={e.hash}
                style={{
                  padding: '4px 0',
                  borderBottom: '1px solid var(--border)',
                  fontFamily: 'var(--font-mono)',
                  fontSize: 11
                }}
              >
                <div style={{ color: 'var(--yellow)' }}>
                  {e.hash.slice(0, 8)}{' '}
                  {e.refs && <span style={{ color: 'var(--green)' }}>{e.refs}</span>}
                </div>
                <div style={{ color: 'var(--text)' }}>{e.message}</div>
                <div style={{ color: 'var(--text-dim)' }}>
                  {e.author} — {e.date}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ padding: '8px 0' }}>
            <button onClick={() => onViewChange('changes')} style={{ marginBottom: 12 }}>
              ← Back to changes
            </button>

            <div className="vcs-section-title">Create tag</div>
            <div style={{ padding: '4px 8px', display: 'flex', flexDirection: 'column', gap: 6 }}>
              <input
                placeholder="Tag name (e.g. v1.0.8)"
                value={newTag}
                onChange={(e) => setNewTag(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !busy) void createTag()
                }}
                style={{ fontSize: 12 }}
              />
              <input
                placeholder="Message (optional — creates annotated tag)"
                value={tagMsg}
                onChange={(e) => setTagMsg(e.target.value)}
                style={{ fontSize: 12 }}
              />
              <div style={{ display: 'flex', gap: 6 }}>
                <button
                  className="primary"
                  onClick={() => void createTag()}
                  disabled={busy || !newTag.trim()}
                >
                  Create tag
                </button>
                <button
                  onClick={() => void pushTags()}
                  disabled={busy}
                  title="Push all local tags to origin — triggers GitHub Actions"
                >
                  Push tags →
                </button>
              </div>
            </div>

            <div className="vcs-section-title" style={{ marginTop: 12 }}>
              Local tags ({tags.length})
            </div>
            {tags.length === 0 ? (
              <div className="empty" style={{ fontSize: 11 }}>
                No tags yet.
              </div>
            ) : (
              tags.map((t) => (
                <div
                  key={t}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '3px 8px',
                    fontFamily: 'var(--font-mono)',
                    fontSize: 11,
                    borderBottom: '1px solid var(--border)'
                  }}
                >
                  <span style={{ color: 'var(--green)' }}>{t}</span>
                  <button
                    className="danger"
                    style={{ padding: '0 6px', fontSize: 10 }}
                    onClick={() => void deleteTag(t)}
                    disabled={busy}
                  >
                    delete
                  </button>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </>
  )
}
