import { app, dialog, ipcMain, shell } from 'electron'
import { homedir } from 'os'
import { join } from 'path'
import { existsSync, readdirSync, statSync } from 'fs'
import {
  kvGet,
  kvSet,
  listSnippets,
  createSnippet,
  updateSnippet,
  deleteSnippet,
  listTasks,
  createTask,
  updateTask,
  deleteTask,
  type TaskRow
} from './db'
import type { Task, TaskCreateInput, TaskPatch } from '../shared/types'
import {
  listHosts,
  getHost,
  createHost,
  updateHost,
  deleteHost,
  setHostTags,
  listAllTags,
  listAllGroups,
  bulkSetTag,
  bulkSetGroup,
  pinHost,
  touchHost
} from './hosts'
import { importSshConfig, parseSshConfig } from './sshconfig'
import { importKnownHosts, parseKnownHosts } from './knownhosts'
import { getProjectsRoot, setProjectsRoot } from './settings'
import { clearHostSecrets, getSshSecret, setSshSecret, deleteSshSecret } from './keychain'
import { connectSsh, writeSsh, resizeSsh, closeSsh, isSshSession, resolveAuthPrompt } from './ssh'
import { spawnPty, writePty, resizePty, closePty, isPtySession, detectShells } from './pty'
import {
  addProject,
  listProjects,
  removeProject,
  touchProject,
  detectVcs,
  readDir,
  readTextFile,
  readBinaryFile,
  writeTextFile,
  createFile,
  createDirectory,
  renameEntry,
  trashEntry,
  quickOpenList,
  ripgrepSearch,
  watchDir,
  unwatchDir
} from './projects'
import {
  gitStatus,
  gitDiffFile,
  gitFileAtRef,
  gitStage,
  gitUnstage,
  gitDiscard,
  gitCommit,
  gitBranches,
  gitCheckout,
  gitDeleteBranch,
  gitFetch,
  gitPull,
  gitPush,
  gitLog,
  gitShowCommit,
  gitListTags,
  gitCreateTag,
  gitPushTags,
  gitDeleteTag
} from './git'
import {
  svnStatus,
  svnInfo,
  svnDiff,
  svnCommit,
  svnUpdate,
  svnRevert,
  svnAdd,
  svnDelete,
  svnLog
} from './svn'
import {
  aiStatus,
  startStream,
  cancelStream,
  signInWithApiKey,
  signInWithClaudeCode,
  signInWithProvider,
  setProvider,
  signOut,
  reinitAi
} from './ai'
import { reportBug, listBugs } from './bugs'
import {
  listAwsProfiles,
  listEksClusters,
  invalidateEksCache,
  openEksTerminal,
  prepareKubeconfig,
  describeEksCluster,
  cleanupKubeconfig
} from './aws'
import { kubectlGet, type KubeEnv } from './kube'
import {
  detectTerraform,
  listTfFiles,
  readTfBundle,
  tfValidate,
  resetTerraformCliCache
} from './terraform'
import type {
  AiProvider,
  AiStreamArgs,
  BugReportInput,
  EksOpenArgs,
  HostInput,
  OnboardingImportSshInput,
  OnboardingImportSshResult,
  OnboardingStatus,
  PtySpawnArgs,
  SessionId,
  SshConnectArgs,
  TermInputArgs,
  TermResizeArgs
} from '../shared/types'

