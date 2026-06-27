import simpleGit, { type SimpleGit } from 'simple-git'

export interface GitStatusFile {
  path: string
  index: string
  workingDir: string
}

export interface GitStatus {
  current: string | null
  tracking: string | null
  ahead: number
  behind: number
  files: GitStatusFile[]
  conflicted: string[]
}

const g = (repoPath: string): SimpleGit => simpleGit({ baseDir: repoPath })

export async function gitStatus(repoPath: string): Promise<GitStatus> {
  const s = await g(repoPath).status()
  return {
    current: s.current,
    tracking: s.tracking,
    ahead: s.ahead,
    behind: s.behind,
    files: s.files.map((f) => ({
      path: f.path,
      index: f.index ?? ' ',
      workingDir: f.working_dir ?? ' '
    })),
    conflicted: s.conflicted
  }
}

export async function gitDiffFile(repoPath: string, file: string, staged: boolean): Promise<string> {
  const git = g(repoPath)
  const args = staged ? ['--cached', '--', file] : ['--', file]
  return git.diff(args)
}

export async function gitFileAtRef(
  repoPath: string,
  ref: 'HEAD' | ':' | string,
  file: string
): Promise<string> {
  // `git show :path` = staged version (index). `git show HEAD:path` = committed.
  // The renderer passes ':' as a sentinel for "index" — collapse that to an
  // empty prefix so we emit `git show :file`, not the invalid `git show ::file`.
  const spec = ref === ':' ? `:${file}` : `${ref}:${file}`
  try {
    return await g(repoPath).show([spec])
  } catch {
    return ''
  }
}

export async function gitStage(repoPath: string, files: string[]): Promise<void> {
  if (!files.length) return
  await g(repoPath).add(files)
}

export async function gitUnstage(repoPath: string, files: string[]): Promise<void> {
  if (!files.length) return
  await g(repoPath).reset(['HEAD', '--', ...files])
}

export async function gitDiscard(repoPath: string, files: string[]): Promise<void> {
  if (!files.length) return
  await g(repoPath).checkout(['--', ...files])
}

export async function gitCommit(
  repoPath: string,
  message: string,
  amend = false
): Promise<{ commit: string }> {
  const opts: Record<string, string | null> = {}
  if (amend) opts['--amend'] = null
  try {
    const r = await g(repoPath).commit(message, undefined, opts)
    return { commit: r.commit }
  } catch (err) {
    // simple-git throws a GitError whose `message` is rich but, on its way
    // through Electron IPC, can be reduced to just the class name. Pull the
    // git stderr out before re-throwing so the renderer's alert is useful.
    const e = err as { message?: string; stack?: string; task?: { commands?: string[] } }
    const msg = e?.message?.trim() || String(err)
    throw new Error(msg)
  }
}

export async function gitBranches(repoPath: string): Promise<{ current: string; all: string[] }> {
  const b = await g(repoPath).branchLocal()
  return { current: b.current, all: b.all }
}

export async function gitCheckout(repoPath: string, branch: string, create = false): Promise<void> {
  await (create ? g(repoPath).checkoutLocalBranch(branch) : g(repoPath).checkout(branch))
}

export async function gitDeleteBranch(repoPath: string, branch: string, force = false): Promise<void> {
  await g(repoPath).deleteLocalBranch(branch, force)
}

export async function gitFetch(repoPath: string): Promise<void> {
  await g(repoPath).fetch()
}

export async function gitPull(repoPath: string): Promise<string> {
  const r = await g(repoPath).pull()
  return JSON.stringify(r.summary)
}

export async function gitPush(repoPath: string): Promise<string> {
  const r = await g(repoPath).push()
  return JSON.stringify(r.pushed ?? r)
}

export interface GitLogEntry {
  hash: string
  date: string
  message: string
  author: string
  refs: string
}

export async function gitLog(repoPath: string, limit = 200): Promise<GitLogEntry[]> {
  const log = await g(repoPath).log({ maxCount: limit })
  return log.all.map((e) => ({
    hash: e.hash,
    date: e.date,
    message: e.message,
    author: e.author_name,
    refs: e.refs
  }))
}

export async function gitShowCommit(repoPath: string, hash: string): Promise<string> {
  return g(repoPath).show([hash])
}
