import { spawn } from 'child_process'

interface RunResult {
  stdout: string
  stderr: string
  code: number
}

function run(args: string[], cwd: string, stdin?: string): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    const child = spawn('svn', args, { cwd })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (c: Buffer) => (stdout += c.toString('utf8')))
    child.stderr.on('data', (c: Buffer) => (stderr += c.toString('utf8')))
    child.on('error', (e: NodeJS.ErrnoException) => {
      if (e.code === 'ENOENT') reject(new Error('svn not found in PATH'))
      else reject(e)
    })
    child.on('close', (code) => resolve({ stdout, stderr, code: code ?? 0 }))
    if (stdin) {
      child.stdin.end(stdin)
    }
  })
}

async function runOk(args: string[], cwd: string, stdin?: string): Promise<string> {
  const r = await run(args, cwd, stdin)
  if (r.code !== 0) throw new Error(r.stderr.trim() || `svn ${args[0]} exited ${r.code}`)
  return r.stdout
}

export interface SvnStatusEntry {
  path: string
  status: string
  revision: number | null
}

export interface SvnStatus {
  files: SvnStatusEntry[]
}

// svn status --xml emits <entry path="..."><wc-status item="modified" revision="N"/></entry>
export async function svnStatus(repoPath: string): Promise<SvnStatus> {
  const xml = await runOk(['status', '--xml'], repoPath)
  const entries: SvnStatusEntry[] = []
  const entryRegex = /<entry\s+path="([^"]+)"[\s\S]*?<wc-status\s+([^/]+)\/>/g
  let m: RegExpExecArray | null
  while ((m = entryRegex.exec(xml)) !== null) {
    const [, path, attrs] = m
    const itemMatch = attrs.match(/\bitem="([^"]+)"/)
    const revMatch = attrs.match(/\brevision="(\d+)"/)
    entries.push({
      path,
      status: itemMatch?.[1] ?? 'unknown',
      revision: revMatch ? Number(revMatch[1]) : null
    })
  }
  return { files: entries }
}

export interface SvnInfo {
  url: string
  root: string
  revision: number
  author: string | null
}

export async function svnInfo(repoPath: string): Promise<SvnInfo> {
  const xml = await runOk(['info', '--xml'], repoPath)
  const url = /<url>([^<]+)<\/url>/.exec(xml)?.[1] ?? ''
  const root = /<root>([^<]+)<\/root>/.exec(xml)?.[1] ?? ''
  const revision = Number(/<entry[^>]*revision="(\d+)"/.exec(xml)?.[1] ?? '0')
  const author = /<commit[^>]*>[\s\S]*?<author>([^<]+)<\/author>/.exec(xml)?.[1] ?? null
  return { url, root, revision, author }
}

export async function svnDiff(repoPath: string, file?: string): Promise<string> {
  const args = ['diff']
  if (file) args.push('--', file)
  const r = await run(args, repoPath)
  if (r.code !== 0 && r.stderr) throw new Error(r.stderr.trim())
  return r.stdout
}

export async function svnCommit(repoPath: string, message: string, files: string[]): Promise<string> {
  const args = ['commit', '-m', message, ...(files.length ? ['--', ...files] : [])]
  return runOk(args, repoPath)
}

export async function svnUpdate(repoPath: string): Promise<string> {
  return runOk(['update'], repoPath)
}

export async function svnRevert(repoPath: string, files: string[]): Promise<string> {
  if (!files.length) return ''
  return runOk(['revert', '--', ...files], repoPath)
}

export async function svnAdd(repoPath: string, files: string[]): Promise<string> {
  if (!files.length) return ''
  return runOk(['add', '--', ...files], repoPath)
}

export async function svnDelete(repoPath: string, files: string[]): Promise<string> {
  if (!files.length) return ''
  return runOk(['delete', '--', ...files], repoPath)
}

export interface SvnLogEntry {
  revision: number
  author: string
  date: string
  message: string
}

export async function svnLog(repoPath: string, limit = 200): Promise<SvnLogEntry[]> {
  const xml = await runOk(['log', '--xml', '-l', String(limit)], repoPath)
  const entries: SvnLogEntry[] = []
  const entryRegex = /<logentry\s+revision="(\d+)">([\s\S]*?)<\/logentry>/g
  let m: RegExpExecArray | null
  while ((m = entryRegex.exec(xml)) !== null) {
    const [, rev, body] = m
    entries.push({
      revision: Number(rev),
      author: /<author>([^<]*)<\/author>/.exec(body)?.[1] ?? '',
      date: /<date>([^<]*)<\/date>/.exec(body)?.[1] ?? '',
      message: /<msg>([\s\S]*?)<\/msg>/.exec(body)?.[1]?.trim() ?? ''
    })
  }
  return entries
}
