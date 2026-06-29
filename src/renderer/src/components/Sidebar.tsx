import { useEffect, useMemo, useRef, useState } from 'react'
import { Folder, GitBranch, Pin, Plus, Search, Settings2, Star, Tag, Terminal, X } from 'lucide-react'
import { useApp } from '../store/app'
import { useFilter } from '../store/filter'
import type { GroupCount, Host, HostInput, TagCount } from '../../../shared/types'
import HostForm from './HostForm'
import Chip, { intentForTag } from './Chip'

const PINNED_LIMIT = 12
const RECENT_LIMIT = 6

function hostMatchesQuery(h: Host, q: string): boolean {
  if (!q) return true
  const needle = q.toLowerCase()
  return (
    h.name.toLowerCase().includes(needle) ||
    h.hostname.toLowerCase().includes(needle) ||
    h.user.toLowerCase().includes(needle) ||
    h.tags.some((t) => t.includes(needle))
  )
}

function hostMatchesTags(h: Host, tags: string[], combine: 'and' | 'or'): boolean {
  if (tags.length === 0) return true
  if (tags.length === 1 && tags[0] === '__untagged__') return h.tags.length === 0
  if (combine === 'or') return tags.some((t) => h.tags.includes(t))
  return tags.every((t) => h.tags.includes(t))
}

function hostMatchesGroups(h: Host, groups: string[]): boolean {
  if (groups.length === 0) return true
  if (groups.length === 1 && groups[0] === '__nogroup__') return !h.group
  return groups.some((g) => h.group === g)
}

