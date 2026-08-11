import { useEffect, useMemo, useRef, useState } from 'react'
import {
  BotMessageSquare,
  Box,
  Bug,
  ChevronDown,
  ChevronRight,
  ChevronsDownUp,
  ChevronsUpDown,
  Cloud,
  Folder,
  GitBranch,
  Orbit,
  Pin,
  Plus,
  Radar,
  RefreshCw,
  Rocket,
  Satellite,
  Search,
  Server,
  Settings2,
  Sparkles,
  Star,
  Tag,
  Telescope,
  Terminal,
  X,
  type LucideIcon
} from 'lucide-react'
import { useApp } from '../store/app'
import { useFilter } from '../store/filter'
import type {
  AwsProfile,
  EksCluster,
  GroupCount,
  Host,
  HostInput,
  Snippet,
  TagCount
} from '../../../shared/types'
import HostForm from './HostForm'
import SnippetForm from './SnippetForm'
import BugReportDialog from './BugReportDialog'
import TagForm from './TagForm'
import GroupForm from './GroupForm'
import Modal from './Modal'
import Chip, { intentForTag } from './Chip'
import SidebarTipsWidget from './SidebarTipsWidget'

const COMMON_AWS_REGIONS = [
  'us-east-1',
  'us-east-2',
  'us-west-1',
  'us-west-2',
  'eu-west-1',
  'eu-west-2',
  'eu-central-1',
  'ap-southeast-1',
  'ap-southeast-2',
  'ap-northeast-1',
  'ap-south-1'
]

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
  const awsProfiles = useApp((s) => s.awsProfiles)
  const awsClustersByProfile = useApp((s) => s.awsClustersByProfile)
  const awsLoading = useApp((s) => s.awsLoading)
  const awsRegions = useApp((s) => s.awsRegions)
  const refreshAwsProfiles = useApp((s) => s.refreshAwsProfiles)
  const refreshAwsClusters = useApp((s) => s.refreshAwsClusters)
  const setAwsRegion = useApp((s) => s.setAwsRegion)
  const openEksTab = useApp((s) => s.openEksTab)
  const openEksDashboardTab = useApp((s) => s.openEksDashboardTab)
  const openEksK9sTab = useApp((s) => s.openEksK9sTab)

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
  const [snippets, setSnippets] = useState<Snippet[]>([])
  const [editingSnippet, setEditingSnippet] = useState<Snippet | null | undefined>(undefined)
  const [confirmingSnippet, setConfirmingSnippet] = useState<Snippet | null>(null)
  const [bugDialogOpen, setBugDialogOpen] = useState(false)
  const [tagDialogOpen, setTagDialogOpen] = useState(false)
  const [groupDialogOpen, setGroupDialogOpen] = useState(false)
  const [hostSort, setHostSort] = useState<'default' | 'name' | 'recent'>('default')
  const [projectSort, setProjectSort] = useState<'recent' | 'name'>('recent')
  const [allCollapsed, setAllCollapsed] = useState(false)
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

  const refreshSnippets = (): void => {
    void window.api.snippets.list().then(setSnippets)
  }
  useEffect(refreshSnippets, [])

  useEffect(() => {
    void refreshAwsProfiles()
  }, [refreshAwsProfiles])

  // Reset the collapse-all button's toggle state whenever the user manually
  // opens/closes an individual section — otherwise the icon can lie.
  useEffect(() => {
    const handler = (): void => setAllCollapsed(false)
    window.addEventListener('sidebar:section-toggled', handler)
    return () => window.removeEventListener('sidebar:section-toggled', handler)
  }, [])

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
        ? [...allGroups].sort((a, b) =>
            a.group.localeCompare(b.group, undefined, { sensitivity: 'base' })
          )
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

  const onSaveSnippet = async (
    title: string,
    body: string,
    hostFilter: string | null,
    confirmBeforeRun: boolean
  ): Promise<void> => {
    if (editingSnippet) {
      await window.api.snippets.update(editingSnippet.id, title, body, hostFilter, confirmBeforeRun)
    } else {
      await window.api.snippets.create(title, body, hostFilter, confirmBeforeRun)
    }
    setEditingSnippet(undefined)
    refreshSnippets()
  }

  const onDeleteSnippet = async (): Promise<void> => {
    if (!editingSnippet) return
    await window.api.snippets.delete(editingSnippet.id)
    setEditingSnippet(undefined)
    refreshSnippets()
  }

  const insertSnippetBody = (body: string): void => {
    // Read fresh rather than off the `activeTab` closure so a tab opened
    // moments earlier in the same synchronous call (e.g. by the CLI's
    // `saterm snippet` handler below) is already visible here.
    const { tabs: curTabs, activeTabId: curActiveId } = useApp.getState()
    const tab = curTabs.find((t) => t.id === curActiveId) ?? null
    if (!tab) return
    const targetId =
      tab.kind === 'project'
        ? ((
            window as Window & { __termionProjectTerm?: Map<string, import('../store/app').Tab> }
          ).__termionProjectTerm?.get(tab.id)?.id ?? null)
        : tab.id
    if (targetId) window.__termionInsertText?.(targetId, body)
  }

  const onCreateTag = async (tag: string, hostIds: number[]): Promise<void> => {
    await window.api.hosts.bulkSetTag(hostIds, tag, true)
    setTagDialogOpen(false)
    await refreshHosts()
    setAllTags(await window.api.hosts.listTags())
  }

  const onCreateGroup = async (group: string, hostIds: number[]): Promise<void> => {
    await window.api.hosts.bulkSetGroup(hostIds, group)
    setGroupDialogOpen(false)
    await refreshHosts()
    setAllGroups(await window.api.hosts.listGroups())
  }

  const insertSnippet = (s: Snippet): void => {
    if (s.confirmBeforeRun) {
      setConfirmingSnippet(s)
      return
    }
    insertSnippetBody(s.body)
  }

  // `saterm snippet <title>` — dispatched from cliCommands.ts. Handled here
  // rather than there since Sidebar already owns the snippets list and the
  // confirm-before-run dialog.
  useEffect(() => {
    const handler = (e: Event): void => {
      const title = (e as CustomEvent<{ title: string }>).detail?.title ?? ''
      const q = title.trim().toLowerCase()
      if (!q) return
      const match =
        snippets.find((sn) => sn.title.toLowerCase() === q) ??
        snippets.find((sn) => sn.title.toLowerCase().includes(q))
      if (!match) {
        alert(`saterm snippet: no snippet matching "${title}"`)
        return
      }
      const { tabs: curTabs, activeTabId: curActiveId } = useApp.getState()
      const hasTerminalTab = curTabs.some(
        (t) =>
          t.id === curActiveId && (t.kind === 'local' || t.kind === 'ssh' || t.kind === 'project')
      )
      if (!hasTerminalTab) openLocalTab()
      insertSnippet(match)
    }
    document.addEventListener('saterm:run-snippet', handler)
    return () => document.removeEventListener('saterm:run-snippet', handler)
  }, [snippets, openLocalTab, insertSnippet])

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
        <button
          className="sidebar2-search-clear"
          onClick={() => {
            const open = allCollapsed
            window.dispatchEvent(new CustomEvent('sidebar:set-all', { detail: { open } }))
            setAllCollapsed(!open)
          }}
          title={allCollapsed ? 'Expand all sections' : 'Collapse all sections'}
          tabIndex={-1}
          style={{ marginLeft: 2 }}
        >
          {allCollapsed ? <ChevronsUpDown size={12} /> : <ChevronsDownUp size={12} />}
        </button>
      </div>

      <div className="sidebar2-scroll">
        {/* Pinned */}
        {pinned.length > 0 && (
          <Section title="Pinned" count={pinned.length} icon={Star}>
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
          <Section title="Recent" count={recent.length} icon={Orbit}>
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
          icon={Satellite}
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
              <button
                className="sidebar2-icon"
                title="New group"
                onClick={(e) => {
                  e.stopPropagation()
                  setGroupDialogOpen(true)
                }}
              >
                <Plus size={13} />
              </button>
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
          icon={Radar}
          right={
            <>
              {activeTags.length > 0 && (
                <button
                  className="sidebar2-link"
                  onClick={() => {
                    clearTags()
                    setCombine('and')
                  }}
                >
                  clear
                </button>
              )}
              <button
                className="sidebar2-icon"
                title="New tag"
                onClick={(e) => {
                  e.stopPropagation()
                  setTagDialogOpen(true)
                }}
              >
                <Plus size={13} />
              </button>
            </>
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
          icon={Rocket}
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
        <Section title="Local" count={0} icon={Terminal}>
          <button
            className="sidebar2-row sidebar2-row-action"
            onClick={() => openLocalTab()}
            title="Open a new local terminal"
          >
            <Terminal size={13} strokeWidth={2} />
            <span>New local terminal</span>
          </button>
        </Section>

        {/* Kubernetes */}
        <Section
          title="Kubernetes"
          count={awsProfiles.length}
          icon={Orbit}
          right={
            <button
              className="sidebar2-icon"
              title="Reload profiles and clear cluster cache"
              onClick={(e) => {
                e.stopPropagation()
                void window.api.aws.invalidateCache().then(refreshAwsProfiles)
              }}
            >
              <RefreshCw size={13} />
            </button>
          }
        >
          <K8sSourceGroup
            id="aws"
            label="AWS"
            count={awsProfiles.length}
            empty={awsProfiles.length === 0 ? 'No AWS profiles found in ~/.aws/config.' : undefined}
          >
            {awsProfiles.map((p) => (
              <AwsProfileRow
                key={p.name}
                profile={p}
                effectiveRegion={awsRegions[p.name] ?? p.region}
                clusters={
                  awsClustersByProfile[`${p.name}|${awsRegions[p.name] ?? p.region}`] ?? null
                }
                loading={!!awsLoading[`${p.name}|${awsRegions[p.name] ?? p.region}`]}
                onRefresh={(region) => void refreshAwsClusters(p.name, region, true)}
                onExpand={(region) => {
                  const key = `${p.name}|${region}`
                  if (!awsClustersByProfile[key]) void refreshAwsClusters(p.name, region)
                }}
                onSetRegion={(region) => void setAwsRegion(p.name, region)}
                onOpenCluster={(c) => void openEksDashboardTab(c)}
                onOpenClusterTerminal={(c) => void openEksTab(c)}
                onOpenClusterK9s={(c) => void openEksK9sTab(c)}
              />
            ))}
          </K8sSourceGroup>
        </Section>

        {/* Projects */}
        <Section
          title="Projects"
          count={projects.length}
          icon={Telescope}
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
            <div key={p.id} className="sidebar2-host" title={p.path}>
              <button
                className="sidebar2-row"
                style={{
                  gridColumn: '1 / span 2',
                  flex: 1,
                  background: 'none',
                  border: 'none',
                  padding: 0,
                  textAlign: 'left'
                }}
                onClick={() => openProjectTab(p)}
              >
                <Folder size={13} strokeWidth={2} />
                <span className="sidebar2-row-title">{p.name}</span>
                {p.vcs !== 'none' && (
                  <span className="sidebar2-row-meta">
                    <GitBranch size={10} strokeWidth={2} /> {p.vcs}
                  </span>
                )}
              </button>
              <button
                className="sidebar2-icon"
                title="Open Claude Code in this project"
                onClick={(e) => {
                  e.stopPropagation()
                  openLocalTab(p.path, undefined, 'claude')
                }}
              >
                <BotMessageSquare size={13} />
              </button>
            </div>
          ))}
        </Section>

        {/* Snippets */}
        <Section
          title="Snippets"
          count={snippets.length}
          icon={Sparkles}
          right={
            <button
              className="sidebar2-icon"
              title="New snippet"
              onClick={(e) => {
                e.stopPropagation()
                setEditingSnippet(null)
              }}
            >
              <Plus size={13} />
            </button>
          }
        >
          {snippets.length === 0 && (
            <div className="sidebar2-empty">No snippets yet. Click + to add one.</div>
          )}
          {snippets.map((s) => (
            <div key={s.id} className="sidebar2-host">
              <button
                className="sidebar2-row"
                style={{
                  gridColumn: '1 / span 2',
                  flex: 1,
                  background: 'none',
                  border: 'none',
                  padding: 0,
                  textAlign: 'left'
                }}
                onClick={() => insertSnippet(s)}
                title={s.confirmBeforeRun ? `${s.body}\n\n(confirmation required)` : s.body}
              >
                <Terminal size={13} strokeWidth={2} />
                <span className="sidebar2-row-title">{s.title}</span>
                {s.confirmBeforeRun && (
                  <span
                    className="sidebar2-row-meta"
                    title="Confirmation required before inserting"
                    style={{ color: 'var(--warning, #d97706)' }}
                  >
                    ⚠
                  </span>
                )}
                {s.hostFilter && <span className="sidebar2-row-meta">{s.hostFilter}</span>}
              </button>
              <button
                className="sidebar2-icon"
                title="Edit snippet"
                onClick={(e) => {
                  e.stopPropagation()
                  setEditingSnippet(s)
                }}
              >
                <Settings2 size={13} />
              </button>
            </div>
          ))}
        </Section>
      </div>

      <SidebarTipsWidget />

      <div className="sidebar2-footer" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ flex: 1 }}>
          <kbd>⌘K</kbd> palette · <kbd>⌘F</kbd> search · <kbd>⌘P</kbd> open · <kbd>⌘⇧F</kbd> grep
        </span>
        <button
          className="sidebar2-icon"
          title="Report a bug"
          onClick={() => setBugDialogOpen(true)}
        >
          <Bug size={13} />
        </button>
      </div>

      {editing !== undefined && (
        <HostForm
          initial={editing}
          onSave={onSaveHost}
          onCancel={() => setEditing(undefined)}
          onDelete={editing ? onDeleteHost : undefined}
        />
      )}
      {editingSnippet !== undefined && (
        <SnippetForm
          initial={editingSnippet}
          onSave={onSaveSnippet}
          onCancel={() => setEditingSnippet(undefined)}
          onDelete={editingSnippet ? onDeleteSnippet : undefined}
        />
      )}
      {confirmingSnippet && (
        <SnippetConfirm
          snippet={confirmingSnippet}
          onCancel={() => setConfirmingSnippet(null)}
          onConfirm={() => {
            const body = confirmingSnippet.body
            setConfirmingSnippet(null)
            insertSnippetBody(body)
          }}
        />
      )}
      {bugDialogOpen && <BugReportDialog onClose={() => setBugDialogOpen(false)} />}
      {tagDialogOpen && (
        <TagForm
          hosts={hosts}
          existingTags={allTags.map((t) => t.tag)}
          onCancel={() => setTagDialogOpen(false)}
          onSave={onCreateTag}
        />
      )}
      {groupDialogOpen && (
        <GroupForm
          hosts={hosts}
          existingGroups={allGroups.map((g) => g.group)}
          onCancel={() => setGroupDialogOpen(false)}
          onSave={onCreateGroup}
        />
      )}
    </aside>
  )
}

