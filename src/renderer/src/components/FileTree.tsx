import { useCallback, useEffect, useState } from 'react'
import { ChevronDown, ChevronRight, File, Folder, FolderOpen } from 'lucide-react'

interface Node {
  path: string
  name: string
  isDir: boolean
  expanded?: boolean
  children?: Node[]
  loaded?: boolean
}

interface Props {
  root: string
  onOpenFile: (path: string) => void
  selectedPath: string | null
}

async function loadDir(path: string): Promise<Node[]> {
  const entries = await window.api.fs.readDir(path)
  return entries.map((e) => ({ name: e.name, path: e.path, isDir: e.isDir }))
}

export default function FileTree({ root, onOpenFile, selectedPath }: Props): React.JSX.Element {
  const [rootNode, setRootNode] = useState<Node | null>(null)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const children = await loadDir(root)
      if (cancelled) return
      setRootNode({
        path: root,
        name: root.split('/').pop() ?? root,
        isDir: true,
        expanded: true,
        loaded: true,
        children
      })
    })()
    return () => {
      cancelled = true
    }
  }, [root])

  const toggle = useCallback(async (node: Node): Promise<void> => {
    if (!node.isDir) return
    if (!node.loaded) {
      node.children = await loadDir(node.path)
      node.loaded = true
    }
    node.expanded = !node.expanded
    setRootNode((r) => (r ? { ...r } : r))
  }, [])

  const renderNode = (n: Node, depth: number): React.JSX.Element => {
    const indent = depth * 12
    const isSelected = n.path === selectedPath
    return (
      <div key={n.path}>
        <div
          className={`tree-row ${isSelected ? 'selected' : ''}`}
          style={{ paddingLeft: 6 + indent }}
          onClick={() => (n.isDir ? toggle(n) : onOpenFile(n.path))}
          onDoubleClick={() => !n.isDir && onOpenFile(n.path)}
          title={n.path}
        >
          <span className="tree-chevron">
            {n.isDir ? (
              n.expanded ? (
                <ChevronDown size={12} strokeWidth={2} />
              ) : (
                <ChevronRight size={12} strokeWidth={2} />
              )
            ) : null}
          </span>
          <span className="tree-icon">
            {n.isDir ? (
              n.expanded ? (
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
        {n.isDir && n.expanded && n.children?.map((c) => renderNode(c, depth + 1))}
      </div>
    )
  }

  if (!rootNode) return <div className="empty">Loading…</div>
  return <div className="file-tree">{renderNode(rootNode, 0)}</div>
}
