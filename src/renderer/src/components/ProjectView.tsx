import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { editor as monacoEditor } from 'monaco-editor'
import {
  ChevronDown,
  ChevronUp,
  GitCompare,
  PanelBottom,
  PanelTop,
  Plus,
  SplitSquareHorizontal,
  X
} from 'lucide-react'
import type { ShellOption } from '../../../shared/types'
import { useApp, type Tab } from '../store/app'
import FileTree from './FileTree'
import { CodeEditor, DiffView, languageFor, type Selection } from './Editor'
import GitPanel, { type ViewMode as GitViewMode } from './GitPanel'
import SvnPanel from './SvnPanel'
import ProjectNotesPanel from './ProjectNotesPanel'
import TerraformPanel from './TerraformPanel'
import TasksPanel from './TasksPanel'
import TerminalPane from './TerminalPane'
import EditorCopilot from './EditorCopilot'
import Splitter from './Splitter'
import { v4 as uuid } from 'uuid'
import type { VcsKind } from '../../../shared/types'

interface Props {
  tab: Tab
  visible: boolean
}

type OpenItem =
  | { kind: 'file'; key: string; path: string; content: string; dirty: boolean }
  | {
      kind: 'diff'
      key: string
      path: string
      staged: boolean
      original: string
      modified: string
      loading?: boolean
    }

interface SearchHit {
  file: string
  line: number
  column: number
  text: string
}

interface TerminalDescriptor {
  id: string
  title: string
  shell?: string
}

interface TerminalColumn {
  id: string
  width: number
  tabs: TerminalDescriptor[]
  activeTabId: string
}

interface LayoutBlob {
  treeWidth?: number
  vcsWidth?: number
  termHeight?: number
  termAtBottom?: boolean
  notesHeight?: number
  notesCollapsed?: boolean
  openItems?: Array<
    { kind: 'file'; path: string } | { kind: 'diff'; path: string; staged: boolean }
  >
  activeKey?: string | null
  viewStates?: Record<string, unknown>
  search?: { open: boolean; query: string }
  gitView?: GitViewMode
  terminals?: { columns: TerminalColumn[]; activeColumnId: string }
}

const fileKey = (path: string): string => `file:${path}`
const diffKey = (path: string, staged: boolean): string => `diff:${staged ? 'idx' : 'wt'}:${path}`

const MAX_COLUMNS = 3

const initialTerminals = (): {
  columns: TerminalColumn[]
  activeColumnId: string
} => {
  const colId = uuid()
  const tabId = uuid()
  return {
    columns: [
      {
        id: colId,
        width: 1,
        tabs: [{ id: tabId, title: 'terminal' }],
        activeTabId: tabId
      }
    ],
    activeColumnId: colId
  }
}

