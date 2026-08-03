import { create } from 'zustand'
import { v4 as uuid } from 'uuid'
import type {
  AwsProfile,
  EksCluster,
  FileTabContent,
  Host,
  PersistedLayout,
  PersistedTab,
  Project,
  SessionId,
  TabKind,
  Task,
  TaskCreateInput,
  TaskPatch,
  TfValidateResult
} from '../../../shared/types'
import { useAi } from './ai'

export interface Tab {
  id: SessionId
  kind: TabKind
  title: string
  hostId?: number
  projectId?: number
  cwd?: string
  shell?: string
  initialCommand?: string
  env?: Record<string, string>
  kubeconfigPath?: string
  /** EKS dashboard tab metadata. Only present when kind === 'eks'. */
  eks?: {
    profile: string
    region: string
    cluster: string
  }
  /** Absolute path to the file (only for kind === 'file'). */
  filePath?: string
  /** How to render the file (only for kind === 'file'). */
  fileContent?: FileTabContent
}

interface AppState {
  hosts: Host[]
  projects: Project[]
  tabs: Tab[]
  activeTabId: SessionId | null
  ready: boolean

  awsProfiles: AwsProfile[]
  awsClustersByProfile: Record<string, EksCluster[]>
  awsLoading: Record<string, boolean>
  awsRegions: Record<string, string | null>

  terraformDetected: Record<number, boolean>
  terraformRuns: Record<
    number,
    {
      status: 'idle' | 'running' | 'done' | 'error'
      validate: TfValidateResult | null
      error: string | null
      ranAt: number | null
      truncated: boolean
      filesIncluded: number
    }
  >

  refreshHosts: () => Promise<void>
  refreshProjects: () => Promise<void>
  openSshTab: (host: Host) => Tab
  openLocalTab: (cwd?: string, shell?: string, initialCommand?: string) => Tab
  openProjectTab: (project: Project) => Tab
  openFileTab: (filePath: string) => Tab
  closeTab: (id: SessionId) => void
  setActiveTab: (id: SessionId) => void
  renameTab: (id: SessionId, title: string) => void
  reorderTab: (from: number, to: number) => void
  persistLayout: () => Promise<void>
  restoreLayout: () => Promise<void>

  refreshAwsProfiles: () => Promise<void>
  refreshAwsClusters: (profile: string, region: string, force?: boolean) => Promise<void>
  setAwsRegion: (profile: string, region: string) => Promise<void>
  openEksTab: (cluster: EksCluster) => Promise<Tab | null>
  openEksDashboardTab: (cluster: EksCluster) => Promise<Tab | null>

  detectTerraform: (projectId: number, root: string) => Promise<boolean>
  analyzeTerraform: (projectId: number, root: string) => Promise<void>
  resetTerraformRun: (projectId: number) => void

  tasks: Record<string, Task[]>
  tasksLoading: Record<string, boolean>
  tasksScopePref: 'global' | 'project'
  loadTasks: (scopeKey: string, projectId: number | null) => Promise<void>
  addTask: (scopeKey: string, input: TaskCreateInput) => Promise<Task | null>
  patchTask: (scopeKey: string, id: number, patch: TaskPatch) => Promise<void>
  removeTask: (scopeKey: string, id: number) => Promise<void>
  setTasksScopePref: (scope: 'global' | 'project') => Promise<void>
  loadTasksScopePref: () => Promise<void>
}

export const taskScopeKey = (projectId: number | null): string =>
  projectId == null ? 'global' : `project:${projectId}`

