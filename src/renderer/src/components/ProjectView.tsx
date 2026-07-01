import { useCallback, useEffect, useMemo, useState } from 'react'
import { ChevronDown, ChevronUp, PanelBottom, PanelTop } from 'lucide-react'
import type { ShellOption } from '../../../shared/types'
import { useApp, type Tab } from '../store/app'
import FileTree from './FileTree'
import { CodeEditor, languageFor, type Selection } from './Editor'
import GitPanel from './GitPanel'
import SvnPanel from './SvnPanel'
import ProjectNotesPanel from './ProjectNotesPanel'
import TerraformPanel from './TerraformPanel'
import TerminalPane from './TerminalPane'
import EditorCopilot from './EditorCopilot'
import Splitter from './Splitter'
import { v4 as uuid } from 'uuid'
import type { VcsKind } from '../../../shared/types'

interface Props {
  tab: Tab
  visible: boolean
}

interface OpenFile {
  path: string
  content: string
  dirty: boolean
}

interface SearchHit {
  file: string
  line: number
  column: number
  text: string
}

export default function ProjectView({ tab, visible }: Props): React.JSX.Element {
  const project = useApp((s) => s.projects.find((p) => p.id === tab.projectId)) ?? null
  const repoPath = project?.path ?? tab.cwd ?? ''
  const vcs: VcsKind = project?.vcs ?? 'none'
  const terraformDetected = useApp((s) =>
    project ? s.terraformDetected[project.id] === true : false
  )
  const detectTerraform = useApp((s) => s.detectTerraform)
  const [rightView, setRightView] = useState<'vcs' | 'tf'>('vcs')

  const [open, setOpen] = useState<OpenFile[]>([])
  const [activePath, setActivePath] = useState<string | null>(null)
  const [logTail, setLogTail] = useState<string>('')
  useEffect(() => {
    if (!logTail) return
    const id = setTimeout(() => setLogTail(''), 6000)
    return () => clearTimeout(id)
  }, [logTail])
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchHits, setSearchHits] = useState<SearchHit[]>([])
  const [searching, setSearching] = useState(false)
  const [bottomTabId] = useState(() => uuid())
  const [selection, setSelection] = useState<Selection | null>(null)
  const [copilotOpen, setCopilotOpen] = useState(false)

  // Resizable layout. Persist per-project so each tab remembers its sizes.
  const [treeWidth, setTreeWidth] = useState(240)
  const [vcsWidth, setVcsWidth] = useState(320)
  const [termHeight, setTermHeight] = useState(220)
  const [termAtBottom, setTermAtBottom] = useState(false)
  const [notesHeight, setNotesHeight] = useState(200)
  const [notesCollapsed, setNotesCollapsed] = useState(false)
  const [shells, setShells] = useState<ShellOption[]>([])
  const [shell, setShell] = useState<string>('')
  const [shellKey, setShellKey] = useState(0)
  const layoutKey = `project.layout:${project?.id ?? 'default'}`

  useEffect(() => {
    let cancelled = false
    void window.api.kv
      .getJSON<{
        treeWidth?: number
        vcsWidth?: number
        termHeight?: number
        termAtBottom?: boolean
        notesHeight?: number
        notesCollapsed?: boolean
      }>(layoutKey)
      .then((saved) => {
        if (cancelled || !saved) return
        if (typeof saved.treeWidth === 'number') setTreeWidth(saved.treeWidth)
        if (typeof saved.vcsWidth === 'number') setVcsWidth(saved.vcsWidth)
        if (typeof saved.termHeight === 'number') setTermHeight(saved.termHeight)
        if (typeof saved.termAtBottom === 'boolean') setTermAtBottom(saved.termAtBottom)
        if (typeof saved.notesHeight === 'number') setNotesHeight(saved.notesHeight)
        if (typeof saved.notesCollapsed === 'boolean') setNotesCollapsed(saved.notesCollapsed)
      })
    return () => {
      cancelled = true
    }
  }, [layoutKey])

  useEffect(() => {
    const t = setTimeout(() => {
      void window.api.kv.setJSON(layoutKey, {
        treeWidth,
        vcsWidth,
        termHeight,
        termAtBottom,
        notesHeight,
        notesCollapsed
      })
    }, 300)
    return () => clearTimeout(t)
  }, [layoutKey, treeWidth, vcsWidth, termHeight, termAtBottom, notesHeight, notesCollapsed])

  useEffect(() => {
    void window.api.pty.shells().then(setShells)
  }, [])

  useEffect(() => {
    if (!visible || !project || !repoPath) return
    void detectTerraform(project.id, repoPath)
  }, [visible, project?.id, repoPath, detectTerraform, project])

  const bottomTab = useMemo<Tab>(
    () => ({
      id: bottomTabId,
      kind: 'local',
      title: 'terminal',
      cwd: repoPath,
      shell: shell || undefined
    }),
    [bottomTabId, repoPath, shell]
  )

  // Publish the bottom-terminal tab so the global ⌘J handler can target it
  // when the user has a project tab focused.
  useEffect(() => {
    const g = window as Window & { __termionProjectTerm?: Map<string, Tab> }
    if (!g.__termionProjectTerm) g.__termionProjectTerm = new Map()
    g.__termionProjectTerm.set(tab.id, bottomTab)
    return () => {
      g.__termionProjectTerm?.delete(tab.id)
    }
  }, [tab.id, bottomTab])

  const activeFile = useMemo(
    () => open.find((f) => f.path === activePath) ?? null,
    [open, activePath]
  )

  const openFile = useCallback(
    async (path: string): Promise<void> => {
      const existing = open.find((f) => f.path === path)
      if (existing) {
        setActivePath(path)
        return
      }
      try {
        const content = await window.api.fs.readText(path)
        setOpen((arr) => [...arr, { path, content, dirty: false }])
        setActivePath(path)
      } catch (e) {
        alert(`Open failed: ${(e as Error).message}`)
      }
    },
    [open]
  )

  const saveFile = useCallback(async (): Promise<void> => {
    if (!activeFile) return
    try {
      await window.api.fs.writeText(activeFile.path, activeFile.content)
      setOpen((arr) => arr.map((f) => (f.path === activeFile.path ? { ...f, dirty: false } : f)))
    } catch (e) {
      alert(`Save failed: ${(e as Error).message}`)
    }
  }, [activeFile])

  const closeFile = useCallback((path: string): void => {
    setOpen((arr) => {
      const target = arr.find((f) => f.path === path)
      if (target?.dirty && !confirm(`Discard unsaved changes in ${path}?`)) return arr
      const next = arr.filter((f) => f.path !== path)
      setActivePath((cur) => (cur === path ? (next[next.length - 1]?.path ?? null) : cur))
      return next
    })
  }, [])

  useEffect(() => {
    if (!visible) return
    const onOpen = (e: Event): void => {
      const detail = (e as CustomEvent<{ path: string }>).detail
      if (detail?.path) void openFile(detail.path)
    }
    document.addEventListener('termion:open-file', onOpen)
    return () => document.removeEventListener('termion:open-file', onOpen)
  }, [visible, openFile])

  useEffect(() => {
    if (!visible) return
    const handler = async (e: KeyboardEvent): Promise<void> => {
      const meta = e.metaKey || e.ctrlKey
      if (meta && e.key === 's' && activeFile) {
        e.preventDefault()
        await saveFile()
      } else if (meta && e.shiftKey && e.key.toLowerCase() === 'f') {
        e.preventDefault()
        setSearchOpen(true)
      } else if (meta && e.key.toLowerCase() === 'i') {
        e.preventDefault()
        setCopilotOpen((v) => !v)
      } else if (e.key === 'Escape' && searchOpen) {
        setSearchOpen(false)
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [visible, activeFile, saveFile, searchOpen])

  const runSearch = async (q: string): Promise<void> => {
    if (!q.trim()) {
      setSearchHits([])
      return
    }
    setSearching(true)
    try {
      const hits = (await window.api.fs.search(repoPath, q)) as SearchHit[]
      setSearchHits(hits)
    } catch (e) {
      alert((e as Error).message)
    } finally {
      setSearching(false)
    }
  }

  return (
    <div
      className="project-wrap"
      style={{
        display: visible ? 'flex' : 'none',
        flex: 1,
        minHeight: 0,
        position: 'relative'
      }}
    >
      <div
        className="project"
        style={{
          flex: 1,
          minWidth: 0,
          gridTemplateColumns: `${treeWidth}px 6px 1fr 6px ${vcsWidth}px`,
          gridTemplateRows: termAtBottom ? `1fr 6px ${termHeight}px` : `${termHeight}px 6px 1fr`
        }}
      >
        <FileTree root={repoPath} onOpenFile={openFile} selectedPath={activePath} />
        <Splitter
          axis="horizontal"
          size={treeWidth}
          onSize={setTreeWidth}
          min={140}
          max={600}
          ariaLabel="Resize file tree"
        />

        <div className="editor-wrap" style={termAtBottom ? { gridRow: 1 } : undefined}>
          <div className="editor-tabs">
            {open.map((f) => {
              const name = f.path.split('/').pop() ?? f.path
              return (
                <div
                  key={f.path}
                  className={`etab ${f.path === activePath ? 'active' : ''}`}
                  onClick={() => setActivePath(f.path)}
                  title={f.path}
                >
                  {f.dirty && <span className="dot" />}
                  <span>{name}</span>
                  <button
                    className="close"
                    onClick={(e) => {
                      e.stopPropagation()
                      closeFile(f.path)
                    }}
                  >
                    ×
                  </button>
                </div>
              )
            })}
          </div>
          <div className="editor-host">
            {activeFile ? (
              <CodeEditor
                key={activeFile.path}
                value={activeFile.content}
                language={languageFor(activeFile.path)}
                onChange={(v) =>
                  setOpen((arr) =>
                    arr.map((f) =>
                      f.path === activeFile.path
                        ? { ...f, content: v, dirty: v !== f.content || f.dirty }
                        : f
                    )
                  )
                }
                onSelectionChange={setSelection}
              />
            ) : (
              <div className="empty">Open a file to start editing.</div>
            )}

            {searchOpen && (
              <div className="search-panel">
                <div
                  style={{
                    padding: 10,
                    display: 'flex',
                    gap: 8,
                    borderBottom: '1px solid var(--border)'
                  }}
                >
                  <input
                    autoFocus
                    placeholder="Search in project (ripgrep)…"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') void runSearch(searchQuery)
                    }}
                    style={{ flex: 1 }}
                  />
                  <button onClick={() => void runSearch(searchQuery)} disabled={searching}>
                    Search
                  </button>
                  <button onClick={() => setSearchOpen(false)}>Close</button>
                </div>
                <div style={{ flex: 1, overflowY: 'auto' }}>
                  {searchHits.length === 0 && !searching ? (
                    <div className="empty">No results.</div>
                  ) : (
                    searchHits.map((h, i) => {
                      const rel = h.file.startsWith(repoPath)
                        ? h.file.slice(repoPath.length + 1)
                        : h.file
                      return (
                        <div
                          key={i}
                          className="hit"
                          onClick={() => {
                            setSearchOpen(false)
                            void openFile(h.file)
                          }}
                        >
                          <span className="file">{rel}</span>
                          <span className="lineno">:{h.line}</span>
                          <span>{h.text.trim()}</span>
                        </div>
                      )
                    })
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        <Splitter
          axis="horizontal"
          size={vcsWidth}
          onSize={setVcsWidth}
          min={220}
          max={800}
          inverse
          ariaLabel="Resize VCS panel"
        />
        <div className="vcs-panel">
          <div className="vcs-pane vcs-pane-top">
            {terraformDetected && (
              <div className="vcs-toptabs">
                <button
                  type="button"
                  className={`vtt ${rightView === 'vcs' ? 'active' : ''}`}
                  onClick={() => setRightView('vcs')}
                >
                  {vcs === 'svn' ? 'SVN' : vcs === 'git' ? 'Git' : 'Files'}
                </button>
                <button
                  type="button"
                  className={`vtt ${rightView === 'tf' ? 'active' : ''}`}
                  onClick={() => setRightView('tf')}
                >
                  Terraform
                </button>
              </div>
            )}
            {rightView === 'tf' && terraformDetected && project ? (
              <TerraformPanel
                projectId={project.id}
                repoPath={repoPath}
                visible={visible && rightView === 'tf'}
              />
            ) : vcs === 'git' ? (
              <GitPanel repoPath={repoPath} onOpenLog={setLogTail} />
            ) : vcs === 'svn' ? (
              <SvnPanel repoPath={repoPath} onOpenLog={setLogTail} />
            ) : (
              <div className="empty">
                No VCS detected.
                <br />
                <small>(no .git or .svn)</small>
              </div>
            )}
          </div>
          {!notesCollapsed && (
            <Splitter
              axis="vertical"
              size={notesHeight}
              onSize={setNotesHeight}
              min={80}
              max={1200}
              inverse
              ariaLabel="Resize notes"
            />
          )}
          <div
            className="vcs-pane vcs-pane-notes"
            style={{
              flex: notesCollapsed ? '0 0 auto' : `0 0 ${notesHeight}px`,
              minHeight: notesCollapsed ? 0 : 80
            }}
          >
            <div className="vcs-notes-header">
              <span>Notes</span>
              <button
                className="bottom-term-flip"
                onClick={() => setNotesCollapsed((v) => !v)}
                title={notesCollapsed ? 'Show notes' : 'Hide notes (expand panel above)'}
              >
                {notesCollapsed ? (
                  <ChevronUp size={12} strokeWidth={2} />
                ) : (
                  <ChevronDown size={12} strokeWidth={2} />
                )}
              </button>
            </div>
            {!notesCollapsed && <ProjectNotesPanel projectId={project?.id} />}
          </div>
        </div>

        <div className="bottom-term" style={{ gridColumn: 3, gridRow: termAtBottom ? 3 : 1 }}>
          <div className="bottom-term-header">
            <span>Terminal</span>
            {shells.length > 1 && (
              <select
                className="shell-select"
                value={shell}
                onChange={(e) => {
                  setShell(e.target.value)
                  setShellKey((k) => k + 1)
                }}
                title="Switch shell (restarts terminal)"
              >
                <option value="">Default</option>
                {shells.map((s) => (
                  <option key={s.path} value={s.path}>
                    {s.label}
                  </option>
                ))}
              </select>
            )}
            <button
              className="bottom-term-flip"
              onClick={() => setTermAtBottom((v) => !v)}
              title={termAtBottom ? 'Move terminal to top' : 'Move terminal to bottom'}
            >
              {termAtBottom ? (
                <PanelTop size={12} strokeWidth={2} />
              ) : (
                <PanelBottom size={12} strokeWidth={2} />
              )}
            </button>
          </div>
          <div style={{ flex: 1, minHeight: 0, display: 'flex' }}>
            <TerminalPane
              key={`${bottomTabId}-${shellKey}`}
              tab={bottomTab}
              visible={visible}
              resizeKey={termAtBottom ? 1 : 0}
            />
          </div>
        </div>
        <div style={{ gridColumn: 3, gridRow: 2 }}>
          <Splitter
            axis="vertical"
            size={termHeight}
            onSize={setTermHeight}
            min={80}
            max={1200}
            inverse={termAtBottom}
            ariaLabel="Resize terminal"
          />
        </div>
      </div>
      {logTail && (
        <div className="vcs-toast" onClick={() => setLogTail('')} title="Click to dismiss">
          {logTail}
        </div>
      )}
      {copilotOpen && (
        <div className="editor-copilot-strip">
          <EditorCopilot
            projectRoot={repoPath}
            filePath={activeFile?.path ?? null}
            fileContent={activeFile?.content ?? ''}
            selection={selection}
            onApply={async (newContent) => {
              if (!activeFile) return
              await window.api.fs.writeText(activeFile.path, newContent)
              setOpen((arr) =>
                arr.map((f) =>
                  f.path === activeFile.path ? { ...f, content: newContent, dirty: false } : f
                )
              )
            }}
            onClose={() => setCopilotOpen(false)}
          />
        </div>
      )}
    </div>
  )
}
