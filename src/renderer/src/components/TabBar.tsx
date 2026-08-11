import { useEffect, useRef, useState } from 'react'
import { Cloud, FileText, Folder, Plus, Server, Terminal, X, type LucideIcon } from 'lucide-react'
import { useApp, type Tab } from '../store/app'
import type { TabKind } from '../../../shared/types'

const KIND_ICON: Record<TabKind, LucideIcon> = {
  ssh: Server,
  local: Terminal,
  project: Folder,
  eks: Cloud,
  file: FileText
}

const KIND_LABEL: Record<TabKind, string> = {
  ssh: 'SSH',
  local: 'Terminal',
  project: 'Project',
  eks: 'Cluster',
  file: 'File'
}

interface CtxMenuState {
  x: number
  y: number
  tabId: string
}

interface DragState {
  fromIndex: number
  overIndex: number | null
  /** true when the pointer is in the right half of the tab hovered over */
  after: boolean
}

export default function TabBar(): React.JSX.Element {
  const tabs = useApp((s) => s.tabs)
  const activeTabId = useApp((s) => s.activeTabId)
  const setActiveTab = useApp((s) => s.setActiveTab)
  const closeTab = useApp((s) => s.closeTab)
  const openLocalTab = useApp((s) => s.openLocalTab)
  const reorderTab = useApp((s) => s.reorderTab)
  const removeTabWithoutClosing = useApp((s) => s.removeTabWithoutClosing)
  const addTransferredTab = useApp((s) => s.addTransferredTab)

  const [menu, setMenu] = useState<CtxMenuState | null>(null)
  const [drag, setDrag] = useState<DragState | null>(null)
  const menuRef = useRef<HTMLDivElement | null>(null)
  // Computed once — a window's own id never changes for its lifetime.
  const [ownWindowId] = useState(() => window.api.window.info().id)

  // Dismiss context menu on outside click or Escape.
  useEffect(() => {
    if (!menu) return
    const onDown = (e: MouseEvent): void => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenu(null)
    }
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setMenu(null)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [menu])

  const closeOthers = (id: string): void => {
    for (const t of tabs) if (t.id !== id) closeTab(t.id)
  }

  const closeToRight = (id: string): void => {
    const idx = tabs.findIndex((t) => t.id === id)
    if (idx < 0) return
    for (const t of tabs.slice(idx + 1)) closeTab(t.id)
  }

  const closeAll = (): void => {
    for (const t of tabs) closeTab(t.id)
  }

  const onTabMouseDown = (e: React.MouseEvent, t: Tab): void => {
    // Middle-click closes.
    if (e.button === 1) {
      e.preventDefault()
      closeTab(t.id)
    }
  }

  const handleContextMenu = (e: React.MouseEvent, t: Tab): void => {
    e.preventDefault()
    setMenu({ x: e.clientX, y: e.clientY, tabId: t.id })
  }

  const onDragStart = (e: React.DragEvent, index: number): void => {
    e.dataTransfer.effectAllowed = 'move'
    // Firefox requires some payload for the drag to actually start.
    e.dataTransfer.setData('text/plain', String(index))
    // Cross-window payload — every Saterm window runs this same component,
    // so a tab bar in ANOTHER window can recognize and accept this drag via
    // its own onDrop below. Reading this back out only works at drop time
    // (HTML5 DnD restricts getData during dragover for security reasons).
    e.dataTransfer.setData(
      'application/x-saterm-tab',
      JSON.stringify({ tab: tabs[index], sourceWindowId: ownWindowId })
    )
    setDrag({ fromIndex: index, overIndex: null, after: false })
  }

  const onDragOver = (e: React.DragEvent, index: number): void => {
    if (!drag) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    const after = e.clientX - rect.left > rect.width / 2
    setDrag((d) => (d ? { ...d, overIndex: index, after } : d))
  }

  const onDrop = (e: React.DragEvent, index: number): void => {
    e.preventDefault()
    // Cross-window drop: this bar didn't originate the drag (local `drag`
    // state is null here, or belongs to a different tab entirely), so check
    // the payload's source window before falling back to same-window reorder
    // below. Always appends + activates — no cross-window insertion preview
    // in v1, matching TabBar's plan-file scope.
    const raw = e.dataTransfer.getData('application/x-saterm-tab')
    if (raw) {
      try {
        const { tab, sourceWindowId } = JSON.parse(raw) as { tab: Tab; sourceWindowId: number }
        if (sourceWindowId !== ownWindowId) {
          addTransferredTab(tab, true)
          window.api.window.tabAccepted({ sourceWindowId, tabId: tab.id })
          setDrag(null)
          return
        }
      } catch {
        /* not a tab payload — ignore, fall through */
      }
    }
    if (!drag) return
    let target = index + (drag.after ? 1 : 0)
    // Same-slot no-op (dropping just before/after itself).
    if (target > drag.fromIndex) target -= 1
    if (target !== drag.fromIndex) reorderTab(drag.fromIndex, target)
    setDrag(null)
  }

  const onDragEnd = (e: React.DragEvent): void => {
    const fromIndex = drag?.fromIndex
    setDrag(null)
    // dropEffect !== 'none' means either the same-window reorder above
    // already handled it, or a foreign window's onDrop accepted it (it will
    // message back via tab:removed-remote to remove it here). Only
    // 'none' — nothing anywhere accepted the drop — means tear-off: nobody
    // wanted it, so spin up a new window and keep it there.
    if (fromIndex === undefined || e.dataTransfer.dropEffect !== 'none') return
    const tab = tabs[fromIndex]
    if (!tab) return
    void window.api.window
      .createFromDrop({ screenX: e.screenX, screenY: e.screenY, tab })
      .then(() => removeTabWithoutClosing(tab.id))
  }

  const activeMenuTabIndex = menu ? tabs.findIndex((t) => t.id === menu.tabId) : -1
  const hasTabsToRight = activeMenuTabIndex >= 0 && activeMenuTabIndex < tabs.length - 1
  const hasOtherTabs = tabs.length > 1

  return (
    <div className="tabbar" onDragOver={(e) => e.preventDefault()}>
      {tabs.map((t, i) => {
        const Icon = KIND_ICON[t.kind]
        const isActive = t.id === activeTabId
        const isDragging = drag?.fromIndex === i
        const showCueBefore = drag && drag.overIndex === i && !drag.after && drag.fromIndex !== i
        const showCueAfter =
          drag &&
          drag.overIndex === i &&
          drag.after &&
          drag.fromIndex !== i &&
          drag.fromIndex !== i + 1
        return (
          <div
            key={t.id}
            className={[
              'tab',
              isActive ? 'active' : '',
              isDragging ? 'dragging' : '',
              showCueBefore ? 'drop-before' : '',
              showCueAfter ? 'drop-after' : ''
            ]
              .filter(Boolean)
              .join(' ')}
            draggable
            onDragStart={(e) => onDragStart(e, i)}
            onDragOver={(e) => onDragOver(e, i)}
            onDrop={(e) => onDrop(e, i)}
            onDragEnd={onDragEnd}
            onClick={() => setActiveTab(t.id)}
            onMouseDown={(e) => onTabMouseDown(e, t)}
            onContextMenu={(e) => handleContextMenu(e, t)}
            title={`${KIND_LABEL[t.kind]} · ${t.title}`}
            role="tab"
            aria-selected={isActive}
          >
            <Icon size={12} strokeWidth={2} className="tab-icon" aria-hidden />
            <span className="title">{t.title}</span>
            <button
              className="close"
              onClick={(e) => {
                e.stopPropagation()
                closeTab(t.id)
              }}
              onMouseDown={(e) => e.stopPropagation()}
              title="Close (⌘W)"
              aria-label={`Close ${t.title}`}
            >
              <X size={11} strokeWidth={2.4} />
            </button>
          </div>
        )
      })}
      <button
        className="new"
        onClick={() => openLocalTab()}
        title="New local terminal"
        aria-label="New terminal"
      >
        <Plus size={13} strokeWidth={2} />
      </button>

      {menu && (
        <div
          ref={menuRef}
          className="tab-ctx-menu"
          style={{ left: menu.x, top: menu.y }}
          role="menu"
        >
          <button
            role="menuitem"
            onClick={() => {
              closeTab(menu.tabId)
              setMenu(null)
            }}
          >
            Close
            <kbd className="tab-ctx-kbd">⌘W</kbd>
          </button>
          <button
            role="menuitem"
            disabled={!hasOtherTabs}
            onClick={() => {
              closeOthers(menu.tabId)
              setMenu(null)
            }}
          >
            Close others
          </button>
          <button
            role="menuitem"
            disabled={!hasTabsToRight}
            onClick={() => {
              closeToRight(menu.tabId)
              setMenu(null)
            }}
          >
            Close tabs to the right
          </button>
          <div className="tab-ctx-sep" role="separator" />
          <button
            role="menuitem"
            onClick={() => {
              closeAll()
              setMenu(null)
            }}
          >
            Close all
          </button>
        </div>
      )}
    </div>
  )
}
