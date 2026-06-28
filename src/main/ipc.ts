import { app, dialog, ipcMain } from 'electron'
import { homedir } from 'os'
import { join } from 'path'
import { existsSync } from 'fs'
import { kvGet, kvSet } from './db'
import {
  listHosts,
  getHost,
  createHost,
  updateHost,
  deleteHost,
  setHostTags,
  listAllTags,
  bulkSetTag,
  pinHost,
  touchHost
} from './hosts'
import { importSshConfig } from './sshconfig'
import { importKnownHosts } from './knownhosts'
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
  writeTextFile,
  createFile,
  createDirectory,
  renameEntry,
  trashEntry,
  quickOpenList,
  ripgrepSearch
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
import { aiStatus, startStream, cancelStream, signInWithApiKey, signInWithClaudeCode, signInWithProvider, setProvider, signOut, reinitAi } from './ai'
import type {
  AiProvider,
  AiStreamArgs,
  HostInput,
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
  ipcMain.handle('hosts:bulkSetTag', (_e, ids: number[], tag: string, add: boolean) =>
    bulkSetTag(ids, tag, add)
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
    const defaultPath = join(homedir(), 'Projects')
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
  ipcMain.handle('fs:writeText', (_e, path: string, content: string) => writeTextFile(path, content))
  ipcMain.handle('fs:newFile', (_e, path: string) => createFile(path))
  ipcMain.handle('fs:newDir', (_e, path: string) => createDirectory(path))
  ipcMain.handle('fs:rename', (_e, from: string, to: string) => renameEntry(from, to))
  ipcMain.handle('fs:trash', (_e, path: string) => trashEntry(path))
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
  ipcMain.handle('git:createTag', (_e, path: string, tag: string, message?: string) => gitCreateTag(path, tag, message))
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

  // AI
  ipcMain.handle('ai:status', () => aiStatus())
  ipcMain.handle('ai:reinit', () => reinitAi())
  ipcMain.handle('ai:signIn', (_e, apiKey: string) => signInWithApiKey(apiKey))
  ipcMain.handle('ai:signInClaudeCode', () => signInWithClaudeCode())
  ipcMain.handle('ai:signInProvider', (_e, provider: AiProvider, apiKey: string) => signInWithProvider(provider, apiKey))
  ipcMain.handle('ai:setProvider', (_e, provider: AiProvider) => setProvider(provider))
  ipcMain.handle('ai:signOut', () => signOut())
  ipcMain.handle('ai:stream', (_e, args: AiStreamArgs) => {
    // fire and forget — events stream back via send()
    void startStream(args)
  })
  ipcMain.handle('ai:cancel', (_e, streamId: string) => cancelStream(streamId))
}