export function registerIpcHandlers(): void {
  // KV
  // App metadata
  ipcMain.handle('app:version', () => app.getVersion())
  ipcMain.handle('app:platform', () => process.platform)

  ipcMain.handle('kv:get', (_e, key: string) => kvGet(key))
  ipcMain.handle('kv:set', (_e, key: string, value: string) => kvSet(key, value))

  // Hosts
  ipcMain.handle('hosts:list', () => listHosts())
  ipcMain.handle('hosts:get', (_e, id: number) => getHost(id))
  ipcMain.handle('hosts:create', (_e, input: HostInput) => createHost(input))
  ipcMain.handle('hosts:update', (_e, id: number, input: HostInput) => updateHost(id, input))
  ipcMain.handle('hosts:delete', async (_e, id: number) => {
    await clearHostSecrets(id)
    deleteHost(id)
  })
  ipcMain.handle('hosts:importSshConfig', () => importSshConfig())
  ipcMain.handle('hosts:importKnownHosts', () => importKnownHosts())
  ipcMain.handle('hosts:setTags', (_e, id: number, tags: string[]) => setHostTags(id, tags))
  ipcMain.handle('hosts:listTags', () => listAllTags())
  ipcMain.handle('hosts:listGroups', () => listAllGroups())
  ipcMain.handle('hosts:bulkSetTag', (_e, ids: number[], tag: string, add: boolean) =>
    bulkSetTag(ids, tag, add)
  )
  ipcMain.handle('hosts:bulkSetGroup', (_e, ids: number[], group: string | null) =>
    bulkSetGroup(ids, group)
  )
  ipcMain.handle('hosts:pin', (_e, id: number, pinned: boolean) => pinHost(id, pinned))
  ipcMain.handle('hosts:touch', (_e, id: number) => touchHost(id))

  // Keychain
  ipcMain.handle('keychain:get', (_e, hostId: number, kind: 'password' | 'passphrase') =>
    getSshSecret(hostId, kind)
  )
  ipcMain.handle(
    'keychain:set',
    (_e, hostId: number, kind: 'password' | 'passphrase', secret: string) =>
      setSshSecret(hostId, kind, secret)
  )
  ipcMain.handle('keychain:delete', (_e, hostId: number, kind: 'password' | 'passphrase') =>
    deleteSshSecret(hostId, kind)
  )

  // Terminal — SSH
  ipcMain.handle('ssh:connect', (_e, args: SshConnectArgs) => connectSsh(args))
  ipcMain.handle(
    'ssh:authReply',
    (_e, sessionId: SessionId, secret: string | null, remember: boolean) =>
      resolveAuthPrompt(sessionId, secret, remember)
  )

  // Terminal — local
  ipcMain.handle('pty:shells', () => detectShells())
  ipcMain.handle('pty:spawn', (_e, args: PtySpawnArgs) => spawnPty(args))

  // Terminal — unified
  ipcMain.handle('term:input', (_e, args: TermInputArgs) => {
    if (isPtySession(args.sessionId)) writePty(args.sessionId, args.data)
    else if (isSshSession(args.sessionId)) writeSsh(args.sessionId, args.data)
  })
  ipcMain.handle('term:resize', (_e, args: TermResizeArgs) => {
    if (isPtySession(args.sessionId)) resizePty(args.sessionId, args.cols, args.rows)
    else if (isSshSession(args.sessionId)) resizeSsh(args.sessionId, args.cols, args.rows)
  })
  ipcMain.handle('term:close', (_e, sessionId: SessionId) => {
    if (isPtySession(sessionId)) closePty(sessionId)
    else if (isSshSession(sessionId)) closeSsh(sessionId)
  })

  // Projects
  ipcMain.handle('projects:list', () => listProjects())
  ipcMain.handle('projects:pick', async () => {
    const defaultPath = getProjectsRoot()
    const r = await dialog.showOpenDialog({
      title: 'Choose a project folder',
      defaultPath: existsSync(defaultPath) ? defaultPath : homedir(),
      properties: ['openDirectory', 'createDirectory']
    })
    if (r.canceled || !r.filePaths[0]) return null
    return addProject(r.filePaths[0])
  })
  ipcMain.handle('projects:add', (_e, path: string) => addProject(path))
  ipcMain.handle('projects:remove', (_e, id: number) => removeProject(id))
  ipcMain.handle('projects:touch', (_e, id: number) => touchProject(id))
  ipcMain.handle('projects:detectVcs', (_e, path: string) => detectVcs(path))

  // FS
  ipcMain.handle('fs:readDir', (_e, path: string) => readDir(path))
  ipcMain.handle('fs:readText', (_e, path: string) => readTextFile(path))
  ipcMain.handle('fs:readBinary', (_e, path: string) => readBinaryFile(path))
  ipcMain.handle('fs:writeText', (_e, path: string, content: string) =>
    writeTextFile(path, content)
  )
  ipcMain.handle('shell:showItem', (_e, path: string) => {
    shell.showItemInFolder(path)
  })
  ipcMain.handle('fs:newFile', (_e, path: string) => createFile(path))
  ipcMain.handle('fs:newDir', (_e, path: string) => createDirectory(path))
  ipcMain.handle('fs:rename', (_e, from: string, to: string) => renameEntry(from, to))
  ipcMain.handle('fs:trash', (_e, path: string) => trashEntry(path))
  ipcMain.handle('fs:watch', (_e, root: string) => watchDir(root))
  ipcMain.handle('fs:unwatch', (_e, root: string) => unwatchDir(root))
  ipcMain.handle('fs:quickOpen', (_e, root: string) => quickOpenList(root))
  ipcMain.handle('fs:search', (_e, root: string, query: string) => ripgrepSearch(root, query))

  // Git
  ipcMain.handle('git:status', (_e, path: string) => gitStatus(path))
  ipcMain.handle('git:diffFile', (_e, path: string, file: string, staged: boolean) =>
    gitDiffFile(path, file, staged)
  )
  ipcMain.handle('git:fileAtRef', (_e, path: string, ref: string, file: string) =>
    gitFileAtRef(path, ref, file)
  )
  ipcMain.handle('git:stage', (_e, path: string, files: string[]) => gitStage(path, files))
  ipcMain.handle('git:unstage', (_e, path: string, files: string[]) => gitUnstage(path, files))
  ipcMain.handle('git:discard', (_e, path: string, files: string[]) => gitDiscard(path, files))
  ipcMain.handle('git:commit', (_e, path: string, message: string, amend: boolean) =>
    gitCommit(path, message, amend)
  )
  ipcMain.handle('git:branches', (_e, path: string) => gitBranches(path))
  ipcMain.handle('git:checkout', (_e, path: string, branch: string, create: boolean) =>
    gitCheckout(path, branch, create)
  )
  ipcMain.handle('git:deleteBranch', (_e, path: string, branch: string, force: boolean) =>
    gitDeleteBranch(path, branch, force)
  )
  ipcMain.handle('git:fetch', (_e, path: string) => gitFetch(path))
  ipcMain.handle('git:pull', (_e, path: string) => gitPull(path))
  ipcMain.handle('git:push', (_e, path: string) => gitPush(path))
  ipcMain.handle('git:log', (_e, path: string) => gitLog(path))
  ipcMain.handle('git:show', (_e, path: string, hash: string) => gitShowCommit(path, hash))
  ipcMain.handle('git:listTags', (_e, path: string) => gitListTags(path))
  ipcMain.handle('git:createTag', (_e, path: string, tag: string, message?: string) =>
    gitCreateTag(path, tag, message)
  )
  ipcMain.handle('git:pushTags', (_e, path: string) => gitPushTags(path))
  ipcMain.handle('git:deleteTag', (_e, path: string, tag: string) => gitDeleteTag(path, tag))

  // SVN
  ipcMain.handle('svn:status', (_e, path: string) => svnStatus(path))
  ipcMain.handle('svn:info', (_e, path: string) => svnInfo(path))
  ipcMain.handle('svn:diff', (_e, path: string, file?: string) => svnDiff(path, file))
  ipcMain.handle('svn:commit', (_e, path: string, message: string, files: string[]) =>
    svnCommit(path, message, files)
  )
  ipcMain.handle('svn:update', (_e, path: string) => svnUpdate(path))
  ipcMain.handle('svn:revert', (_e, path: string, files: string[]) => svnRevert(path, files))
  ipcMain.handle('svn:add', (_e, path: string, files: string[]) => svnAdd(path, files))
  ipcMain.handle('svn:delete', (_e, path: string, files: string[]) => svnDelete(path, files))
  ipcMain.handle('svn:log', (_e, path: string) => svnLog(path))

  // Snippets
  ipcMain.handle('snippets:list', () =>
    listSnippets().map((r) => ({
      id: r.id,
      title: r.title,
      body: r.body,
      hostFilter: r.host_filter,
      confirmBeforeRun: r.confirm_before_run === 1
    }))
  )
  ipcMain.handle(
    'snippets:create',
    (_e, title: string, body: string, hostFilter: string | null, confirmBeforeRun: boolean) => {
      const r = createSnippet(title, body, hostFilter, confirmBeforeRun)
      return {
        id: r.id,
        title: r.title,
        body: r.body,
        hostFilter: r.host_filter,
        confirmBeforeRun: r.confirm_before_run === 1
      }
    }
  )
  ipcMain.handle(
    'snippets:update',
    (
      _e,
      id: number,
      title: string,
      body: string,
      hostFilter: string | null,
      confirmBeforeRun: boolean
    ) => {
      const r = updateSnippet(id, title, body, hostFilter, confirmBeforeRun)
      return {
        id: r.id,
        title: r.title,
        body: r.body,
        hostFilter: r.host_filter,
        confirmBeforeRun: r.confirm_before_run === 1
      }
    }
  )
  ipcMain.handle('snippets:delete', (_e, id: number) => deleteSnippet(id))

  // Tasks
  const rowToTask = (r: TaskRow): Task => ({
    id: r.id,
    projectId: r.project_id,
    title: r.title,
    body: r.body,
    status: r.status as Task['status'],
    priority: r.priority as Task['priority'],
    dueAt: r.due_at,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    completedAt: r.completed_at,
    sortKey: r.sort_key
  })
  ipcMain.handle('tasks:list', (_e, projectId: number | null | undefined) =>
    listTasks(projectId).map(rowToTask)
  )
  ipcMain.handle('tasks:create', (_e, input: TaskCreateInput) =>
    rowToTask(createTask(input))
  )
  ipcMain.handle('tasks:update', (_e, id: number, patch: TaskPatch) =>
    rowToTask(updateTask(id, patch))
  )
  ipcMain.handle('tasks:delete', (_e, id: number) => deleteTask(id))

  // Bugs
  ipcMain.handle('bugs:report', (_e, input: BugReportInput) => reportBug(input))
  ipcMain.handle('bugs:list', () => listBugs())

  // AI
  ipcMain.handle('ai:status', () => aiStatus())
  ipcMain.handle('ai:reinit', () => reinitAi())
  ipcMain.handle('ai:signIn', (_e, apiKey: string) => signInWithApiKey(apiKey))
  ipcMain.handle('ai:signInClaudeCode', () => signInWithClaudeCode())
  ipcMain.handle('ai:signInProvider', (_e, provider: AiProvider, apiKey: string) =>
    signInWithProvider(provider, apiKey)
  )
  ipcMain.handle('ai:setProvider', (_e, provider: AiProvider) => setProvider(provider))
  ipcMain.handle('ai:signOut', () => signOut())
  ipcMain.handle('ai:stream', (_e, args: AiStreamArgs) => {
    // fire and forget — events stream back via send()
    void startStream(args)
  })
  ipcMain.handle('ai:cancel', (_e, streamId: string) => cancelStream(streamId))

  // AWS / EKS
  ipcMain.handle('aws:listProfiles', () => listAwsProfiles())
  ipcMain.handle('aws:listClusters', (_e, profile: string, region: string, force?: boolean) =>
    listEksClusters(profile, region, { force: !!force })
  )
  ipcMain.handle('aws:invalidateCache', (_e, profile?: string, region?: string) =>
    invalidateEksCache(profile, region)
  )
  ipcMain.handle('aws:openCluster', (_e, args: EksOpenArgs) => openEksTerminal(args))
  ipcMain.handle('aws:prepareKubeconfig', (_e, args: EksOpenArgs) => prepareKubeconfig(args))
  ipcMain.handle('aws:describeCluster', (_e, profile: string, region: string, name: string) =>
    describeEksCluster(profile, region, name)
  )
  ipcMain.handle('aws:cleanupKubeconfig', (_e, path: string) => cleanupKubeconfig(path))
  ipcMain.handle(
    'kube:get',
    (_e, env: KubeEnv, resource: string, opts: { namespace?: string; cluster?: boolean }) =>
      kubectlGet(env, resource, opts ?? {})
  )
  ipcMain.handle('aws:getProfileRegion', async (_e, profile: string) => {
    const v = (await kvGet(`aws.region.${profile}`)) ?? null
    if (v) return v
    const p = listAwsProfiles().find((x) => x.name === profile)
    return p?.region ?? null
  })
  ipcMain.handle('aws:setProfileRegion', (_e, profile: string, region: string) =>
    kvSet(`aws.region.${profile}`, region)
  )

  // Terraform
  ipcMain.handle('terraform:detect', (_e, root: string) => detectTerraform(root))
  ipcMain.handle('terraform:list', (_e, root: string) => listTfFiles(root))
  ipcMain.handle('terraform:readBundle', (_e, root: string) => readTfBundle(root))
  ipcMain.handle('terraform:validate', (_e, root: string) => tfValidate(root))
  ipcMain.handle('terraform:resetCli', () => resetTerraformCliCache())

  // Onboarding — first-run wizard. Detection + explicit imports/seed. Once
  // 'onboarding:complete' fires, the silent seeders in main/index.ts are
  // considered done too (their KV gates are set here).
  ipcMain.handle('onboarding:status', async () => onboardingStatus())
  ipcMain.handle('onboarding:pickProjectsRoot', async () => {
    const start = getProjectsRoot()
    const r = await dialog.showOpenDialog({
      title: 'Choose your projects folder',
      defaultPath: existsSync(start) ? start : homedir(),
      properties: ['openDirectory', 'createDirectory']
    })
    if (r.canceled || !r.filePaths[0]) return null
    const chosen = r.filePaths[0]
    setProjectsRoot(chosen)
    return { path: chosen, childCount: countChildren(chosen) }
  })
  ipcMain.handle('onboarding:setProjectsRoot', async (_e, p: string) => {
    if (!p || !existsSync(p)) throw new Error(`Not a directory: ${p}`)
    setProjectsRoot(p)
    return { path: p, childCount: countChildren(p) }
  })
  ipcMain.handle(
    'onboarding:importSsh',
    async (_e, input: OnboardingImportSshInput): Promise<OnboardingImportSshResult> => {
      let configAdded = 0
      let knownHostsAdded = 0
      if (input.importConfig) {
        try {
          const r = await importSshConfig()
          configAdded = r.added
        } catch (err) {
          console.error('[onboarding] importSshConfig failed', err)
        }
      }
      if (input.importKnownHosts) {
        try {
          const r = await importKnownHosts()
          knownHostsAdded = r.added
        } catch (err) {
          console.error('[onboarding] importKnownHosts failed', err)
        }
      }
      return { configAdded, knownHostsAdded }
    }
  )
  ipcMain.handle('onboarding:seedProjects', async () => {
    const root = getProjectsRoot()
    if (!existsSync(root)) return { added: 0, root }
    let added = 0
    try {
      for (const name of readdirSync(root)) {
        if (name.startsWith('.')) continue
        const full = join(root, name)
        try {
          if (!statSync(full).isDirectory()) continue
        } catch {
          continue
        }
        try {
          addProject(full)
          added++
        } catch {
          /* duplicate — ignore */
        }
      }
    } catch (err) {
      console.error('[onboarding] seedProjects failed', err)
    }
    return { added, root }
  })
  ipcMain.handle('onboarding:complete', async () => {
    kvSet('onboarding.completedV1', '1')
    kvSet('imports.firstLaunchDone', '1')
    kvSet('projects.seededV1', '1')
    kvSet('hosts.dedupedV1', '1')
    kvSet('hosts.categorizedV2', '1')
    return { ok: true }
  })
}

