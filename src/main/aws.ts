import { spawn, spawnSync } from 'child_process'
import { existsSync, mkdirSync, readFileSync, unlinkSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'
import { app } from 'electron'
import { v4 as uuid } from 'uuid'
import { readEnv } from './shellEnv'
import type {
  AwsProfile,
  EksCluster,
  EksOpenArgs,
  EksOpenResult
} from '../shared/types'

const CLUSTER_TTL_MS = 60_000

interface CacheEntry {
  at: number
  clusters: EksCluster[]
}

const clusterCache = new Map<string, CacheEntry>()

// ──────────────────────────────────────────────────────────────────────────
// INI parsing (tiny, hand-rolled — handles AWS config and credentials files)
// ──────────────────────────────────────────────────────────────────────────

type Ini = Map<string, Map<string, string>>

function parseIni(text: string): Ini {
  const out: Ini = new Map()
  let current: Map<string, string> | null = null
  for (const raw of text.split('\n')) {
    const line = raw.replace(/[#;].*$/, '').trim()
    if (!line) continue
    const sec = line.match(/^\[(.+)\]$/)
    if (sec) {
      const name = sec[1].trim()
      current = new Map()
      out.set(name, current)
      continue
    }
    if (!current) continue
    const eq = line.indexOf('=')
    if (eq <= 0) continue
    const key = line.slice(0, eq).trim().toLowerCase()
    const value = line.slice(eq + 1).trim()
    current.set(key, value)
  }
  return out
}

function readIniSafe(path: string): Ini {
  try {
    if (!existsSync(path)) return new Map()
    return parseIni(readFileSync(path, 'utf8'))
  } catch {
    return new Map()
  }
}

// ──────────────────────────────────────────────────────────────────────────
// Profile discovery
// ──────────────────────────────────────────────────────────────────────────

export function listAwsProfiles(): AwsProfile[] {
  const configPath = process.env.AWS_CONFIG_FILE ?? join(homedir(), '.aws', 'config')
  const credsPath =
    process.env.AWS_SHARED_CREDENTIALS_FILE ?? join(homedir(), '.aws', 'credentials')

  const config = readIniSafe(configPath)
  const creds = readIniSafe(credsPath)

  const merged = new Map<string, AwsProfile>()

  // Config sections: "[profile X]" except "[default]" which is bare.
  for (const [section, body] of config) {
    const name = section === 'default' ? 'default' : section.replace(/^profile\s+/, '')
    if (section !== 'default' && !section.startsWith('profile ')) continue
    const region = body.get('region') ?? null
    const isSso = body.has('sso_session') || body.has('sso_start_url')
    merged.set(name, { name, region, isSso, source: 'config' })
  }

  // Credentials sections: bare profile names.
  for (const [section] of creds) {
    const existing = merged.get(section)
    if (existing) {
      merged.set(section, { ...existing, source: 'both' })
    } else {
      merged.set(section, { name: section, region: null, isSso: false, source: 'credentials' })
    }
  }

  return [...merged.values()].sort((a, b) => {
    if (a.name === 'default') return -1
    if (b.name === 'default') return 1
    return a.name.localeCompare(b.name)
  })
}

// ──────────────────────────────────────────────────────────────────────────
// Child-process helper — runs AWS CLI with the user's login PATH
// ──────────────────────────────────────────────────────────────────────────

function buildEnv(extra: Record<string, string> = {}): NodeJS.ProcessEnv {
  const path = readEnv('PATH') ?? process.env.PATH ?? ''
  return { ...process.env, PATH: path, ...extra }
}

function mapAwsError(stderr: string, profile: string, isSso: boolean): string {
  const s = stderr.trim()
  if (!s) return `AWS CLI failed (no output).`
  if (/sso (session has expired|token .* expired)/i.test(s) || (isSso && /Unable to locate credentials/i.test(s))) {
    return `SSO session expired for "${profile}". Run \`aws sso login --profile ${profile}\` in a terminal, then refresh.`
  }
  if (/Unable to locate credentials/i.test(s)) {
    return `No credentials for "${profile}". Check ~/.aws/credentials or run \`aws configure --profile ${profile}\`.`
  }
  if (/could not connect to the endpoint/i.test(s)) {
    return `Could not reach AWS endpoint. Check your network and try again.`
  }
  return s
}

interface RunResult {
  code: number
  stdout: string
  stderr: string
}

function runAwsCli(args: string[]): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    let proc: ReturnType<typeof spawn>
    try {
      proc = spawn('aws', args, { env: buildEnv(), shell: false })
    } catch (e) {
      reject(e)
      return
    }
    let stdout = ''
    let stderr = ''
    proc.stdout?.on('data', (d: Buffer) => (stdout += d.toString('utf8')))
    proc.stderr?.on('data', (d: Buffer) => (stderr += d.toString('utf8')))
    proc.on('error', (e: NodeJS.ErrnoException) => {
      if (e.code === 'ENOENT') {
        reject(new Error('AWS CLI not found on PATH. Install with `brew install awscli` and reopen Termion.'))
      } else {
        reject(e)
      }
    })
    proc.on('close', (code) => resolve({ code: code ?? -1, stdout, stderr }))
  })
}

