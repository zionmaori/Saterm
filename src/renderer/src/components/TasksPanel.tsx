import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, ChevronDown, ChevronRight, Trash2, Search, X } from 'lucide-react'
import { taskScopeKey, useApp } from '../store/app'
import type { Task, TaskPriority, TaskStatus } from '../../../shared/types'

interface Props {
  projectId?: number
}

type Filter = 'all' | 'todo' | 'doing' | 'done' | 'overdue'
type Scope = 'global' | 'project'

const STATUS_ORDER: Record<TaskStatus, number> = { doing: 0, todo: 1, done: 2 }
const PRIORITY_LABEL: Record<TaskPriority, string> = { [-1]: 'Low', 0: '', 1: 'High' }
// Stable fallback so the zustand selector below returns the same reference on
// every render before tasks have loaded. Returning a fresh `[]` each time
// trips React's useSyncExternalStore snapshot check and blanks the panel.
const EMPTY_TASKS: Task[] = []

function isOverdue(t: Task): boolean {
  return t.dueAt != null && t.dueAt < Date.now() && t.status !== 'done'
}

function dueLabel(ms: number): string {
  const d = new Date(ms)
  const now = new Date()
  const sameYear = d.getFullYear() === now.getFullYear()
  return d.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: sameYear ? undefined : 'numeric'
  })
}

function toDateInputValue(ms: number | null | undefined): string {
  if (ms == null) return ''
  const d = new Date(ms)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function fromDateInputValue(v: string): number | null {
  if (!v) return null
  const [y, m, d] = v.split('-').map(Number)
  if (!y || !m || !d) return null
  return new Date(y, m - 1, d, 23, 59, 0, 0).getTime()
}

export default function TasksPanel({ projectId }: Props): React.JSX.Element {
  const scopePref = useApp((s) => s.tasksScopePref)
  const setScopePref = useApp((s) => s.setTasksScopePref)
  const loadScopePref = useApp((s) => s.loadTasksScopePref)

  const effectiveScope: Scope = projectId != null && scopePref === 'project' ? 'project' : 'global'
  const currentProjectId: number | null = effectiveScope === 'project' ? projectId! : null
  const scopeKey = taskScopeKey(currentProjectId)

  const tasks = useApp((s) => s.tasks[scopeKey] ?? EMPTY_TASKS)
  const loading = useApp((s) => s.tasksLoading[scopeKey] ?? false)
  const loadTasks = useApp((s) => s.loadTasks)
  const addTask = useApp((s) => s.addTask)
  const patchTask = useApp((s) => s.patchTask)
  const removeTask = useApp((s) => s.removeTask)

  const [filter, setFilter] = useState<Filter>('all')
  const [query, setQuery] = useState('')
  const [expandedId, setExpandedId] = useState<number | null>(null)
  const [newTitle, setNewTitle] = useState('')
  const addInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    void loadScopePref()
  }, [loadScopePref])

  useEffect(() => {
    void loadTasks(scopeKey, currentProjectId)
  }, [scopeKey, currentProjectId, loadTasks])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    let out = tasks
    if (filter === 'overdue') out = out.filter(isOverdue)
    else if (filter !== 'all') out = out.filter((t) => t.status === filter)
    if (q) out = out.filter((t) => t.title.toLowerCase().includes(q))
    return [...out].sort((a, b) => {
      const sd = STATUS_ORDER[a.status] - STATUS_ORDER[b.status]
      if (sd !== 0) return sd
      const pd = b.priority - a.priority
      if (pd !== 0) return pd
      const ad = a.dueAt ?? Number.POSITIVE_INFINITY
      const bd = b.dueAt ?? Number.POSITIVE_INFINITY
      if (ad !== bd) return ad - bd
      return a.createdAt - b.createdAt
    })
  }, [tasks, filter, query])

  const counts = useMemo(() => {
    let todo = 0
    let doing = 0
    let done = 0
    let overdue = 0
    for (const t of tasks) {
      if (t.status === 'todo') todo++
      else if (t.status === 'doing') doing++
      else if (t.status === 'done') done++
      if (isOverdue(t)) overdue++
    }
    return { todo, doing, done, overdue, all: tasks.length }
  }, [tasks])

  const submitNew = async (): Promise<void> => {
    const title = newTitle.trim()
    if (!title) return
    setNewTitle('')
    await addTask(scopeKey, {
      projectId: currentProjectId,
      title,
      status: 'todo',
      priority: 0
    })
  }

  const toggleDone = (t: Task): void => {
    void patchTask(scopeKey, t.id, { status: t.status === 'done' ? 'todo' : 'done' })
  }

  return (
    <div className="tp">
      <div className="tp-header">
        <div className="tp-scope">
          <button
            type="button"
            className={`tp-scope-btn ${effectiveScope === 'global' ? 'active' : ''}`}
            onClick={() => void setScopePref('global')}
          >
            Global
          </button>
          <button
            type="button"
            className={`tp-scope-btn ${effectiveScope === 'project' ? 'active' : ''}`}
            onClick={() => void setScopePref('project')}
            disabled={projectId == null}
            title={projectId == null ? 'Open a project to enable' : undefined}
          >
            Project
          </button>
        </div>
        <div className="tp-search">
          <Search size={12} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter tasks…"
          />
          {query && (
            <button className="tp-search-clear" onClick={() => setQuery('')} title="Clear">
              <X size={11} />
            </button>
          )}
        </div>
      </div>

      <div className="tp-filters">
        {(
          [
            ['all', 'All', counts.all],
            ['todo', 'Todo', counts.todo],
            ['doing', 'Doing', counts.doing],
            ['done', 'Done', counts.done],
            ['overdue', 'Overdue', counts.overdue]
          ] as const
        ).map(([key, label, n]) => (
          <button
            key={key}
            type="button"
            className={`tp-chip ${filter === key ? 'active' : ''} ${
              key === 'overdue' && n > 0 ? 'danger' : ''
            }`}
            onClick={() => setFilter(key as Filter)}
          >
            {label}
            <span className="tp-chip-count">{n}</span>
          </button>
        ))}
      </div>

      <div className="tp-list">
        {loading && filtered.length === 0 ? (
          <div className="tp-empty">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="tp-empty">
            {tasks.length === 0
              ? `No tasks in this ${effectiveScope === 'global' ? 'inbox' : 'project'}.`
              : 'No tasks match this filter.'}
          </div>
        ) : (
          filtered.map((t) => (
            <TaskRow
              key={t.id}
              task={t}
              expanded={expandedId === t.id}
              onToggleExpand={() => setExpandedId(expandedId === t.id ? null : t.id)}
              onToggleDone={() => toggleDone(t)}
              onPatch={(patch) => void patchTask(scopeKey, t.id, patch)}
              onDelete={() => void removeTask(scopeKey, t.id)}
            />
          ))
        )}
      </div>

      <div className="tp-add">
        <input
          ref={addInputRef}
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              void submitNew()
            }
          }}
          placeholder="Add a task and press Enter"
        />
      </div>
    </div>
  )
}

