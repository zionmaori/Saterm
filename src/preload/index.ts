import { contextBridge, ipcRenderer } from 'electron'
import type {
  AiDeltaEvent,
  AiDoneEvent,
  AiErrorEvent,
  AiProvider,
  AiStartEvent,
  AiStatus,
  AiStreamArgs,
  AiToolUseEvent,
  AuthPromptEvent,
  AwsProfile,
  BugReportInput,
  EksCluster,
  EksOpenArgs,
  EksOpenResult,
  TfBundle,
  TfFile,
  TfValidateResult,
  GroupCount,
  Host,
  HostInput,
  ImportSshConfigResult,
  OnboardingImportSshInput,
  OnboardingImportSshResult,
  OnboardingStatus,
  PersistedLayout,
  Project,
  PtySpawnArgs,
  SessionId,
  ShellOption,
  Snippet,
  SshConnectArgs,
  TagCount,
  Task,
  TaskCreateInput,
  TaskPatch,
  TermDataEvent,
  TermExitEvent,
  TermInputArgs,
  TermResizeArgs,
  VcsKind
} from '../shared/types'

type Listener<T> = (payload: T) => void

const on = <T>(channel: string, fn: Listener<T>): (() => void) => {
  const handler = (_e: Electron.IpcRendererEvent, payload: T): void => fn(payload)
  ipcRenderer.on(channel, handler)
  return () => ipcRenderer.removeListener(channel, handler)
}

