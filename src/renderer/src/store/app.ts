import { create } from 'zustand'
import { v4 as uuid } from 'uuid'
import type { Host, PersistedLayout, PersistedTab, Project, SessionId, TabKind } from '../../../shared/types'

export interface Tab {
  id: SessionId
  kind: TabKind
  title: string
  hostId?: number
  projectId?: number
  cwd?: string
  shell?: string
}

interface AppState {
  hosts: Host[]
  projects: Project[]
  tabs: Tab[]
  activeTabId: SessionId | null
  ready: boolean

  refreshHosts: () => Promise<void>
  refreshProjects: () => Promise<void>
  openSshTab: (host: Host) => Tab
  openLocalTab: (cwd?: string) => Tab
  openProjectTab: (project: Project) => Tab
  closeTab: (id: SessionId) => void
  setActiveTab: (id: SessionId) => void
  renameTab: (id: SessionId, title: string) => void
  reorderTab: (from: number, to: number) => void
  persistLayout: () => Promise<void>
  restoreLayout: () => Promise<void>
}

export const useApp = create<AppState>((set, get) => ({
  hosts: [],
  projects: [],
  tabs: [],
  activeTabId: null,
  ready: false,

  refreshHosts: async () => {
    const hosts = await window.api.hosts.list()
    set({ hosts })
  },

  refreshProjects: async () => {
    const projects = await window.api.projects.list()
    set({ projects })
  },

  openSshTab: (host) => {
    const tab: Tab = { id: uuid(), kind: 'ssh', title: host.name, hostId: host.id }
    set((s) => ({ tabs: [...s.tabs, tab], activeTabId: tab.id }))
    void window.api.hosts.touch(host.id).then(() => get().refreshHosts())
    void get().persistLayout()
    return tab
  },

  openLocalTab: (cwd) => {
    const tab: Tab = { id: uuid(), kind: 'local', title: 'local', cwd }
    set((s) => ({ tabs: [...s.tabs, tab], activeTabId: tab.id }))
    void get().persistLayout()
    return tab
  },

  openProjectTab: (project) => {
    // Touch refreshes last_opened_at AND re-detects vcs server-side, so a
    // project that gained a .git after first import now reports it.
    void window.api.projects.touch(project.id).then(() => get().refreshProjects())
    const existing = get().tabs.find((t) => t.kind === 'project' && t.projectId === project.id)
    if (existing) {
      set({ activeTabId: existing.id })
      return existing
    }
    const tab: Tab = {
      id: uuid(),
      kind: 'project',
      title: project.name,
      projectId: project.id,
      cwd: project.path
    }
    set((s) => ({ tabs: [...s.tabs, tab], activeTabId: tab.id }))
    void get().persistLayout()
    return tab
  },

  closeTab: (id) => {
    void window.api.term.close(id)
    set((s) => {
      const idx = s.tabs.findIndex((t) => t.id === id)
      const tabs = s.tabs.filter((t) => t.id !== id)
      const wasActive = s.activeTabId === id
      const activeTabId = wasActive
        ? tabs[Math.max(0, idx - 1)]?.id ?? tabs[0]?.id ?? null
        : s.activeTabId
      return { tabs, activeTabId }
    })
    void get().persistLayout()
  },

  setActiveTab: (id) => {
    set({ activeTabId: id })
    void get().persistLayout()
  },

  renameTab: (id, title) => {
    set((s) => ({ tabs: s.tabs.map((t) => (t.id === id ? { ...t, title } : t)) }))
    void get().persistLayout()
  },

  reorderTab: (from, to) => {
    set((s) => {
      const tabs = [...s.tabs]
      const [moved] = tabs.splice(from, 1)
      tabs.splice(to, 0, moved)
      return { tabs }
    })
    void get().persistLayout()
  },

  persistLayout: async () => {
    const { tabs, activeTabId } = get()
    const layout: PersistedLayout = {
      tabs: tabs.map<PersistedTab>((t) => ({
        id: t.id,
        kind: t.kind,
        title: t.title,
        hostId: t.hostId,
        projectId: t.projectId,
        cwd: t.cwd
      })),
      activeTabId
    }
    await window.api.layout.save(layout)
  },

  restoreLayout: async () => {
    const [hosts, projects, layout] = await Promise.all([
      window.api.hosts.list(),
      window.api.projects.list(),
      window.api.layout.load()
    ])
    const tabs: Tab[] = (layout?.tabs ?? []).map((t) => ({
      id: t.id,
      kind: t.kind,
      title: t.title,
      hostId: t.hostId,
      projectId: t.projectId,
      cwd: t.cwd
    }))
    set({
      hosts,
      projects,
      tabs,
      activeTabId: layout?.activeTabId ?? tabs[0]?.id ?? null,
      ready: true
    })
  }
}))