function SnippetConfirm({
  snippet,
  onCancel,
  onConfirm
}: {
  snippet: Snippet
  onCancel: () => void
  onConfirm: () => void
}): React.JSX.Element {
  return (
    <Modal onClose={onCancel}>
      <div className="dialog" style={{ minWidth: 420, maxWidth: 640 }}>
        <h2 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ color: 'var(--warning, #d97706)' }}>⚠</span>
          Confirm snippet
        </h2>
        <div className="col">
          <label>Title</label>
          <div style={{ fontWeight: 500 }}>{snippet.title}</div>
        </div>
        <div className="col">
          <label>Command to insert</label>
          <pre
            style={{
              margin: 0,
              padding: 10,
              background: 'var(--bg-1, #111)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius, 6px)',
              fontFamily: 'monospace',
              fontSize: 12,
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-all',
              maxHeight: 240,
              overflow: 'auto'
            }}
          >
            {snippet.body}
          </pre>
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 10 }}>
          The command will be placed at the prompt but not executed — you still press Enter to run
          it.
        </div>
        <div className="row" style={{ justifyContent: 'flex-end', gap: 8 }}>
          <button type="button" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className="primary" onClick={onConfirm} autoFocus>
            Insert
          </button>
        </div>
      </div>
    </Modal>
  )
}