const api = {
  app: {
    version: (): Promise<string> => ipcRenderer.invoke('app:version'),
    platform: (): Promise<NodeJS.Platform> => ipcRenderer.invoke('app:platform')
  },
  kv: {
    get: (key: string): Promise<string | null> => ipcRenderer.invoke('kv:get', key),
    set: (key: string, value: string): Promise<void> => ipcRenderer.invoke('kv:set', key, value),
    getJSON: async <T>(key: string): Promise<T | null> => {
      const v = (await ipcRenderer.invoke('kv:get', key)) as string | null
      if (v == null) return null
      try {
        return JSON.parse(v) as T
      } catch {
        return null
      }
    },
    setJSON: (key: string, value: unknown): Promise<void> =>
      ipcRenderer.invoke('kv:set', key, JSON.stringify(value))
  },
  layout: {
    load: async (): Promise<PersistedLayout | null> => {
      const v = (await ipcRenderer.invoke('kv:get', 'layout')) as string | null
      if (!v) return null
      try {
        return JSON.parse(v) as PersistedLayout
      } catch {
        return null
      }
    },
    save: (layout: PersistedLayout): Promise<void> =>
      ipcRenderer.invoke('kv:set', 'layout', JSON.stringify(layout))
  },
  hosts: {
    list: (): Promise<Host[]> => ipcRenderer.invoke('hosts:list'),
    get: (id: number): Promise<Host | null> => ipcRenderer.invoke('hosts:get', id),
    create: (input: HostInput): Promise<Host> => ipcRenderer.invoke('hosts:create', input),
    update: (id: number, input: HostInput): Promise<Host> =>
      ipcRenderer.invoke('hosts:update', id, input),
    delete: (id: number): Promise<void> => ipcRenderer.invoke('hosts:delete', id),
    importSshConfig: (): Promise<ImportSshConfigResult> =>
      ipcRenderer.invoke('hosts:importSshConfig'),
    importKnownHosts: (): Promise<ImportSshConfigResult> =>
      ipcRenderer.invoke('hosts:importKnownHosts'),
    setTags: (id: number, tags: string[]): Promise<Host> =>
      ipcRenderer.invoke('hosts:setTags', id, tags),
    listTags: (): Promise<TagCount[]> => ipcRenderer.invoke('hosts:listTags'),
    listGroups: (): Promise<GroupCount[]> => ipcRenderer.invoke('hosts:listGroups'),
    bulkSetTag: (ids: number[], tag: string, add: boolean): Promise<void> =>
      ipcRenderer.invoke('hosts:bulkSetTag', ids, tag, add),
    pin: (id: number, pinned: boolean): Promise<void> =>
      ipcRenderer.invoke('hosts:pin', id, pinned),
    touch: (id: number): Promise<void> => ipcRenderer.invoke('hosts:touch', id)
  },
  ssh: {
    connect: (args: SshConnectArgs): Promise<void> => ipcRenderer.invoke('ssh:connect', args),
    authReply: (sessionId: SessionId, secret: string | null, remember: boolean): Promise<void> =>
      ipcRenderer.invoke('ssh:authReply', sessionId, secret, remember),
    onAuthPrompt: (fn: Listener<AuthPromptEvent>) => on('ssh:auth-prompt', fn)
  },
  pty: {
    shells: (): Promise<ShellOption[]> => ipcRenderer.invoke('pty:shells'),
    spawn: (args: PtySpawnArgs): Promise<void> => ipcRenderer.invoke('pty:spawn', args)
  },
  term: {
    input: (args: TermInputArgs): Promise<void> => ipcRenderer.invoke('term:input', args),
    resize: (args: TermResizeArgs): Promise<void> => ipcRenderer.invoke('term:resize', args),
    close: (sessionId: SessionId): Promise<void> => ipcRenderer.invoke('term:close', sessionId),
    onData: (fn: Listener<TermDataEvent>) => on('term:data', fn),
    onExit: (fn: Listener<TermExitEvent>) => on('term:exit', fn)
  },
  projects: {
    list: (): Promise<Project[]> => ipcRenderer.invoke('projects:list'),
    pick: (): Promise<Project | null> => ipcRenderer.invoke('projects:pick'),
    add: (path: string): Promise<Project> => ipcRenderer.invoke('projects:add', path),
    remove: (id: number): Promise<void> => ipcRenderer.invoke('projects:remove', id),
    touch: (id: number): Promise<void> => ipcRenderer.invoke('projects:touch', id),
    detectVcs: (path: string): Promise<VcsKind> => ipcRenderer.invoke('projects:detectVcs', path)
  },
  fs: {
    readDir: (path: string): Promise<{ name: string; path: string; isDir: boolean }[]> =>
      ipcRenderer.invoke('fs:readDir', path),
    readText: (path: string): Promise<string> => ipcRenderer.invoke('fs:readText', path),
    writeText: (path: string, content: string): Promise<void> =>
      ipcRenderer.invoke('fs:writeText', path, content),
    newFile: (path: string): Promise<void> => ipcRenderer.invoke('fs:newFile', path),
    newDir: (path: string): Promise<void> => ipcRenderer.invoke('fs:newDir', path),
    rename: (from: string, to: string): Promise<void> => ipcRenderer.invoke('fs:rename', from, to),
    trash: (path: string): Promise<void> => ipcRenderer.invoke('fs:trash', path),
    watch: (root: string): Promise<void> => ipcRenderer.invoke('fs:watch', root),
    unwatch: (root: string): Promise<void> => ipcRenderer.invoke('fs:unwatch', root),
    onChanged: (fn: Listener<{ root: string; kind: 'change' | 'rename' }>) => on('fs:changed', fn),
    quickOpen: (root: string): Promise<{ name: string; relPath: string; absPath: string }[]> =>
      ipcRenderer.invoke('fs:quickOpen', root),
    search: (
      root: string,
      query: string
    ): Promise<{ file: string; line: number; column: number; text: string }[]> =>
      ipcRenderer.invoke('fs:search', root, query)
  },
  git: {
    status: (path: string) => ipcRenderer.invoke('git:status', path),
    diffFile: (path: string, file: string, staged: boolean) =>
      ipcRenderer.invoke('git:diffFile', path, file, staged),
    fileAtRef: (path: string, ref: string, file: string) =>
      ipcRenderer.invoke('git:fileAtRef', path, ref, file),
    stage: (path: string, files: string[]) => ipcRenderer.invoke('git:stage', path, files),
    unstage: (path: string, files: string[]) => ipcRenderer.invoke('git:unstage', path, files),
    discard: (path: string, files: string[]) => ipcRenderer.invoke('git:discard', path, files),
    commit: (path: string, message: string, amend = false) =>
      ipcRenderer.invoke('git:commit', path, message, amend),
    branches: (path: string) => ipcRenderer.invoke('git:branches', path),
    checkout: (path: string, branch: string, create = false) =>
      ipcRenderer.invoke('git:checkout', path, branch, create),
    deleteBranch: (path: string, branch: string, force = false) =>
      ipcRenderer.invoke('git:deleteBranch', path, branch, force),
    fetch: (path: string) => ipcRenderer.invoke('git:fetch', path),
    pull: (path: string) => ipcRenderer.invoke('git:pull', path),
    push: (path: string) => ipcRenderer.invoke('git:push', path),
    log: (path: string) => ipcRenderer.invoke('git:log', path),
    show: (path: string, hash: string) => ipcRenderer.invoke('git:show', path, hash),
    listTags: (path: string): Promise<string[]> => ipcRenderer.invoke('git:listTags', path),
    createTag: (path: string, tag: string, message?: string): Promise<void> =>
      ipcRenderer.invoke('git:createTag', path, tag, message),
    pushTags: (path: string): Promise<void> => ipcRenderer.invoke('git:pushTags', path),
    deleteTag: (path: string, tag: string): Promise<void> =>
      ipcRenderer.invoke('git:deleteTag', path, tag)
  },
  ai: {
    status: (): Promise<AiStatus> => ipcRenderer.invoke('ai:status'),
    reinit: (): Promise<AiStatus> => ipcRenderer.invoke('ai:reinit'),
    signIn: (apiKey: string): Promise<AiStatus> => ipcRenderer.invoke('ai:signIn', apiKey),
    signInWithClaudeCode: (): Promise<AiStatus> => ipcRenderer.invoke('ai:signInClaudeCode'),
    signInWithProvider: (provider: AiProvider, apiKey: string): Promise<AiStatus> =>
      ipcRenderer.invoke('ai:signInProvider', provider, apiKey),
    setProvider: (provider: AiProvider): Promise<AiStatus> =>
      ipcRenderer.invoke('ai:setProvider', provider),
    signOut: (): Promise<AiStatus> => ipcRenderer.invoke('ai:signOut'),
    stream: (args: AiStreamArgs): Promise<void> => ipcRenderer.invoke('ai:stream', args),
    cancel: (streamId: string): Promise<void> => ipcRenderer.invoke('ai:cancel', streamId),
    onStart: (fn: Listener<AiStartEvent>) => on('ai:start', fn),
    onDelta: (fn: Listener<AiDeltaEvent>) => on('ai:delta', fn),
    onToolUse: (fn: Listener<AiToolUseEvent>) => on('ai:tool_use', fn),
    onDone: (fn: Listener<AiDoneEvent>) => on('ai:done', fn),
    onError: (fn: Listener<AiErrorEvent>) => on('ai:error', fn)
  },
  bugs: {
    report: (input: BugReportInput): Promise<{ reportedAt: string; path: string }> =>
      ipcRenderer.invoke('bugs:report', input),
    list: (): Promise<string> => ipcRenderer.invoke('bugs:list')
  },
  snippets: {
    list: (): Promise<Snippet[]> => ipcRenderer.invoke('snippets:list'),
    create: (
      title: string,
      body: string,
      hostFilter: string | null,
      confirmBeforeRun: boolean
    ): Promise<Snippet> =>
      ipcRenderer.invoke('snippets:create', title, body, hostFilter, confirmBeforeRun),
    update: (
      id: number,
      title: string,
      body: string,
      hostFilter: string | null,
      confirmBeforeRun: boolean
    ): Promise<Snippet> =>
      ipcRenderer.invoke('snippets:update', id, title, body, hostFilter, confirmBeforeRun),
    delete: (id: number): Promise<void> => ipcRenderer.invoke('snippets:delete', id)
  },
  tasks: {
    list: (projectId: number | null | undefined): Promise<Task[]> =>
      ipcRenderer.invoke('tasks:list', projectId),
    create: (input: TaskCreateInput): Promise<Task> => ipcRenderer.invoke('tasks:create', input),
    update: (id: number, patch: TaskPatch): Promise<Task> =>
      ipcRenderer.invoke('tasks:update', id, patch),
    delete: (id: number): Promise<void> => ipcRenderer.invoke('tasks:delete', id)
  },
  terraform: {
    detect: (root: string): Promise<boolean> => ipcRenderer.invoke('terraform:detect', root),
    list: (root: string): Promise<TfFile[]> => ipcRenderer.invoke('terraform:list', root),
    readBundle: (root: string): Promise<TfBundle> =>
      ipcRenderer.invoke('terraform:readBundle', root),
    validate: (root: string): Promise<TfValidateResult> =>
      ipcRenderer.invoke('terraform:validate', root),
    resetCli: (): Promise<void> => ipcRenderer.invoke('terraform:resetCli')
  },
  aws: {
    listProfiles: (): Promise<AwsProfile[]> => ipcRenderer.invoke('aws:listProfiles'),
    listClusters: (profile: string, region: string, force = false): Promise<EksCluster[]> =>
      ipcRenderer.invoke('aws:listClusters', profile, region, force),
    invalidateCache: (profile?: string, region?: string): Promise<void> =>
      ipcRenderer.invoke('aws:invalidateCache', profile, region),
    openCluster: (args: EksOpenArgs): Promise<EksOpenResult> =>
      ipcRenderer.invoke('aws:openCluster', args),
    prepareKubeconfig: (args: EksOpenArgs): Promise<EksOpenResult> =>
      ipcRenderer.invoke('aws:prepareKubeconfig', args),
    describeCluster: (profile: string, region: string, name: string): Promise<unknown> =>
      ipcRenderer.invoke('aws:describeCluster', profile, region, name),
    cleanupKubeconfig: (path: string): Promise<void> =>
      ipcRenderer.invoke('aws:cleanupKubeconfig', path),
    getProfileRegion: (profile: string): Promise<string | null> =>
      ipcRenderer.invoke('aws:getProfileRegion', profile),
    setProfileRegion: (profile: string, region: string): Promise<void> =>
      ipcRenderer.invoke('aws:setProfileRegion', profile, region)
  },
  kube: {
    get: (
      env: { kubeconfigPath: string; profile: string; region: string },
      resource: string,
      opts: { namespace?: string; cluster?: boolean } = {}
    ): Promise<unknown> => ipcRenderer.invoke('kube:get', env, resource, opts)
  },
  svn: {
    status: (path: string) => ipcRenderer.invoke('svn:status', path),
    info: (path: string) => ipcRenderer.invoke('svn:info', path),
    diff: (path: string, file?: string) => ipcRenderer.invoke('svn:diff', path, file),
    commit: (path: string, message: string, files: string[]) =>
      ipcRenderer.invoke('svn:commit', path, message, files),
    update: (path: string) => ipcRenderer.invoke('svn:update', path),
    revert: (path: string, files: string[]) => ipcRenderer.invoke('svn:revert', path, files),
    add: (path: string, files: string[]) => ipcRenderer.invoke('svn:add', path, files),
    delete: (path: string, files: string[]) => ipcRenderer.invoke('svn:delete', path, files),
    log: (path: string) => ipcRenderer.invoke('svn:log', path)
  },
  onboarding: {
    status: (): Promise<OnboardingStatus> => ipcRenderer.invoke('onboarding:status'),
    pickProjectsRoot: (): Promise<{ path: string; childCount: number } | null> =>
      ipcRenderer.invoke('onboarding:pickProjectsRoot'),
    setProjectsRoot: (
      path: string
    ): Promise<{ path: string; childCount: number }> =>
      ipcRenderer.invoke('onboarding:setProjectsRoot', path),
    importSsh: (input: OnboardingImportSshInput): Promise<OnboardingImportSshResult> =>
      ipcRenderer.invoke('onboarding:importSsh', input),
    seedProjects: (): Promise<{ added: number; root: string }> =>
      ipcRenderer.invoke('onboarding:seedProjects'),
    complete: (): Promise<{ ok: true }> => ipcRenderer.invoke('onboarding:complete')
  }
}

export type TermionAPI = typeof api

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.api = api
}
