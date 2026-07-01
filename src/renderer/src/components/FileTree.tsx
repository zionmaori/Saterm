import { useCallback, useEffect, useRef, useState } from 'react'
import { ChevronDown, ChevronRight, File, Folder, FolderOpen } from 'lucide-react'

interface Node {
  path: string
  name: string
  isDir: boolean
  children?: Node[]
}

interface Props {
  root: string
  onOpenFile: (path: string) => void
  selectedPath: string | null
}

interface MenuState {
  x: number
  y: number
  target: Node | null
}

async function loadDir(path: string): Promise<Node[]> {
  const entries = await window.api.fs.readDir(path)
  return entries.map((e) => ({ name: e.name, path: e.path, isDir: e.isDir }))
}

interface CreatingState {
  parentDir: string
  kind: 'file' | 'dir'
}

export default function FileTree({ root, onOpenFile, selectedPath }: Props): React.JSX.Element {
  const [rootNode, setRootNode] = useState<Node | null>(null)
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set([root]))
  const [menu, setMenu] = useState<MenuState | null>(null)
  const [creating, setCreating] = useState<CreatingState | null>(null)
  const [renaming, setRenaming] = useState<string | null>(null)
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  /** Walk the tree; for every expanded dir, load (or reload) its children.
   *  Preserves expansion state for paths that still exist. */
  const buildTree = useCallback(async (): Promise<Node> => {
    const visit = async (path: string, name: string): Promise<Node> => {
      const node: Node = { path, name, isDir: true }
      if (expanded.has(path)) {
        const kids = await loadDir(path)
        node.children = await Promise.all(
          kids.map((k) => (k.isDir ? visit(k.path, k.name) : Promise.resolve(k)))
        )
      }
      return node
    }
    return visit(root, root.split('/').pop() ?? root)
  }, [root, expanded])

  const refresh = useCallback((): void => {
    void buildTree().then(setRootNode)
  }, [buildTree])

  useEffect(() => {
    refresh()
  }, [refresh])

  // Live filesystem watching — re-render the tree on any change in the project.
  // Coalesce bursts with a short debounce so a `git status` rewrite of many
  // files doesn't fire dozens of reloads.
  useEffect(() => {
    void window.api.fs.watch(root)
    const off = window.api.fs.onChanged((evt) => {
      if (evt.root !== root) return
      if (refreshTimer.current) clearTimeout(refreshTimer.current)
      refreshTimer.current = setTimeout(refresh, 120)
    })
    return () => {
      off()
      void window.api.fs.unwatch(root)
      if (refreshTimer.current) clearTimeout(refreshTimer.current)
    }
  }, [root, refresh])

  const toggle = useCallback((node: Node): void => {
    if (!node.isDir) return
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(node.path)) next.delete(node.path)
      else next.add(node.path)
      return next
    })
  }, [])

  // Close the menu when the user clicks outside or presses Escape.
  useEffect(() => {
    if (!menu) return
    const close = (): void => setMenu(null)
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setMenu(null)
    }
    window.addEventListener('mousedown', close)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('mousedown', close)
      window.removeEventListener('keydown', onKey)
    }
  }, [menu])

  const openMenu = (e: React.MouseEvent, node: Node | null): void => {
    e.preventDefault()
    e.stopPropagation()
    setMenu({ x: e.clientX, y: e.clientY, target: node })
  }

  const beginCreate = (parentDir: string, kind: 'file' | 'dir'): void => {
    setExpanded((prev) => new Set(prev).add(parentDir))
    setCreating({ parentDir, kind })
  }

  const commitCreate = async (name: string): Promise<void> => {
    if (!creating) return
    const trimmed = name.trim()
    const { parentDir, kind } = creating
    setCreating(null)
    if (!trimmed) return
    const target = `${parentDir}/${trimmed}`
    try {
      if (kind === 'file') {
        await window.api.fs.newFile(target)
        refresh()
        onOpenFile(target)
      } else {
        await window.api.fs.newDir(target)
        setExpanded((prev) => new Set(prev).add(target))
        refresh()
      }
    } catch (e) {
      alert(`Create failed: ${(e as Error).message}`)
    }
  }

  const commitRename = async (node: Node, next: string): Promise<void> => {
    setRenaming(null)
    const trimmed = next.trim()
    if (!trimmed || trimmed === node.name) return
    const parent = node.path.slice(0, node.path.length - node.name.length)
    try {
      await window.api.fs.rename(node.path, `${parent}${trimmed}`)
      refresh()
    } catch (e) {
      alert(`Rename failed: ${(e as Error).message}`)
    }
  }

  const trash = async (node: Node): Promise<void> => {
    if (!confirm(`Move "${node.name}" to Trash?`)) return
    try {
      await window.api.fs.trash(node.path)
      refresh()
    } catch (e) {
      alert(`Delete failed: ${(e as Error).message}`)
    }
  }

  const renderInlineInput = (
    depth: number,
    kind: 'file' | 'dir',
    initial: string,
    onCommit: (v: string) => void,
    onCancel: () => void
  ): React.JSX.Element => {
    const indent = depth * 12
    return (
      <div className="tree-row tree-row-input" style={{ paddingLeft: 6 + indent }}>
        <span className="tree-chevron" />
        <span className="tree-icon">
          {kind === 'dir' ? (
            <Folder size={13} strokeWidth={1.8} />
          ) : (
            <File size={13} strokeWidth={1.8} />
          )}
        </span>
        <input
          className="tree-input"
          autoFocus
          defaultValue={initial}
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
          onBlur={(e) => onCommit(e.currentTarget.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              onCommit((e.target as HTMLInputElement).value)
            } else if (e.key === 'Escape') {
              e.preventDefault()
              onCancel()
            }
          }}
        />
      </div>
    )
  }

  const renderNode = (n: Node, depth: number): React.JSX.Element => {
    const indent = depth * 12
    const isSelected = n.path === selectedPath
    const isOpen = expanded.has(n.path)
    const isRenaming = renaming === n.path
    return (
      <div key={n.path}>
        {isRenaming ? (
          renderInlineInput(
            depth,
            n.isDir ? 'dir' : 'file',
            n.name,
            (v) => void commitRename(n, v),
            () => setRenaming(null)
          )
        ) : (
          <div
            className={`tree-row ${isSelected ? 'selected' : ''}`}
            style={{ paddingLeft: 6 + indent }}
            onClick={() => (n.isDir ? toggle(n) : onOpenFile(n.path))}
            onDoubleClick={() => !n.isDir && onOpenFile(n.path)}
            onContextMenu={(e) => openMenu(e, n)}
            title={n.path}
          >
            <span className="tree-chevron">
              {n.isDir ? (
                isOpen ? (
                  <ChevronDown size={12} strokeWidth={2} />
                ) : (
                  <ChevronRight size={12} strokeWidth={2} />
                )
              ) : null}
            </span>
            <span className="tree-icon">
              {n.isDir ? (
                isOpen ? (
                  <FolderOpen size={13} strokeWidth={1.8} />
                ) : (
                  <Folder size={13} strokeWidth={1.8} />
                )
              ) : (
                <File size={13} strokeWidth={1.8} />
              )}
            </span>
            <span className="tree-name">{n.name}</span>
          </div>
        )}
        {n.isDir && isOpen && (
          <>
            {creating?.parentDir === n.path &&
              renderInlineInput(
                depth + 1,
                creating.kind,
                '',
                (v) => void commitCreate(v),
                () => setCreating(null)
              )}
            {n.children?.map((c) => renderNode(c, depth + 1))}
          </>
        )}
      </div>
    )
  }

  if (!rootNode) return <div className="empty">Loading…</div>
  return (
    <div className="file-tree" onContextMenu={(e) => openMenu(e, null)}>
      {renderNode(rootNode, 0)}
      {menu && (
        <div
          className="tree-menu"
          style={{ left: menu.x, top: menu.y }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          {(() => {
            const t = menu.target
            const dirForCreate = t
              ? t.isDir
                ? t.path
                : t.path.slice(0, t.path.length - t.name.length - 1)
              : root
            const close = (): void => setMenu(null)
            return (
              <>
                <button
                  onClick={() => {
                    close()
                    beginCreate(dirForCreate, 'file')
                  }}
                >
                  New file
                </button>
                <button
                  onClick={() => {
                    close()
                    beginCreate(dirForCreate, 'dir')
                  }}
                >
                  New folder
                </button>
                {t && t.path !== root && (
                  <>
                    <div className="tree-menu-sep" />
                    <button
                      onClick={() => {
                        close()
                        setRenaming(t.path)
                      }}
                    >
                      Rename…
                    </button>
                    <button
                      className="danger"
                      onClick={() => {
                        close()
                        void trash(t)
                      }}
                    >
                      Delete
                    </button>
                  </>
                )}
              </>
            )
          })()}
        </div>
      )}
    </div>
  )
}