interface RowProps {
  task: Task
  expanded: boolean
  onToggleExpand: () => void
  onToggleDone: () => void
  onPatch: (patch: {
    title?: string
    body?: string | null
    status?: TaskStatus
    priority?: TaskPriority
    dueAt?: number | null
  }) => void
  onDelete: () => void
}

function TaskRow({
  task,
  expanded,
  onToggleExpand,
  onToggleDone,
  onPatch,
  onDelete
}: RowProps): React.JSX.Element {
  const overdue = isOverdue(task)
  // Reset local edit buffers when the row's remote content changes. We store
  // a "signature" of the last-seen server values and reset during render if
  // it drifts (React-recommended alternative to setState-in-effect).
  const [title, setTitle] = useState(task.title)
  const [body, setBody] = useState(task.body ?? '')
  const [lastSig, setLastSig] = useState<string>(`${task.id} ${task.title} ${task.body ?? ''}`)
  const nextSig = `${task.id} ${task.title} ${task.body ?? ''}`
  if (nextSig !== lastSig) {
    setLastSig(nextSig)
    setTitle(task.title)
    setBody(task.body ?? '')
  }

  const commit = (): void => {
    const patch: {
      title?: string
      body?: string | null
    } = {}
    if (title.trim() && title.trim() !== task.title) patch.title = title.trim()
    const nextBody = body.trim() ? body : null
    if (nextBody !== task.body) patch.body = nextBody
    if (Object.keys(patch).length > 0) onPatch(patch)
  }

  return (
    <div className={`tp-row ${task.status === 'done' ? 'done' : ''} ${overdue ? 'overdue' : ''}`}>
      <div className="tp-row-main">
        <button
          type="button"
          className={`tp-check ${task.status === 'done' ? 'checked' : ''}`}
          onClick={onToggleDone}
          title={task.status === 'done' ? 'Mark not done' : 'Mark done'}
        >
          {task.status === 'done' && <Check size={11} />}
        </button>
        <button
          type="button"
          className="tp-expand"
          onClick={onToggleExpand}
          title={expanded ? 'Collapse' : 'Expand'}
        >
          {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        </button>
        <span className="tp-title" onClick={onToggleExpand}>
          {task.title}
        </span>
        {task.status === 'doing' && <span className="tp-badge doing">Doing</span>}
        {task.priority !== 0 && (
          <span className={`tp-badge prio prio-${task.priority > 0 ? 'high' : 'low'}`}>
            {PRIORITY_LABEL[task.priority]}
          </span>
        )}
        {task.dueAt != null && (
          <span className={`tp-badge due ${overdue ? 'overdue' : ''}`}>{dueLabel(task.dueAt)}</span>
        )}
        <button type="button" className="tp-row-del" onClick={onDelete} title="Delete">
          <Trash2 size={12} />
        </button>
      </div>
      {expanded && (
        <div className="tp-row-edit">
          <input
            className="tp-row-title-input"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                setTitle(task.title)
                ;(e.target as HTMLInputElement).blur()
              } else if (e.key === 'Enter') {
                ;(e.target as HTMLInputElement).blur()
              }
            }}
          />
          <textarea
            className="tp-row-body"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            onBlur={commit}
            placeholder="Notes (markdown supported)"
            rows={3}
          />
          <div className="tp-row-fields">
            <label>
              Status
              <select
                value={task.status}
                onChange={(e) => onPatch({ status: e.target.value as TaskStatus })}
              >
                <option value="todo">Todo</option>
                <option value="doing">Doing</option>
                <option value="done">Done</option>
              </select>
            </label>
            <label>
              Priority
              <select
                value={task.priority}
                onChange={(e) => onPatch({ priority: Number(e.target.value) as TaskPriority })}
              >
                <option value={-1}>Low</option>
                <option value={0}>Normal</option>
                <option value={1}>High</option>
              </select>
            </label>
            <label>
              Due
              <input
                type="date"
                value={toDateInputValue(task.dueAt)}
                onChange={(e) => onPatch({ dueAt: fromDateInputValue(e.target.value) })}
              />
              {task.dueAt != null && (
                <button
                  type="button"
                  className="tp-due-clear"
                  onClick={() => onPatch({ dueAt: null })}
                  title="Clear due date"
                >
                  <X size={10} />
                </button>
              )}
            </label>
          </div>
        </div>
      )}
    </div>
  )
}