function awsCliExists(): boolean {
  try {
    const r = spawnSync('aws', ['--version'], { env: buildEnv(), timeout: 3000 })
    return r.status === 0
  } catch {
    return false
  }
}

// ──────────────────────────────────────────────────────────────────────────
// EKS list with cache
// ──────────────────────────────────────────────────────────────────────────

const cacheKey = (profile: string, region: string): string => `${profile}|${region}`

export async function listEksClusters(
  profile: string,
  region: string,
  opts: { force?: boolean } = {}
): Promise<EksCluster[]> {
  const key = cacheKey(profile, region)
  if (!opts.force) {
    const hit = clusterCache.get(key)
    if (hit && Date.now() - hit.at < CLUSTER_TTL_MS) return hit.clusters
  }
  if (!awsCliExists()) {
    throw new Error('AWS CLI not found on PATH. Install with `brew install awscli` and reopen Termion.')
  }
  const isSso = listAwsProfiles().find((p) => p.name === profile)?.isSso ?? false
  const r = await runAwsCli([
    'eks',
    'list-clusters',
    '--profile',
    profile,
    '--region',
    region,
    '--output',
    'json'
  ])
  if (r.code !== 0) {
    throw new Error(mapAwsError(r.stderr, profile, isSso))
  }
  let parsed: { clusters?: string[] }
  try {
    parsed = JSON.parse(r.stdout)
  } catch {
    throw new Error(`Could not parse 'aws eks list-clusters' output.`)
  }
  const clusters: EksCluster[] = (parsed.clusters ?? []).map((name) => ({
    name,
    profile,
    region
  }))
  clusterCache.set(key, { at: Date.now(), clusters })
  return clusters
}

export function invalidateEksCache(profile?: string, region?: string): void {
  if (profile && region) clusterCache.delete(cacheKey(profile, region))
  else clusterCache.clear()
}

// ──────────────────────────────────────────────────────────────────────────
// Kubeconfig prep + tab open
// ──────────────────────────────────────────────────────────────────────────

function kubeconfigDir(): string {
  const dir = join(app.getPath('userData'), 'kubeconfigs')
  try {
    mkdirSync(dir, { recursive: true })
  } catch {
    /* ignore */
  }
  return dir
}

function safeFileName(s: string): string {
  return s.replace(/[^A-Za-z0-9._-]/g, '_')
}

/**
 * Generate a per-cluster kubeconfig via `aws eks update-kubeconfig`.
 * Does NOT spawn a pty — the renderer's TerminalPane handles that when the tab
 * mounts. We return the kubeconfig path so the Tab can carry it (and the env
 * it implies) into `pty.spawn`.
 */
export async function openEksTerminal(args: EksOpenArgs): Promise<EksOpenResult> {
  const { profile, region, cluster } = args
  if (!awsCliExists()) {
    throw new Error('AWS CLI not found on PATH. Install with `brew install awscli` and reopen Termion.')
  }
  const fname = `${safeFileName(profile)}-${safeFileName(region)}-${safeFileName(cluster)}-${uuid()}.yaml`
  const kubeconfigPath = join(kubeconfigDir(), fname)
  const isSso = listAwsProfiles().find((p) => p.name === profile)?.isSso ?? false

  const r = await runAwsCli([
    'eks',
    'update-kubeconfig',
    '--profile',
    profile,
    '--region',
    region,
    '--name',
    cluster,
    '--kubeconfig',
    kubeconfigPath
  ])
  if (r.code !== 0) {
    try {
      unlinkSync(kubeconfigPath)
    } catch {
      /* ignore */
    }
    throw new Error(mapAwsError(r.stderr, profile, isSso))
  }

  return { kubeconfigPath }
}

export function cleanupKubeconfig(path: string): void {
  if (!path) return
  const root = kubeconfigDir()
  // Only delete files inside our own kubeconfigs dir.
  if (!path.startsWith(root)) return
  try {
    unlinkSync(path)
  } catch {
    /* already gone */
  }
}