export const useApp = create<AppState>((set, get) => ({
  hosts: [],
  projects: [],
  tabs: [],
  activeTabId: null,
  ready: false,
  awsProfiles: [],
  awsClustersByProfile: {},
  awsLoading: {},
  awsRegions: {},
  terraformDetected: {},
  terraformRuns: {},
  tasks: {},
  tasksLoading: {},
  tasksScopePref: 'project',

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

  openLocalTab: (cwd, shell, initialCommand) => {
    const title = initialCommand
      ? initialCommand.split(/\s+/)[0]
      : shell
        ? shell.split(/[\\/]/).pop()!
        : 'local'
    const tab: Tab = { id: uuid(), kind: 'local', title, cwd, shell, initialCommand }
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

  openFileTab: (filePath) => {
    const existing = get().tabs.find((t) => t.kind === 'file' && t.filePath === filePath)
    if (existing) {
      set({ activeTabId: existing.id })
      return existing
    }
    const title = filePath.split(/[\\/]/).pop() || filePath
    const ext = title.toLowerCase().split('.').pop() ?? ''
    const fileContent: FileTabContent = ext === 'html' || ext === 'htm' ? 'html' : 'text'
    const tab: Tab = {
      id: uuid(),
      kind: 'file',
      title,
      filePath,
      fileContent
    }
    set((s) => ({ tabs: [...s.tabs, tab], activeTabId: tab.id }))
    void get().persistLayout()
    return tab
  },

  closeTab: (id) => {
    const closing = get().tabs.find((t) => t.id === id)
    if (closing?.kubeconfigPath) {
      void window.api.aws.cleanupKubeconfig(closing.kubeconfigPath)
    }
    void window.api.term.close(id)
    set((s) => {
      const idx = s.tabs.findIndex((t) => t.id === id)
      const tabs = s.tabs.filter((t) => t.id !== id)
      const wasActive = s.activeTabId === id
      const activeTabId = wasActive
        ? (tabs[Math.max(0, idx - 1)]?.id ?? tabs[0]?.id ?? null)
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
        cwd: t.cwd,
        filePath: t.filePath,
        fileContent: t.fileContent
      })),
      activeTabId
    }
    await window.api.layout.save(layout)
  },

  restoreLayout: async () => {
    const [hosts, projects, layout, awsProfiles] = await Promise.all([
      window.api.hosts.list(),
      window.api.projects.list(),
      window.api.layout.load(),
      window.api.aws.listProfiles().catch(() => [] as AwsProfile[])
    ])
    // EKS tabs from prior sessions can't be restored (their kubeconfig is gone),
    // so drop them. Everything else round-trips.
    const tabs: Tab[] = (layout?.tabs ?? [])
      .filter((t) => t.kind !== 'eks' && !t.title?.startsWith('eks:'))
      .map((t) => ({
        id: t.id,
        kind: t.kind,
        title: t.title,
        hostId: t.hostId,
        projectId: t.projectId,
        cwd: t.cwd,
        filePath: t.filePath,
        fileContent: t.fileContent
      }))
    const awsRegions: Record<string, string | null> = {}
    for (const p of awsProfiles) awsRegions[p.name] = p.region
    set({
      hosts,
      projects,
      tabs,
      activeTabId: layout?.activeTabId ?? tabs[0]?.id ?? null,
      awsProfiles,
      awsRegions,
      ready: true
    })
  },

  refreshAwsProfiles: async () => {
    try {
      const awsProfiles = await window.api.aws.listProfiles()
      const awsRegions = { ...get().awsRegions }
      for (const p of awsProfiles) {
        if (!(p.name in awsRegions)) awsRegions[p.name] = p.region
      }
      set({ awsProfiles, awsRegions })
    } catch (e) {
      console.error('[aws] listProfiles failed', e)
    }
  },

  refreshAwsClusters: async (profile, region, force = false) => {
    const key = `${profile}|${region}`
    set((s) => ({ awsLoading: { ...s.awsLoading, [key]: true } }))
    try {
      const clusters = await window.api.aws.listClusters(profile, region, force)
      set((s) => ({
        awsClustersByProfile: { ...s.awsClustersByProfile, [key]: clusters }
      }))
    } catch (e) {
      alert(`Could not list EKS clusters: ${(e as Error).message}`)
    } finally {
      set((s) => {
        const next = { ...s.awsLoading }
        delete next[key]
        return { awsLoading: next }
      })
    }
  },

  setAwsRegion: async (profile, region) => {
    await window.api.aws.setProfileRegion(profile, region)
    set((s) => ({ awsRegions: { ...s.awsRegions, [profile]: region } }))
  },

  openEksTab: async (cluster) => {
    try {
      const { kubeconfigPath } = await window.api.aws.openCluster({
        profile: cluster.profile,
        region: cluster.region,
        cluster: cluster.name
      })
      const tab: Tab = {
        id: uuid(),
        kind: 'local',
        title: `eks: ${cluster.name}`,
        env: {
          AWS_PROFILE: cluster.profile,
          AWS_REGION: cluster.region,
          AWS_DEFAULT_REGION: cluster.region,
          KUBECONFIG: kubeconfigPath
        },
        kubeconfigPath
      }
      set((s) => ({ tabs: [...s.tabs, tab], activeTabId: tab.id }))
      void get().persistLayout()
      return tab
    } catch (e) {
      alert(`Could not open cluster: ${(e as Error).message}`)
      return null
    }
  },

  openEksDashboardTab: async (cluster) => {
    try {
      const { kubeconfigPath } = await window.api.aws.prepareKubeconfig({
        profile: cluster.profile,
        region: cluster.region,
        cluster: cluster.name
      })
      const tab: Tab = {
        id: uuid(),
        kind: 'eks',
        title: cluster.name,
        kubeconfigPath,
        eks: {
          profile: cluster.profile,
          region: cluster.region,
          cluster: cluster.name
        }
      }
      set((s) => ({ tabs: [...s.tabs, tab], activeTabId: tab.id }))
      void get().persistLayout()
      return tab
    } catch (e) {
      alert(`Could not open cluster: ${(e as Error).message}`)
      return null
    }
  },

  detectTerraform: async (projectId, root) => {
    try {
      const has = await window.api.terraform.detect(root)
      set((s) => ({ terraformDetected: { ...s.terraformDetected, [projectId]: has } }))
      return has
    } catch (e) {
      console.error('[terraform] detect failed', e)
      return false
    }
  },

  analyzeTerraform: async (projectId, root) => {
    const existing = get().terraformRuns[projectId]
    if (existing?.status === 'running') return
    set((s) => ({
      terraformRuns: {
        ...s.terraformRuns,
        [projectId]: {
          status: 'running',
          validate: null,
          error: null,
          ranAt: null,
          truncated: false,
          filesIncluded: 0
        }
      }
    }))
    try {
      const [validate, bundle] = await Promise.all([
        window.api.terraform.validate(root),
        window.api.terraform.readBundle(root)
      ])
      set((s) => ({
        terraformRuns: {
          ...s.terraformRuns,
          [projectId]: {
            status: 'running',
            validate,
            error: null,
            ranAt: Date.now(),
            truncated: bundle.truncated,
            filesIncluded: bundle.files.length
          }
        }
      }))

      // Reset prior chat history for a clean turn each time.
      const key = `tf:${projectId}`
      useAi.getState().reset(key)

      const validateSummary = validate.cliMissing
        ? '# (terraform CLI not found — analysis is from HCL only)'
        : validate.diagnostics.length === 0
          ? '# valid (no diagnostics)'
          : validate.diagnostics
              .map(
                (d) =>
                  `# [${d.severity}] ${d.file ?? ''}${d.line ? ':' + d.line : ''} — ${d.summary}${
                    d.detail ? ' — ' + d.detail.replace(/\s+/g, ' ').slice(0, 200) : ''
                  }`
              )
              .join('\n')

      const header = [
        `# Terraform configuration for: ${root}`,
        '# `terraform validate` result:',
        validateSummary,
        bundle.truncated
          ? `# (showing ${bundle.files.length} files — some content was truncated)`
          : `# (showing ${bundle.files.length} files)`,
        '# Files concatenated below.'
      ].join('\n')

      const fileContent = header + '\n' + bundle.concatenated

      const userText =
        'Read the Terraform configuration above and explain: ' +
        '(1) what infrastructure it provisions, ' +
        '(2) what `terraform plan` would likely change against an existing state — flag anything destructive (replacements, force-new-resource changes, deletions), ' +
        '(3) any bugs or risks you can spot from the HCL alone (wrong refs, hardcoded creds, missing variables, drift between modules). ' +
        'Be concrete; cite filenames and line numbers when possible. ' +
        'Do not ask follow-up questions — give your best read.'

      await useAi.getState().send(
        key,
        'editor',
        {
          kind: 'editor',
          projectRoot: root,
          filePath: `${root}/__TERRAFORM__.hcl`,
          language: 'hcl',
          fileContent,
          selection: null
        },
        userText
      )

      set((s) => {
        const cur = s.terraformRuns[projectId]
        if (!cur) return s
        return {
          terraformRuns: {
            ...s.terraformRuns,
            [projectId]: { ...cur, status: 'done' }
          }
        }
      })
    } catch (e) {
      set((s) => {
        const cur = s.terraformRuns[projectId] ?? {
          status: 'error' as const,
          validate: null,
          error: null,
          ranAt: Date.now(),
          truncated: false,
          filesIncluded: 0
        }
        return {
          terraformRuns: {
            ...s.terraformRuns,
            [projectId]: { ...cur, status: 'error', error: (e as Error).message }
          }
        }
      })
    }
  },

  resetTerraformRun: (projectId) => {
    set((s) => {
      const next = { ...s.terraformRuns }
      delete next[projectId]
      return { terraformRuns: next }
    })
    useAi.getState().reset(`tf:${projectId}`)
  },

  loadTasks: async (scopeKey, projectId) => {
    set((s) => ({ tasksLoading: { ...s.tasksLoading, [scopeKey]: true } }))
    try {
      const list = await window.api.tasks.list(projectId)
      set((s) => ({
        tasks: { ...s.tasks, [scopeKey]: list },
        tasksLoading: { ...s.tasksLoading, [scopeKey]: false }
      }))
    } catch {
      set((s) => ({ tasksLoading: { ...s.tasksLoading, [scopeKey]: false } }))
    }
  },

  addTask: async (scopeKey, input) => {
    try {
      const created = await window.api.tasks.create(input)
      set((s) => ({
        tasks: { ...s.tasks, [scopeKey]: [...(s.tasks[scopeKey] ?? []), created] }
      }))
      return created
    } catch {
      return null
    }
  },

  patchTask: async (scopeKey, id, patch) => {
    const prev = get().tasks[scopeKey] ?? []
    // optimistic
    set((s) => ({
      tasks: {
        ...s.tasks,
        [scopeKey]: prev.map((t) =>
          t.id === id ? { ...t, ...taskPatchToPartial(patch), updatedAt: Date.now() } : t
        )
      }
    }))
    try {
      const updated = await window.api.tasks.update(id, patch)
      set((s) => ({
        tasks: {
          ...s.tasks,
          [scopeKey]: (s.tasks[scopeKey] ?? []).map((t) => (t.id === id ? updated : t))
        }
      }))
    } catch {
      // rollback
      set((s) => ({ tasks: { ...s.tasks, [scopeKey]: prev } }))
    }
  },

  removeTask: async (scopeKey, id) => {
    const prev = get().tasks[scopeKey] ?? []
    set((s) => ({
      tasks: { ...s.tasks, [scopeKey]: prev.filter((t) => t.id !== id) }
    }))
    try {
      await window.api.tasks.delete(id)
    } catch {
      set((s) => ({ tasks: { ...s.tasks, [scopeKey]: prev } }))
    }
  },

  setTasksScopePref: async (scope) => {
    set({ tasksScopePref: scope })
    await window.api.kv.set('tasks.scope', scope)
  },

  loadTasksScopePref: async () => {
    const v = await window.api.kv.get('tasks.scope')
    if (v === 'global' || v === 'project') set({ tasksScopePref: v })
  }
}))

function taskPatchToPartial(patch: TaskPatch): Partial<Task> {
  const out: Partial<Task> = {}
  if (patch.title !== undefined) out.title = patch.title
  if (patch.body !== undefined) out.body = patch.body
  if (patch.status !== undefined) out.status = patch.status
  if (patch.priority !== undefined) out.priority = patch.priority
  if (patch.dueAt !== undefined) out.dueAt = patch.dueAt
  if (patch.sortKey !== undefined) out.sortKey = patch.sortKey
  return out
}