// ---- Onboarding helpers ----

function countChildren(dir: string): number {
  try {
    let n = 0
    for (const name of readdirSync(dir)) {
      if (name.startsWith('.')) continue
      try {
        if (statSync(join(dir, name)).isDirectory()) n++
      } catch {
        /* ignore */
      }
    }
    return n
  } catch {
    return 0
  }
}

async function onboardingStatus(): Promise<OnboardingStatus> {
  const home = homedir()
  const sshCfg = join(home, '.ssh', 'config')
  const knownH = join(home, '.ssh', 'known_hosts')
  const awsCfg = process.env.AWS_CONFIG_FILE ?? join(home, '.aws', 'config')
  const awsCreds = process.env.AWS_SHARED_CREDENTIALS_FILE ?? join(home, '.aws', 'credentials')
  const kubeCfg = process.env.KUBECONFIG ?? join(home, '.kube', 'config')
  const projectsRootPath = getProjectsRoot()
  const projectsRootExists = existsSync(projectsRootPath)

  let sshConfigHostCount = 0
  if (existsSync(sshCfg)) {
    try {
      const rs = await parseSshConfig()
      sshConfigHostCount = rs.length
    } catch {
      /* ignore parse errors — still show the file exists */
    }
  }
  let knownHostsCount = 0
  if (existsSync(knownH)) {
    try {
      const kh = await parseKnownHosts()
      knownHostsCount = kh.length
    } catch {
      /* ignore */
    }
  }
  let awsProfileNames: string[] = []
  if (existsSync(awsCfg) || existsSync(awsCreds)) {
    try {
      awsProfileNames = listAwsProfiles().map((p) => p.name)
    } catch {
      /* ignore */
    }
  }

  return {
    completed: kvGet('onboarding.completedV1') === '1',
    detected: {
      sshConfig: existsSync(sshCfg),
      sshConfigHostCount,
      knownHosts: existsSync(knownH),
      knownHostsCount,
      awsConfig: existsSync(awsCfg),
      awsCredentials: existsSync(awsCreds),
      awsProfileNames,
      kubeConfig: existsSync(kubeCfg),
      projectsRoot: {
        path: projectsRootPath,
        exists: projectsRootExists,
        childCount: projectsRootExists ? countChildren(projectsRootPath) : 0
      }
    }
  }
}
