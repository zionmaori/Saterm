import { useEffect, useMemo, useState } from 'react'
import { useApp } from '../store/app'

interface Props {
  open: boolean
  mode: 'palette' | 'quickopen'
  onClose: () => void
  projectRoot?: string
  onOpenFile?: (path: string) => void
}

interface PaletteCommand {
  id: string
  label: string
  meta?: string
  run: () => void
}

export default function CommandPalette({
  open,
  mode,
  onClose,
  projectRoot,
  onOpenFile
}: Props): React.JSX.Element | null {
  const hosts = useApp((s) => s.hosts)
  const projects = useApp((s) => s.projects)
  const openSshTab = useApp((s) => s.openSshTab)
  const openProjectTab = useApp((s) => s.openProjectTab)
  const openLocalTab = useApp((s) => s.openLocalTab)
  const openFileTab = useApp((s) => s.openFileTab)
  const refreshHosts = useApp((s) => s.refreshHosts)
  const refreshProjects = useApp((s) => s.refreshProjects)

  const [query, setQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [quickFiles, setQuickFiles] = useState<
    { name: string; relPath: string; absPath: string }[]
  >([])

  // Reset the query when the palette closes and the selection whenever it
  // opens/closes or switches mode (adjusting state during render rather than
  // in an effect avoids an extra render pass).
  const [prevOpenMode, setPrevOpenMode] = useState({ open, mode })
  if (prevOpenMode.open !== open || prevOpenMode.mode !== mode) {
    setPrevOpenMode({ open, mode })
    setSelectedIndex(0)
    if (!open) setQuery('')
  }

  useEffect(() => {
    if (!open) return
    if (mode === 'quickopen' && projectRoot) {
      void window.api.fs.quickOpen(projectRoot).then(setQuickFiles)
    }
  }, [open, mode, projectRoot])

  const commands: PaletteCommand[] = useMemo(() => {
    if (!open) return []
    if (mode === 'quickopen') {
      return quickFiles.map((f) => ({
        id: f.absPath,
        label: f.relPath,
        meta: f.name,
        run: () => {
          onOpenFile?.(f.absPath)
          onClose()
        }
      }))
    }
    const cmds: PaletteCommand[] = [
      {
        id: 'cmd:new-local',
        label: 'New local terminal',
        meta: 'terminal',
        run: () => {
          openLocalTab()
          onClose()
        }
      },
      {
        id: 'cmd:open-file',
        label: 'Open file…',
        meta: '⌘O',
        run: async () => {
          const paths = await window.api.fs.pickFile()
          for (const p of paths) openFileTab(p)
          onClose()
        }
      },
      {
        id: 'cmd:add-project',
        label: 'Add project…',
        meta: 'project',
        run: async () => {
          const p = await window.api.projects.pick()
          if (p) {
            await refreshProjects()
            openProjectTab(p)
          }
          onClose()
        }
      },
      {
        id: 'cmd:import-ssh',
        label: 'Import ~/.ssh/config',
        meta: 'hosts',
        run: async () => {
          try {
            const r = await window.api.hosts.importSshConfig()
            await refreshHosts()
            alert(`Imported ${r.added} new hosts (${r.skipped} skipped of ${r.total})`)
          } catch (e) {
            alert((e as Error).message)
          }
          onClose()
        }
      },
      {
        id: 'cmd:import-known-hosts',
        label: 'Import ~/.ssh/known_hosts',
        meta: 'hosts',
        run: async () => {
          try {
            const r = await window.api.hosts.importKnownHosts()
            await refreshHosts()
            alert(`Imported ${r.added} new hosts (${r.skipped} skipped of ${r.total})`)
          } catch (e) {
            alert((e as Error).message)
          }
          onClose()
        }
      },
      {
        id: 'cmd:install-cli',
        label: "Install 'saterm' command in PATH",
        meta: 'cli',
        run: async () => {
          try {
            const r = await window.api.cli.install()
            alert(
              r.onPath
                ? `Installed to ${r.path}. Open a new terminal and try "saterm".`
                : `Installed to ${r.path}, but that directory isn't on your $PATH — add it, then open a new terminal and try "saterm".`
            )
          } catch (e) {
            alert((e as Error).message)
          }
          onClose()
        }
      }
    ]
    for (const h of hosts) {
      cmds.push({
        id: `host:${h.id}`,
        label: `SSH → ${h.name}`,
        meta: `${h.user}@${h.hostname}:${h.port}`,
        run: () => {
          openSshTab(h)
          onClose()
        }
      })
    }
    for (const p of projects) {
      cmds.push({
        id: `project:${p.id}`,
        label: `Open project: ${p.name}`,
        meta: p.path,
        run: () => {
          openProjectTab(p)
          onClose()
        }
      })
    }
    return cmds
  }, [
    open,
    mode,
    quickFiles,
    hosts,
    projects,
    onClose,
    onOpenFile,
    openLocalTab,
    openProjectTab,
    openSshTab,
    refreshHosts,
    refreshProjects
  ])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return commands.slice(0, 200)
    return commands
      .filter((c) => c.label.toLowerCase().includes(q) || c.meta?.toLowerCase().includes(q))
      .slice(0, 200)
  }, [commands, query])

  if (!open) return null

  return (
    <div
      className="dialog-backdrop"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
      style={{ background: 'rgba(0,0,0,0.4)' }}
    >
      <div className="palette" onMouseDown={(e) => e.stopPropagation()}>
        <input
          autoFocus
          placeholder={mode === 'quickopen' ? 'Open file in project…' : 'Type a command or host…'}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setSelectedIndex(0)
          }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault()
              setSelectedIndex((i) => Math.min(i + 1, filtered.length - 1))
            } else if (e.key === 'ArrowUp') {
              e.preventDefault()
              setSelectedIndex((i) => Math.max(0, i - 1))
            } else if (e.key === 'Enter') {
              e.preventDefault()
              filtered[selectedIndex]?.run()
            } else if (e.key === 'Escape') {
              onClose()
            }
          }}
        />
        <ul>
          {filtered.map((c, i) => (
            <li
              key={c.id}
              aria-selected={i === selectedIndex}
              onMouseEnter={() => setSelectedIndex(i)}
              onClick={() => c.run()}
            >
              <span>{c.label}</span>
              {c.meta && <span className="meta">{c.meta}</span>}
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