declare global {
  interface Window {
    __termionInsertText?: (tabId: string, text: string) => void
    __termionProjectTerm?: Map<string, import('../store/app').Tab>
  }
}

// --- Section ---

function Section({
  title,
  count,
  right,
  icon: Icon,
  children
}: {
  title: string
  count: number
  right?: React.ReactNode
  icon?: LucideIcon
  children: React.ReactNode
}): React.JSX.Element {
  const key = `sidebar.section.${title}`
  const [open, setOpen] = useState(() => {
    try {
      return localStorage.getItem(key) !== 'false'
    } catch {
      return true
    }
  })
  const toggle = (): void => {
    const next = !open
    setOpen(next)
    try {
      localStorage.setItem(key, String(next))
    } catch {
      /* noop */
    }
    // Let the sidebar toolbar know we've diverged from all-open / all-closed.
    window.dispatchEvent(new CustomEvent('sidebar:section-toggled'))
  }
  useEffect(() => {
    const handler = (e: Event): void => {
      const next = (e as CustomEvent<{ open: boolean }>).detail?.open ?? false
      setOpen(next)
      try {
        localStorage.setItem(key, String(next))
      } catch {
        /* noop */
      }
    }
    window.addEventListener('sidebar:set-all', handler)
    return () => window.removeEventListener('sidebar:set-all', handler)
  }, [key])
  return (
    <div className="sidebar2-section">
      <div className="sidebar2-section-header" onClick={toggle}>
        {Icon && <Icon size={11} strokeWidth={2} className="sidebar2-section-icon" />}
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

// --- K8s source sub-group ---

function K8sSourceGroup({
  id,
  label,
  count,
  empty,
  children
}: {
  id: string
  label: string
  count: number
  empty?: string
  children: React.ReactNode
}): React.JSX.Element {
  const storageKey = `sidebar.k8s.source.${id}`
  const [open, setOpen] = useState(() => {
    try {
      const v = localStorage.getItem(storageKey)
      return v === null ? true : v === 'true'
    } catch {
      return true
    }
  })
  const toggle = (): void => {
    const next = !open
    setOpen(next)
    try {
      localStorage.setItem(storageKey, String(next))
    } catch {
      /* noop */
    }
  }
  return (
    <div className={`k8s-source-group${open ? ' open' : ''}`}>
      <button className="k8s-source-header" onClick={toggle}>
        {open ? (
          <ChevronDown size={12} strokeWidth={2} />
        ) : (
          <ChevronRight size={12} strokeWidth={2} />
        )}
        <Cloud size={13} strokeWidth={2} />
        <span className="k8s-source-label">{label}</span>
        <span className="k8s-source-count">{count}</span>
      </button>
      {open && (
        <div className="k8s-source-body">
          {empty ? <div className="sidebar2-empty">{empty}</div> : children}
        </div>
      )}
    </div>
  )
}

// --- AWS profile row ---

function AwsProfileRow({
  profile,
  effectiveRegion,
  clusters,
  loading,
  onRefresh,
  onExpand,
  onSetRegion,
  onOpenCluster,
  onOpenClusterTerminal,
  onOpenClusterK9s
}: {
  profile: AwsProfile
  effectiveRegion: string | null
  clusters: EksCluster[] | null
  loading: boolean
  onRefresh: (region: string) => void
  onExpand: (region: string) => void
  onSetRegion: (region: string) => void
  onOpenCluster: (c: EksCluster) => void
  onOpenClusterTerminal: (c: EksCluster) => void
  onOpenClusterK9s: (c: EksCluster) => void
}): React.JSX.Element {
  const storageKey = `sidebar.aws.${profile.name}`
  const [open, setOpen] = useState(() => {
    try {
      return localStorage.getItem(storageKey) === 'true'
    } catch {
      return false
    }
  })
  const toggle = (): void => {
    const next = !open
    setOpen(next)
    try {
      localStorage.setItem(storageKey, String(next))
    } catch {
      /* noop */
    }
    if (next && effectiveRegion) onExpand(effectiveRegion)
  }

  const regionOptions =
    effectiveRegion && !COMMON_AWS_REGIONS.includes(effectiveRegion)
      ? [effectiveRegion, ...COMMON_AWS_REGIONS]
      : COMMON_AWS_REGIONS

  return (
    <div className={`aws-profile-card${open ? ' open' : ''}`}>
      <button
        className="aws-profile-header"
        onClick={toggle}
        title={profile.isSso ? `SSO profile · ${profile.source}` : `${profile.source}`}
      >
        {open ? (
          <ChevronDown size={12} strokeWidth={2} />
        ) : (
          <ChevronRight size={12} strokeWidth={2} />
        )}
        <Server size={13} strokeWidth={2} />
        <span className="aws-profile-name">{profile.name}</span>
        {profile.isSso && <span className="aws-profile-badge">sso</span>}
      </button>
      {open && (
        <div className="aws-profile-body">
          <div className="aws-profile-controls">
            <span className="aws-profile-controls-label">region</span>
            <select
              className="aws-profile-region"
              value={effectiveRegion ?? ''}
              onChange={(e) => {
                if (e.target.value && e.target.value !== effectiveRegion)
                  onSetRegion(e.target.value)
              }}
            >
              {!effectiveRegion && <option value="">pick…</option>}
              {regionOptions.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
            {effectiveRegion && (
              <button
                className="sidebar2-icon"
                style={{ marginLeft: 'auto' }}
                onClick={() => onRefresh(effectiveRegion)}
                title="Reload clusters from AWS"
              >
                <RefreshCw size={11} strokeWidth={2} />
              </button>
            )}
          </div>
          {effectiveRegion && (
            <div className="aws-cluster-list">
              {loading && <div className="aws-cluster-empty">Loading clusters…</div>}
              {!loading && clusters && clusters.length === 0 && (
                <div className="aws-cluster-empty">No clusters in {effectiveRegion}.</div>
              )}
              {!loading &&
                clusters?.map((c) => (
                  <div key={c.name} className="aws-cluster-row">
                    <button
                      className="aws-cluster-open"
                      onClick={() => onOpenCluster(c)}
                      title={`Open dashboard for ${c.name}`}
                    >
                      <Box size={12} strokeWidth={2} />
                      <span className="aws-cluster-name">{c.name}</span>
                    </button>
                    <button
                      className="sidebar2-icon aws-cluster-terminal"
                      onClick={(e) => {
                        e.stopPropagation()
                        onOpenClusterTerminal(c)
                      }}
                      title={`Open kubectl terminal for ${c.name}`}
                    >
                      <Terminal size={11} strokeWidth={2} />
                    </button>
                    <button
                      className="sidebar2-icon aws-cluster-k9s"
                      onClick={(e) => {
                        e.stopPropagation()
                        onOpenClusterK9s(c)
                      }}
                      title={`Open k9s for ${c.name}`}
                    >
                      <span className="aws-cluster-k9s-label">k9s</span>
                    </button>
                  </div>
                ))}
            </div>
          )}
        </div>
      )}
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