export default function ProjectView({ tab, visible }: Props): React.JSX.Element {
  const project = useApp((s) => s.projects.find((p) => p.id === tab.projectId)) ?? null
  const repoPath = project?.path ?? tab.cwd ?? ''
  const vcs: VcsKind = project?.vcs ?? 'none'
  const terraformDetected = useApp((s) =>
    project ? s.terraformDetected[project.id] === true : false
  )
  const detectTerraform = useApp((s) => s.detectTerraform)
  const [rightView, setRightView] = useState<'vcs' | 'tf' | 'tasks'>('vcs')
  const [gitView, setGitView] = useState<GitViewMode>('changes')

  const [items, setItems] = useState<OpenItem[]>([])
  const [activeKey, setActiveKey] = useState<string | null>(null)
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

  // Terminals — multiple columns, each with tabs.
  const [terminals, setTerminals] = useState<{
    columns: TerminalColumn[]
    activeColumnId: string
  }>(() => initialTerminals())

  // Monaco per-file viewStates (cursor + scroll). Restored on remount.
  const viewStatesRef = useRef<Record<string, monacoEditor.ICodeEditorViewState>>({})
  const editorsRef = useRef<Map<string, monacoEditor.IStandaloneCodeEditor>>(new Map())
  const restoredRef = useRef(false)

  const layoutKey = `project.layout:${project?.id ?? 'default'}`

  // Restore persisted state (once).
  useEffect(() => {
    let cancelled = false
    void window.api.kv.getJSON<LayoutBlob>(layoutKey).then((saved) => {
      if (cancelled || !saved) {
        restoredRef.current = true
        return
      }
      if (typeof saved.treeWidth === 'number') setTreeWidth(saved.treeWidth)
      if (typeof saved.vcsWidth === 'number') setVcsWidth(saved.vcsWidth)
      if (typeof saved.termHeight === 'number') setTermHeight(saved.termHeight)
      if (typeof saved.termAtBottom === 'boolean') setTermAtBottom(saved.termAtBottom)
      if (typeof saved.notesHeight === 'number') setNotesHeight(saved.notesHeight)
      if (typeof saved.notesCollapsed === 'boolean') setNotesCollapsed(saved.notesCollapsed)
      if (saved.search) {
        setSearchQuery(saved.search.query ?? '')
        setSearchOpen(!!saved.search.open)
      }
      if (saved.gitView === 'changes' || saved.gitView === 'history' || saved.gitView === 'tags') {
        setGitView(saved.gitView)
      }
      if (saved.viewStates && typeof saved.viewStates === 'object') {
        viewStatesRef.current = saved.viewStates as Record<
          string,
          monacoEditor.ICodeEditorViewState
        >
      }
      if (saved.terminals && saved.terminals.columns.length > 0) {
        // Reuse persisted layout but note tab ids won't map to any live pty — fresh sessions.
        setTerminals(saved.terminals)
      }
      // Re-open persisted file/diff items after everything else settles so
      // ipc calls run without blocking layout state.
      void (async () => {
        const restoredItems: OpenItem[] = []
        for (const entry of saved.openItems ?? []) {
          try {
            if (entry.kind === 'file') {
              const content = await window.api.fs.readText(entry.path)
              restoredItems.push({
                kind: 'file',
                key: fileKey(entry.path),
                path: entry.path,
                content,
                dirty: false
              })
            } else if (entry.kind === 'diff') {
              const [head, second] = await Promise.all([
                window.api.git.fileAtRef(repoPath, 'HEAD', entry.path) as Promise<string>,
                entry.staged
                  ? (window.api.git.fileAtRef(repoPath, ':', entry.path) as Promise<string>)
                  : window.api.fs.readText(`${repoPath}/${entry.path}`).catch(() => '')
              ])
              restoredItems.push({
                kind: 'diff',
                key: diffKey(entry.path, entry.staged),
                path: entry.path,
                staged: entry.staged,
                original: head ?? '',
                modified: second ?? ''
              })
            }
          } catch {
            /* skip broken entries */
          }
        }
        if (cancelled) return
        if (restoredItems.length > 0) {
          setItems(restoredItems)
          const desired = saved.activeKey
          if (desired && restoredItems.some((it) => it.key === desired)) {
            setActiveKey(desired)
          } else {
            setActiveKey(restoredItems[restoredItems.length - 1].key)
          }
        }
        restoredRef.current = true
      })()
    })
    return () => {
      cancelled = true
    }
  }, [layoutKey, repoPath])

  // Persist layout (debounced). Skipped until restore has run.
  useEffect(() => {
    if (!restoredRef.current) return
    const openItems = items.map((it) =>
      it.kind === 'file'
        ? ({ kind: 'file', path: it.path } as const)
        : ({ kind: 'diff', path: it.path, staged: it.staged } as const)
    )
    const t = setTimeout(() => {
      const blob: LayoutBlob = {
        treeWidth,
        vcsWidth,
        termHeight,
        termAtBottom,
        notesHeight,
        notesCollapsed,
        openItems,
        activeKey,
        viewStates: viewStatesRef.current,
        search: { open: searchOpen, query: searchQuery },
        gitView,
        terminals
      }
      void window.api.kv.setJSON(layoutKey, blob)
    }, 300)
    return () => clearTimeout(t)
  }, [
    layoutKey,
    treeWidth,
    vcsWidth,
    termHeight,
    termAtBottom,
    notesHeight,
    notesCollapsed,
    items,
    activeKey,
    searchOpen,
    searchQuery,
    gitView,
    terminals
  ])

  // Coarse viewState persistence while a file is active: snapshot every 2s.
  useEffect(() => {
    if (!activeKey) return
    const active = items.find((i) => i.key === activeKey)
    if (!active || active.kind !== 'file') return
    const id = setInterval(() => {
      const ed = editorsRef.current.get(active.path)
      if (!ed) return
      const state = ed.saveViewState()
      if (state) viewStatesRef.current[active.path] = state
    }, 2000)
    return () => clearInterval(id)
  }, [activeKey, items])

  useEffect(() => {
    void window.api.pty.shells().then(setShells)
  }, [])

  useEffect(() => {
    if (!visible || !project || !repoPath) return
    void detectTerraform(project.id, repoPath)
  }, [visible, project?.id, repoPath, detectTerraform, project])

  // Publish the active bottom-terminal Tab so ⌘J / Sidebar helpers work.
  useEffect(() => {
    const g = window as Window & { __termionProjectTerm?: Map<string, Tab> }
    if (!g.__termionProjectTerm) g.__termionProjectTerm = new Map()
    const activeCol =
      terminals.columns.find((c) => c.id === terminals.activeColumnId) ?? terminals.columns[0]
    const activeDescriptor =
      activeCol?.tabs.find((t) => t.id === activeCol.activeTabId) ?? activeCol?.tabs[0]
    if (activeDescriptor) {
      const activeTab: Tab = {
        id: activeDescriptor.id,
        kind: 'local',
        title: activeDescriptor.title,
        cwd: repoPath,
        shell: activeDescriptor.shell
      }
      g.__termionProjectTerm.set(tab.id, activeTab)
    }
    return () => {
      g.__termionProjectTerm?.delete(tab.id)
    }
  }, [tab.id, terminals, repoPath])

  const activeItem = useMemo(
    () => items.find((f) => f.key === activeKey) ?? null,
    [items, activeKey]
  )
  const activeFile = activeItem?.kind === 'file' ? activeItem : null

  const openFile = useCallback(
    async (path: string): Promise<void> => {
      const key = fileKey(path)
      const existing = items.find((f) => f.key === key)
      if (existing) {
        setActiveKey(key)
        return
      }
      try {
        const content = await window.api.fs.readText(path)
        setItems((arr) => [...arr, { kind: 'file', key, path, content, dirty: false }])
        setActiveKey(key)
      } catch (e) {
        alert(`Open failed: ${(e as Error).message}`)
      }
    },
    [items]
  )

  const fetchDiff = useCallback(
    async (path: string, staged: boolean): Promise<{ original: string; modified: string }> => {
      const head = (await window.api.git
        .fileAtRef(repoPath, 'HEAD', path)
        .catch(() => '')) as string
      let modified: string
      if (staged) {
        modified = (await window.api.git.fileAtRef(repoPath, ':', path).catch(() => '')) as string
      } else {
        modified = await window.api.fs.readText(`${repoPath}/${path}`).catch(() => '')
      }
      return { original: head ?? '', modified: modified ?? '' }
    },
    [repoPath]
  )

  const openDiff = useCallback(
    async (path: string, staged: boolean): Promise<void> => {
      const key = diffKey(path, staged)
      const existing = items.find((f) => f.key === key)
      if (existing) {
        setActiveKey(key)
        // Refresh contents in the background.
        void (async () => {
          const { original, modified } = await fetchDiff(path, staged)
          setItems((arr) =>
            arr.map((it) =>
              it.key === key && it.kind === 'diff' ? { ...it, original, modified } : it
            )
          )
        })()
        return
      }
      // Optimistic tab so user gets immediate feedback.
      setItems((arr) => [
        ...arr,
        {
          kind: 'diff',
          key,
          path,
          staged,
          original: '',
          modified: '',
          loading: true
        }
      ])
      setActiveKey(key)
      try {
        const { original, modified } = await fetchDiff(path, staged)
        setItems((arr) =>
          arr.map((it) =>
            it.key === key && it.kind === 'diff'
              ? { ...it, original, modified, loading: false }
              : it
          )
        )
      } catch (e) {
        alert(`Open diff failed: ${(e as Error).message}`)
        setItems((arr) => arr.filter((it) => it.key !== key))
      }
    },
    [items, fetchDiff]
  )

  const saveFile = useCallback(async (): Promise<void> => {
    if (!activeFile) return
    try {
      await window.api.fs.writeText(activeFile.path, activeFile.content)
      setItems((arr) =>
        arr.map((f) =>
          f.kind === 'file' && f.path === activeFile.path ? { ...f, dirty: false } : f
        )
      )
    } catch (e) {
      alert(`Save failed: ${(e as Error).message}`)
    }
  }, [activeFile])

  const closeItem = useCallback((key: string): void => {
    setItems((arr) => {
      const target = arr.find((f) => f.key === key)
      if (target?.kind === 'file' && target.dirty) {
        if (!confirm(`Discard unsaved changes in ${target.path}?`)) return arr
      }
      // Snapshot final viewState for closed file so a later re-open still resumes.
      if (target?.kind === 'file') {
        const ed = editorsRef.current.get(target.path)
        if (ed) {
          const state = ed.saveViewState()
          if (state) viewStatesRef.current[target.path] = state
        }
        editorsRef.current.delete(target.path)
      }
      const next = arr.filter((f) => f.key !== key)
      setActiveKey((cur) => (cur === key ? (next[next.length - 1]?.key ?? null) : cur))
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

  // ----- Terminal columns/tabs helpers -----

  const activeColumn = useMemo(
    () => terminals.columns.find((c) => c.id === terminals.activeColumnId) ?? terminals.columns[0],
    [terminals]
  )

  const addTerminalTab = (colId: string, shell?: string): void => {
    const tabId = uuid()
    setTerminals((t) => ({
      ...t,
      activeColumnId: colId,
      columns: t.columns.map((c) =>
        c.id === colId
          ? {
              ...c,
              tabs: [
                ...c.tabs,
                { id: tabId, title: shell ? shell.split(/[\\/]/).pop()! : 'terminal', shell }
              ],
              activeTabId: tabId
            }
          : c
      )
    }))
  }

  const closeTerminalTab = (colId: string, tabId: string): void => {
    // Kill pty.
    void window.api.term.close(tabId)
    setTerminals((t) => {
      const columns = t.columns
        .map((c) => {
          if (c.id !== colId) return c
          const tabs = c.tabs.filter((tt) => tt.id !== tabId)
          const activeTabId =
            c.activeTabId === tabId ? (tabs[tabs.length - 1]?.id ?? '') : c.activeTabId
          return { ...c, tabs, activeTabId }
        })
        // Drop an empty column unless it's the last one — always keep at least one column with one tab.
        .filter((c, _idx, all) => c.tabs.length > 0 || all.length === 1)
      // Guarantee at least one column with one tab.
      if (columns.length === 0 || columns.every((c) => c.tabs.length === 0)) {
        const init = initialTerminals()
        return init
      }
      let activeColumnId = t.activeColumnId
      if (!columns.find((c) => c.id === activeColumnId)) {
        activeColumnId = columns[0].id
      }
      return { columns, activeColumnId }
    })
  }

  const setActiveTerminalTab = (colId: string, tabId: string): void => {
    setTerminals((t) => ({
      ...t,
      activeColumnId: colId,
      columns: t.columns.map((c) => (c.id === colId ? { ...c, activeTabId: tabId } : c))
    }))
  }

  const focusColumn = (colId: string): void => {
    setTerminals((t) => (t.activeColumnId === colId ? t : { ...t, activeColumnId: colId }))
  }

  const splitRight = (afterColId: string): void => {
    setTerminals((t) => {
      if (t.columns.length >= MAX_COLUMNS) return t
      const idx = t.columns.findIndex((c) => c.id === afterColId)
      if (idx < 0) return t
      const newColId = uuid()
      const newTabId = uuid()
      const newCol: TerminalColumn = {
        id: newColId,
        width: 1,
        tabs: [{ id: newTabId, title: 'terminal' }],
        activeTabId: newTabId
      }
      const columns = [...t.columns]
      columns.splice(idx + 1, 0, newCol)
      // Normalize equal widths.
      const share = 1
      for (const c of columns) c.width = share
      return { columns, activeColumnId: newColId }
    })
  }

  const resizeColumn = (colId: string, deltaFraction: number): void => {
    setTerminals((t) => {
      const idx = t.columns.findIndex((c) => c.id === colId)
      if (idx < 0 || idx === t.columns.length - 1) return t
      const columns = t.columns.map((c) => ({ ...c }))
      const left = columns[idx]
      const right = columns[idx + 1]
      const min = 0.15
      const nextLeft = Math.max(
        min,
        Math.min(left.width + right.width - min, left.width + deltaFraction)
      )
      const nextRight = left.width + right.width - nextLeft
      left.width = nextLeft
      right.width = nextRight
      return { ...t, columns }
    })
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
        <FileTree root={repoPath} onOpenFile={openFile} selectedPath={activeFile?.path ?? null} />
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
            {items.map((f) => {
              const name = f.path.split('/').pop() ?? f.path
              const isDiff = f.kind === 'diff'
              const title =
                f.kind === 'file'
                  ? f.path
                  : `${f.path} — diff (${f.staged ? 'staged' : 'working tree'})`
              return (
                <div
                  key={f.key}
                  className={`etab ${f.key === activeKey ? 'active' : ''}`}
                  onClick={() => setActiveKey(f.key)}
                  title={title}
                >
                  {isDiff && (
                    <GitCompare size={11} strokeWidth={2} style={{ opacity: 0.7, flexShrink: 0 }} />
                  )}
                  {f.kind === 'file' && f.dirty && <span className="dot" />}
                  <span>{name}</span>
                  {isDiff && (
                    <span style={{ opacity: 0.55, fontSize: 10 }}>
                      {f.staged ? 'staged' : 'diff'}
                    </span>
                  )}
                  <button
                    className="close"
                    onClick={(e) => {
                      e.stopPropagation()
                      closeItem(f.key)
                    }}
                  >
                    ×
                  </button>
                </div>
              )
            })}
          </div>
          <div className="editor-host">
            {activeItem?.kind === 'file' ? (
              <CodeEditor
                key={activeItem.key}
                value={activeItem.content}
                language={languageFor(activeItem.path)}
                onChange={(v) =>
                  setItems((arr) =>
                    arr.map((f) =>
                      f.kind === 'file' && f.path === activeItem.path
                        ? { ...f, content: v, dirty: v !== f.content || f.dirty }
                        : f
                    )
                  )
                }
                onSelectionChange={setSelection}
                onReady={(ed) => {
                  editorsRef.current.set(activeItem.path, ed)
                  const saved = viewStatesRef.current[activeItem.path]
                  if (saved) {
                    try {
                      ed.restoreViewState(saved)
                    } catch {
                      /* stale viewState — ignore */
                    }
                  }
                  // Snapshot on blur / change so we keep the latest position.
                  ed.onDidBlurEditorText(() => {
                    const s = ed.saveViewState()
                    if (s) viewStatesRef.current[activeItem.path] = s
                  })
                }}
              />
            ) : activeItem?.kind === 'diff' ? (
              <DiffView
                key={activeItem.key}
                original={activeItem.original}
                modified={activeItem.modified}
                language={languageFor(activeItem.path)}
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
            <div className="vcs-toptabs">
              <button
                type="button"
                className={`vtt ${rightView === 'vcs' ? 'active' : ''}`}
                onClick={() => setRightView('vcs')}
              >
                {vcs === 'svn' ? 'SVN' : vcs === 'git' ? 'Git' : 'Files'}
              </button>
              {terraformDetected && (
                <button
                  type="button"
                  className={`vtt ${rightView === 'tf' ? 'active' : ''}`}
                  onClick={() => setRightView('tf')}
                >
                  Terraform
                </button>
              )}
              <button
                type="button"
                className={`vtt ${rightView === 'tasks' ? 'active' : ''}`}
                onClick={() => setRightView('tasks')}
              >
                Tasks
              </button>
            </div>
            {rightView === 'tasks' ? (
              <TasksPanel projectId={project?.id} />
            ) : rightView === 'tf' && terraformDetected && project ? (
              <TerraformPanel
                projectId={project.id}
                repoPath={repoPath}
                visible={visible && rightView === 'tf'}
              />
            ) : vcs === 'git' ? (
              <GitPanel
                repoPath={repoPath}
                onOpenLog={setLogTail}
                onOpenDiff={(p, staged) => void openDiff(p, staged)}
                view={gitView}
                onViewChange={setGitView}
              />
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
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              {shells.length > 1 && (
                <select
                  className="shell-select"
                  value=""
                  onChange={(e) => {
                    if (!e.target.value) return
                    addTerminalTab(activeColumn.id, e.target.value)
                    e.currentTarget.value = ''
                  }}
                  title="Open a new terminal tab with this shell"
                >
                  <option value="">+ shell…</option>
                  {shells.map((s) => (
                    <option key={s.path} value={s.path}>
                      {s.label}
                    </option>
                  ))}
                </select>
              )}
              <button
                className="bottom-term-flip"
                onClick={() => addTerminalTab(activeColumn.id)}
                title="New terminal tab (in focused column)"
              >
                <Plus size={12} strokeWidth={2} />
              </button>
              <button
                className="bottom-term-flip"
                onClick={() => splitRight(activeColumn.id)}
                disabled={terminals.columns.length >= MAX_COLUMNS}
                title={
                  terminals.columns.length >= MAX_COLUMNS
                    ? `Max ${MAX_COLUMNS} columns`
                    : 'Split right — add another terminal pane'
                }
              >
                <SplitSquareHorizontal size={12} strokeWidth={2} />
              </button>
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
          </div>
          <div className="term-cols" style={{ flex: 1, minHeight: 0, display: 'flex' }}>
            {terminals.columns.map((col, idx) => {
              const isLast = idx === terminals.columns.length - 1
              const flexBasis = `${(col.width / terminals.columns.reduce((s, c) => s + c.width, 0)) * 100}%`
              return (
                <TerminalColumnView
                  key={col.id}
                  column={col}
                  focused={col.id === terminals.activeColumnId}
                  repoPath={repoPath}
                  visible={visible}
                  termAtBottom={termAtBottom}
                  flexBasis={flexBasis}
                  hasResizer={!isLast}
                  onResize={(deltaFraction) => resizeColumn(col.id, deltaFraction)}
                  onFocus={() => focusColumn(col.id)}
                  onAddTab={() => addTerminalTab(col.id)}
                  onSelectTab={(tabId) => setActiveTerminalTab(col.id, tabId)}
                  onCloseTab={(tabId) => closeTerminalTab(col.id, tabId)}
                />
              )
            })}
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
      {copilotOpen && activeFile && (
        <div className="editor-copilot-strip">
          <EditorCopilot
            projectRoot={repoPath}
            filePath={activeFile.path}
            fileContent={activeFile.content}
            selection={selection}
            onApply={async (newContent) => {
              await window.api.fs.writeText(activeFile.path, newContent)
              setItems((arr) =>
                arr.map((f) =>
                  f.kind === 'file' && f.path === activeFile.path
                    ? { ...f, content: newContent, dirty: false }
                    : f
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

interface TerminalColumnProps {
  column: TerminalColumn
  focused: boolean
  repoPath: string
  visible: boolean
  termAtBottom: boolean
  flexBasis: string
  hasResizer: boolean
  onResize: (deltaFraction: number) => void
  onFocus: () => void
  onAddTab: () => void
  onSelectTab: (tabId: string) => void
  onCloseTab: (tabId: string) => void
}

function TerminalColumnView({
  column,
  focused,
  repoPath,
  visible,
  termAtBottom,
  flexBasis,
  hasResizer,
  onResize,
  onFocus,
  onAddTab,
  onSelectTab,
  onCloseTab
}: TerminalColumnProps): React.JSX.Element {
  const hostRef = useRef<HTMLDivElement>(null)

  const startResize = (e: React.PointerEvent): void => {
    e.preventDefault()
    const container = hostRef.current?.parentElement
    if (!container) return
    const totalWidth = container.getBoundingClientRect().width
    const startX = e.clientX
    const onMove = (ev: PointerEvent): void => {
      const delta = (ev.clientX - startX) / totalWidth
      onResize(delta)
    }
    const onUp = (): void => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  return (
    <>
      <div
        ref={hostRef}
        className={`term-col ${focused ? 'focused' : ''}`}
        style={{
          flex: `1 1 ${flexBasis}`,
          minWidth: 120,
          display: 'flex',
          flexDirection: 'column',
          borderRight: hasResizer ? undefined : 'none'
        }}
        onMouseDown={onFocus}
      >
        <div className="term-col-tabs">
          {column.tabs.map((t) => (
            <div
              key={t.id}
              className={`term-col-tab ${t.id === column.activeTabId ? 'active' : ''}`}
              onClick={(e) => {
                e.stopPropagation()
                onFocus()
                onSelectTab(t.id)
              }}
              title={t.title}
            >
              <span>{t.title}</span>
              <button
                className="close"
                onClick={(e) => {
                  e.stopPropagation()
                  onCloseTab(t.id)
                }}
                title="Close terminal"
              >
                <X size={10} strokeWidth={2} />
              </button>
            </div>
          ))}
          <button
            className="term-col-newtab"
            onClick={(e) => {
              e.stopPropagation()
              onAddTab()
            }}
            title="New terminal in this column"
          >
            <Plus size={11} strokeWidth={2} />
          </button>
        </div>
        <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
          {column.tabs.map((t) => {
            const paneTab: Tab = {
              id: t.id,
              kind: 'local',
              title: t.title,
              cwd: repoPath,
              shell: t.shell
            }
            const isActive = t.id === column.activeTabId
            return (
              <div
                key={t.id}
                style={{
                  position: 'absolute',
                  inset: 0,
                  display: isActive ? 'flex' : 'none'
                }}
              >
                <TerminalPane
                  tab={paneTab}
                  visible={visible && isActive}
                  resizeKey={`${termAtBottom ? 'b' : 't'}:${flexBasis}`}
                />
              </div>
            )
          })}
        </div>
      </div>
      {hasResizer && (
        <div className="term-col-resizer" onPointerDown={startResize} title="Drag to resize" />
      )}
    </>
  )
}
