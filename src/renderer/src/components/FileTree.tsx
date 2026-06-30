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

export default function FileTree({ root, onOpenFile, selectedPath }: Props): React.JSX.Element {
  const [rootNode, setRootNode] = useState<Node | null>(null)
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set([root]))
  const [menu, setMenu] = useState<MenuState | null>(null)
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

  const newFile = async (parentDir: string): Promise<void> => {
    const name = window.prompt('New file name (relative to ' + parentDir.split('/').pop() + '):')
    if (!name?.trim()) return
    try {
      const target = `${parentDir}/${name.trim()}`
      await window.api.fs.newFile(target)
      setExpanded((prev) => new Set(prev).add(parentDir))
      refresh()
      onOpenFile(target)
    } catch (e) {
      alert(`Create failed: ${(e as Error).message}`)
    }
  }

  const newFolder = async (parentDir: string): Promise<void> => {
    const name = window.prompt('New folder name:')
    if (!name?.trim()) return
    try {
      await window.api.fs.newDir(`${parentDir}/${name.trim()}`)
      setExpanded((prev) => new Set(prev).add(parentDir))
      refresh()
    } catch (e) {
      alert(`Create failed: ${(e as Error).message}`)
    }
  }

  const rename = async (node: Node): Promise<void> => {
    const next = window.prompt('Rename:', node.name)
    if (!next?.trim() || next === node.name) return
    const parent = node.path.slice(0, node.path.length - node.name.length)
    try {
      await window.api.fs.rename(node.path, `${parent}${next.trim()}`)
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

  const renderNode = (n: Node, depth: number): React.JSX.Element => {
    const indent = depth * 12
    const isSelected = n.path === selectedPath
    const isOpen = expanded.has(n.path)
    return (
      <div key={n.path}>
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
        {n.isDir && isOpen && n.children?.map((c) => renderNode(c, depth + 1))}
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
            const dirForCreate = t ? (t.isDir ? t.path : t.path.slice(0, t.path.length - t.name.length - 1)) : root
            const close = (): void => setMenu(null)
            return (
              <>
                <button onClick={() => { close(); void newFile(dirForCreate) }}>New file</button>
                <button onClick={() => { close(); void newFolder(dirForCreate) }}>New folder</button>
                {t && t.path !== root && (
                  <>
                    <div className="tree-menu-sep" />
                    <button onClick={() => { close(); void rename(t) }}>Rename…</button>
                    <button className="danger" onClick={() => { close(); void trash(t) }}>Delete</button>
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