export default function Sidebar(): React.JSX.Element {
  const hosts = useApp((s) => s.hosts)
  const projects = useApp((s) => s.projects)
  const openSshTab = useApp((s) => s.openSshTab)
  const openLocalTab = useApp((s) => s.openLocalTab)
  const openProjectTab = useApp((s) => s.openProjectTab)
  const refreshHosts = useApp((s) => s.refreshHosts)
  const refreshProjects = useApp((s) => s.refreshProjects)

  const query = useFilter((s) => s.query)
  const activeTags = useFilter((s) => s.activeTags)
  const activeGroups = useFilter((s) => s.activeGroups)
  const combine = useFilter((s) => s.combine)
  const setQuery = useFilter((s) => s.setQuery)
  const toggleTag = useFilter((s) => s.toggleTag)
  const clearTags = useFilter((s) => s.clearTags)
  const toggleGroup = useFilter((s) => s.toggleGroup)
  const clearGroups = useFilter((s) => s.clearGroups)
  const setCombine = useFilter((s) => s.setCombine)

  const [editing, setEditing] = useState<Host | null | undefined>(undefined)
  const [showAllTags, setShowAllTags] = useState(false)
  const [allTags, setAllTags] = useState<TagCount[]>([])
  const [allGroups, setAllGroups] = useState<GroupCount[]>([])
  const [showAllGroups, setShowAllGroups] = useState(false)
  const [groupSort, setGroupSort] = useState<'count' | 'name'>('count')
  const [hostSort, setHostSort] = useState<'default' | 'name' | 'recent'>('default')
  const [projectSort, setProjectSort] = useState<'recent' | 'name'>('recent')
  const searchInputRef = useRef<HTMLInputElement>(null)

  // ⌘F focuses the search box.
  useEffect(() => {
    const handler = (e: KeyboardEvent): void => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'f' && !e.shiftKey) {
        // Only when sidebar isn't inside a chat / editor / palette already.
        const active = document.activeElement
        const inProject = active?.closest('.chat-panel, .editor-host, .palette, .search-panel')
        if (inProject) return
        e.preventDefault()
        searchInputRef.current?.focus()
        searchInputRef.current?.select()
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [])

  useEffect(() => {
    void window.api.hosts.listTags().then(setAllTags)
    void window.api.hosts.listGroups().then(setAllGroups)
  }, [hosts])

  const matched = useMemo(() => {
    const filtered = hosts.filter(
      (h) =>
        hostMatchesQuery(h, query) &&
        hostMatchesTags(h, activeTags, combine) &&
        hostMatchesGroups(h, activeGroups)
    )
    if (hostSort === 'name') {
      return [...filtered].sort((a, b) =>
        a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
      )
    }
    if (hostSort === 'recent') {
      return [...filtered].sort((a, b) => (b.lastUsedAt ?? 0) - (a.lastUsedAt ?? 0))
    }
    return filtered
  }, [hosts, query, activeTags, combine, activeGroups, hostSort])

  const pinned = useMemo(
    () =>
      hosts
        .filter((h) => h.pinnedAt && hostMatchesQuery(h, query))
        .sort((a, b) => (b.pinnedAt ?? 0) - (a.pinnedAt ?? 0))
        .slice(0, PINNED_LIMIT),
    [hosts, query]
  )

  const recent = useMemo(() => {
    const pinnedIds = new Set(pinned.map((h) => h.id))
    return hosts
      .filter((h) => h.lastUsedAt && !pinnedIds.has(h.id) && hostMatchesQuery(h, query))
      .sort((a, b) => (b.lastUsedAt ?? 0) - (a.lastUsedAt ?? 0))
      .slice(0, RECENT_LIMIT)
  }, [hosts, pinned, query])

  const visibleTags = useMemo(() => {
    const ts = allTags
    if (query) {
      const q = query.toLowerCase()
      return ts.filter((t) => t.tag.includes(q))
    }
    return showAllTags ? ts : ts.slice(0, 18)
  }, [allTags, query, showAllTags])

  const untaggedCount = useMemo(() => hosts.filter((h) => h.tags.length === 0).length, [hosts])

  const visibleGroups = useMemo(() => {
    const sorted =
      groupSort === 'name'
        ? [...allGroups].sort((a, b) => a.group.localeCompare(b.group, undefined, { sensitivity: 'base' }))
        : allGroups
    if (query) {
      const q = query.toLowerCase()
      return sorted.filter((g) => g.group.toLowerCase().includes(q))
    }
    return showAllGroups ? sorted : sorted.slice(0, 12)
  }, [allGroups, query, showAllGroups, groupSort])

  const noGroupCount = useMemo(() => hosts.filter((h) => !h.group).length, [hosts])

  const sortedProjects = useMemo(() => {
    if (projectSort === 'name') {
      return [...projects].sort((a, b) =>
        a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
      )
    }
    return [...projects].sort((a, b) => (b.lastOpenedAt ?? 0) - (a.lastOpenedAt ?? 0))
  }, [projects, projectSort])

  const onSaveHost = async (input: HostInput): Promise<void> => {
    if (editing) await window.api.hosts.update(editing.id, input)
    else await window.api.hosts.create(input)
    setEditing(undefined)
    await refreshHosts()
  }

  const onDeleteHost = async (): Promise<void> => {
    if (!editing) return
    if (!confirm(`Delete host "${editing.name}"?`)) return
    await window.api.hosts.delete(editing.id)
    setEditing(undefined)
    await refreshHosts()
  }

  const togglePin = async (h: Host): Promise<void> => {
    await window.api.hosts.pin(h.id, !h.pinnedAt)
    await refreshHosts()
  }

  const importConfig = async (): Promise<void> => {
    try {
      const r = await window.api.hosts.importSshConfig()
      await refreshHosts()
      alert(`Imported ${r.added} new hosts (${r.skipped} skipped, ${r.total} found)`)
    } catch (e) {
      alert(`Import failed: ${(e as Error).message}`)
    }
  }

  const importKnown = async (): Promise<void> => {
    try {
      const r = await window.api.hosts.importKnownHosts()
      await refreshHosts()
      alert(`Imported ${r.added} new hosts (${r.skipped} skipped, ${r.total} found)`)
    } catch (e) {
      alert(`Import failed: ${(e as Error).message}`)
    }
  }

  const pickProject = async (): Promise<void> => {
    const p = await window.api.projects.pick()
    if (p) {
      await refreshProjects()
      openProjectTab(p)
    }
  }

  return (
    <aside className="sidebar2">
      {/* Search box */}
      <div className="sidebar2-search">
        <Search size={13} strokeWidth={2} className="sidebar2-search-icon" />
        <input
          ref={searchInputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filter hosts and tags…"
          spellCheck={false}
        />
        {query && (
          <button
            className="sidebar2-search-clear"
            onClick={() => setQuery('')}
            title="Clear"
            tabIndex={-1}
          >
            <X size={12} />
          </button>
        )}
        <kbd className="titlebar-kbd" style={{ marginLeft: 4 }}>
          ⌘F
        </kbd>
      </div>

      <div className="sidebar2-scroll">
        {/* Pinned */}
        {pinned.length > 0 && (
          <Section title="Pinned" count={pinned.length}>
            {pinned.map((h) => (
              <HostRow
                key={h.id}
                host={h}
                onOpen={() => openSshTab(h)}
                onEdit={() => setEditing(h)}
                onTogglePin={() => togglePin(h)}
                onTagClick={(t, add) => toggleTag(t, add)}
                activeTags={activeTags}
              />
            ))}
          </Section>
        )}

        {/* Recent */}
        {recent.length > 0 && (
          <Section title="Recent" count={recent.length}>
            {recent.map((h) => (
              <HostRow
                key={h.id}
                host={h}
                onOpen={() => openSshTab(h)}
                onEdit={() => setEditing(h)}
                onTogglePin={() => togglePin(h)}
                onTagClick={(t, add) => toggleTag(t, add)}
                activeTags={activeTags}
                showTimestamp
              />
            ))}
          </Section>
        )}

        {/* Groups */}
        <Section
          title="Groups"
          count={allGroups.length}
          right={
            <>
              <button
                type="button"
                className="sidebar2-link"
                onClick={() => setGroupSort((s) => (s === 'count' ? 'name' : 'count'))}
                title={
                  groupSort === 'count'
                    ? 'Sorted by count — click to sort by name'
                    : 'Sorted by name — click to sort by count'
                }
              >
                {groupSort === 'count' ? 'A–Z' : 'count'}
              </button>
              {activeGroups.length > 0 && (
                <button className="sidebar2-link" onClick={() => clearGroups()}>
                  clear
                </button>
              )}
            </>
          }
        >
          <div className="tag-rail">
            <Chip
              kind="tag"
              intent="neutral"
              active={activeGroups.includes('__nogroup__')}
              onClick={(e) => toggleGroup('__nogroup__', e.metaKey || e.ctrlKey)}
              title={`${noGroupCount} hosts have no group`}
            >
              no group
              <span className="chip-count">{noGroupCount}</span>
            </Chip>
            {visibleGroups.map((g) => (
              <Chip
                key={g.group}
                kind="tag"
                intent="info"
                active={activeGroups.includes(g.group)}
                onClick={(e) => toggleGroup(g.group, e.metaKey || e.ctrlKey)}
                title={`${g.count} hosts in "${g.group}" · click to filter · ⌘-click to combine`}
              >
                {g.group}
                <span className="chip-count">{g.count}</span>
              </Chip>
            ))}
            {!query && allGroups.length > 12 && (
              <button className="sidebar2-link" onClick={() => setShowAllGroups((v) => !v)}>
                {showAllGroups ? 'less' : `+${allGroups.length - 12} more`}
              </button>
            )}
          </div>
        </Section>

        {/* Tags */}
        <Section
          title="Tags"
          count={allTags.length}
          right={
            activeTags.length > 0 ? (
              <button
                className="sidebar2-link"
                onClick={() => {
                  clearTags()
                  setCombine('and')
                }}
              >
                clear
              </button>
            ) : null
          }
        >
          <div className="tag-rail">
            <Chip
              kind="tag"
              intent="neutral"
              active={activeTags.includes('__untagged__')}
              onClick={(e) => toggleTag('__untagged__', e.metaKey || e.ctrlKey)}
              title={`${untaggedCount} hosts have no tags`}
            >
              untagged
              <span className="chip-count">{untaggedCount}</span>
            </Chip>
            {visibleTags.map((t) => (
              <Chip
                key={t.tag}
                kind="tag"
                intent={intentForTag(t.tag)}
                active={activeTags.includes(t.tag)}
                onClick={(e) => toggleTag(t.tag, e.metaKey || e.ctrlKey)}
                title={`${t.count} hosts · click to filter · ⌘-click to combine`}
              >
                #{t.tag}
                <span className="chip-count">{t.count}</span>
              </Chip>
            ))}
            {!query && allTags.length > 18 && (
              <button className="sidebar2-link" onClick={() => setShowAllTags((v) => !v)}>
                {showAllTags ? 'less' : `+${allTags.length - 18} more`}
              </button>
            )}
          </div>
          {activeTags.length > 1 && (
            <div className="tag-combine">
              <button
                type="button"
                className={combine === 'and' ? 'sidebar2-link active' : 'sidebar2-link'}
                onClick={() => setCombine('and')}
              >
                AND
              </button>
              <button
                type="button"
                className={combine === 'or' ? 'sidebar2-link active' : 'sidebar2-link'}
                onClick={() => setCombine('or')}
              >
                OR
              </button>
            </div>
          )}
        </Section>

        {/* Hosts list */}
        <Section
          title="Hosts"
          count={matched.length}
          right={
            <>
              <button
                type="button"
                className="sidebar2-link"
                onClick={(e) => {
                  e.stopPropagation()
                  setHostSort((s) =>
                    s === 'default' ? 'name' : s === 'name' ? 'recent' : 'default'
                  )
                }}
                title={
                  hostSort === 'default'
                    ? 'Default order — click to sort by name'
                    : hostSort === 'name'
                      ? 'Sorted by name — click to sort by recent'
                      : 'Sorted by recent — click for default order'
                }
              >
                {hostSort === 'default' ? 'sort' : hostSort === 'name' ? 'A–Z' : 'recent'}
              </button>
              <button
                className="sidebar2-icon"
                title="Import from ~/.ssh/config"
                onClick={(e) => {
                  e.stopPropagation()
                  void importConfig()
                }}
              >
                <Settings2 size={13} />
              </button>
              <button
                className="sidebar2-icon"
                title="Import from ~/.ssh/known_hosts"
                onClick={(e) => {
                  e.stopPropagation()
                  void importKnown()
                }}
              >
                <Tag size={13} />
              </button>
              <button
                className="sidebar2-icon"
                title="Add host"
                onClick={(e) => {
                  e.stopPropagation()
                  setEditing(null)
                }}
              >
                <Plus size={13} />
              </button>
            </>
          }
        >
          <HostList
            hosts={matched}
            onOpen={openSshTab}
            onEdit={setEditing}
            onTogglePin={togglePin}
            onTagClick={(t, add) => toggleTag(t, add)}
            activeTags={activeTags}
          />
        </Section>

        {/* Local terminal */}
        <Section title="Local" count={0}>
          <button
            className="sidebar2-row sidebar2-row-action"
            onClick={() => openLocalTab()}
            title="Open a new local terminal"
          >
            <Terminal size={13} strokeWidth={2} />
            <span>New local terminal</span>
          </button>
        </Section>

        {/* Projects */}
        <Section
          title="Projects"
          count={projects.length}
          right={
            <>
              <button
                type="button"
                className="sidebar2-link"
                onClick={(e) => {
                  e.stopPropagation()
                  setProjectSort((s) => (s === 'recent' ? 'name' : 'recent'))
                }}
                title={
                  projectSort === 'recent'
                    ? 'Sorted by recent — click to sort by name'
                    : 'Sorted by name — click to sort by recent'
                }
              >
                {projectSort === 'recent' ? 'A–Z' : 'recent'}
              </button>
              <button
                className="sidebar2-icon"
                title="Add project"
                onClick={(e) => {
                  e.stopPropagation()
                  void pickProject()
                }}
              >
                <Plus size={13} />
              </button>
            </>
          }
        >
          {sortedProjects.map((p) => (
            <button
              key={p.id}
              className="sidebar2-row"
              onClick={() => openProjectTab(p)}
              title={p.path}
            >
              <Folder size={13} strokeWidth={2} />
              <span className="sidebar2-row-title">{p.name}</span>
              {p.vcs !== 'none' && (
                <span className="sidebar2-row-meta">
                  <GitBranch size={10} strokeWidth={2} /> {p.vcs}
                </span>
              )}
            </button>
          ))}
        </Section>
      </div>

      <div className="sidebar2-footer">
        <kbd>⌘K</kbd> palette · <kbd>⌘F</kbd> search · <kbd>⌘P</kbd> open · <kbd>⌘⇧F</kbd> grep
      </div>

      {editing !== undefined && (
        <HostForm
          initial={editing}
          onSave={onSaveHost}
          onCancel={() => setEditing(undefined)}
          onDelete={editing ? onDeleteHost : undefined}
        />
      )}
    </aside>
  )
}

// --- Section ---

function Section({
  title,
  count,
  right,
  children
}: {
  title: string
  count: number
  right?: React.ReactNode
  children: React.ReactNode
}): React.JSX.Element {
  const [open, setOpen] = useState(false)
  return (
    <div className="sidebar2-section">
      <div className="sidebar2-section-header" onClick={() => setOpen((v) => !v)}>
        <span className="sidebar2-section-title">{title}</span>
        <span className="sidebar2-section-count">{count}</span>
        <span className="sidebar2-section-actions" onClick={(e) => e.stopPropagation()}>
          {right}
        </span>
      </div>
      {open && <div className="sidebar2-section-body">{children}</div>}
    </div>
  )
}

// --- HostList (windowed-light) ---

function HostList({
  hosts,
  onOpen,
  onEdit,
  onTogglePin,
  onTagClick,
  activeTags
}: {
  hosts: Host[]
  onOpen: (h: Host) => void
  onEdit: (h: Host) => void
  onTogglePin: (h: Host) => Promise<void>
  onTagClick: (t: string, additive: boolean) => void
  activeTags: string[]
}): React.JSX.Element {
  // No virtualization for now (≤360 rows renders in <8ms); revisit if it gets slow.
  if (!hosts.length) return <div className="sidebar2-empty">No hosts match.</div>
  return (
    <>
      {hosts.map((h) => (
        <HostRow
          key={h.id}
          host={h}
          onOpen={() => onOpen(h)}
          onEdit={() => onEdit(h)}
          onTogglePin={() => onTogglePin(h)}
          onTagClick={onTagClick}
          activeTags={activeTags}
        />
      ))}
    </>
  )
}

// --- HostRow ---

function relativeTime(ts: number | null): string {
  if (!ts) return ''
  const dt = Date.now() - ts
  if (dt < 60_000) return 'just now'
  if (dt < 3_600_000) return `${Math.floor(dt / 60_000)}m`
  if (dt < 86_400_000) return `${Math.floor(dt / 3_600_000)}h`
  if (dt < 7 * 86_400_000) return `${Math.floor(dt / 86_400_000)}d`
  return new Date(ts).toLocaleDateString()
}

function HostRow({
  host,
  onOpen,
  onEdit,
  onTogglePin,
  onTagClick,
  activeTags,
  showTimestamp
}: {
  host: Host
  onOpen: () => void
  onEdit: () => void
  onTogglePin: () => void
  onTagClick: (tag: string, additive: boolean) => void
  activeTags: string[]
  showTimestamp?: boolean
}): React.JSX.Element {
  const isPinned = !!host.pinnedAt
  return (
    <div
      className="sidebar2-host"
      onClick={onOpen}
      onContextMenu={(e) => {
        e.preventDefault()
        onEdit()
      }}
      title={`${host.user}@${host.hostname}:${host.port}`}
    >
      <button
        className={`sidebar2-host-pin ${isPinned ? 'pinned' : ''}`}
        onClick={(e) => {
          e.stopPropagation()
          onTogglePin()
        }}
        title={isPinned ? 'Unpin' : 'Pin'}
      >
        {isPinned ? <Star size={11} fill="currentColor" /> : <Pin size={11} />}
      </button>
      <span className="sidebar2-host-name">{host.name}</span>
      <span className="sidebar2-host-meta">
        {showTimestamp ? relativeTime(host.lastUsedAt) : ''}
      </span>
      {host.tags.length > 0 && (
        <span className="sidebar2-host-tags">
          {host.tags.slice(0, 3).map((t) => (
            <Chip
              key={t}
              kind="tag"
              intent={intentForTag(t)}
              active={activeTags.includes(t)}
              onClick={(e) => {
                e.stopPropagation()
                onTagClick(t, e.metaKey || e.ctrlKey)
              }}
            >
              #{t}
            </Chip>
          ))}
          {host.tags.length > 3 && (
            <span className="sidebar2-host-tagmore">+{host.tags.length - 3}</span>
          )}
        </span>
      )}
    </div>
  )
}
