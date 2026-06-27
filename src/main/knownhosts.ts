import { homedir } from 'os'
import { readFile } from 'fs/promises'
import { join } from 'path'
import { parseSshConfig } from './sshconfig'
import { findHostByName, createHost } from './hosts'
import type { HostInput, ImportSshConfigResult } from '../shared/types'

interface KnownHostEntry {
  hostname: string
  port: number
}

/** Parse one host token from known_hosts.
 *  Forms: "host.example.com", "1.2.3.4", "[host]:2222", "[1.2.3.4]:22".
 *  Returns null for hashed (|1|...) entries.
 */
function parseToken(tok: string): KnownHostEntry | null {
  if (!tok || tok.startsWith('|')) return null
  const bracket = tok.match(/^\[([^\]]+)\](?::(\d+))?$/)
  if (bracket) {
    return { hostname: bracket[1], port: Number(bracket[2] ?? 22) || 22 }
  }
  // bare host or IP
  return { hostname: tok, port: 22 }
}

export async function parseKnownHosts(): Promise<KnownHostEntry[]> {
  let text: string
  try {
    text = await readFile(join(homedir(), '.ssh', 'known_hosts'), 'utf8')
  } catch {
    return []
  }
  const seen = new Map<string, KnownHostEntry>()
  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue
    if (line.startsWith('@')) continue // @cert-authority etc — skip the marker, take field 2
    const firstField = line.split(/\s+/)[0]
    if (!firstField) continue
    for (const tok of firstField.split(',')) {
      const ent = parseToken(tok)
      if (!ent) continue
      const key = `${ent.hostname}:${ent.port}`
      if (!seen.has(key)) seen.set(key, ent)
    }
  }
  return [...seen.values()]
}

/** Derive a short readable name from a hostname. For FQDNs, use the first label
 *  unless it collides with an existing host — in that case fall back to the
 *  full FQDN.
 */
function deriveName(hostname: string, port: number, taken: Set<string>): string {
  const short = hostname.includes('.') && !/^\d+\.\d+\.\d+\.\d+$/.test(hostname)
    ? hostname.split('.')[0]
    : hostname
  const candidate = port === 22 ? short : `${short}:${port}`
  if (!taken.has(candidate)) return candidate
  // collision — use the full hostname
  const full = port === 22 ? hostname : `${hostname}:${port}`
  return full
}

export async function importKnownHosts(): Promise<ImportSshConfigResult> {
  const [knownHosts, sshConfig] = await Promise.all([parseKnownHosts(), parseSshConfig()])

  // Index ssh_config by hostname (the resolved HostName, lowercased) so we can
  // copy across user / identity / port when an entry matches.
  const configByHostname = new Map<string, (typeof sshConfig)[number]>()
  for (const c of sshConfig) {
    configByHostname.set(c.hostname.toLowerCase(), c)
  }

  // Existing host names we must not collide with.
  const taken = new Set<string>()
  // We can't list here directly — findHostByName is the existing primitive.
  // Pre-compute proposed names and dedup against the DB during the insert pass.

  const defaultUser = process.env.USER ?? 'root'
  let added = 0
  let skipped = 0

  for (const kh of knownHosts) {
    const cfg = configByHostname.get(kh.hostname.toLowerCase())
    const port = cfg?.port ?? kh.port
    const user = cfg?.user ?? defaultUser
    const identityFile = cfg?.identityFile ?? null
    const proxyJump = cfg?.proxyJump ?? null

    let name = deriveName(kh.hostname, port, taken)
    // collision with DB? walk until free
    let suffix = 2
    while (findHostByName(name)) {
      if (suffix === 2) {
        // first collision: try the full hostname before numbering
        const full = port === 22 ? kh.hostname : `${kh.hostname}:${port}`
        if (!findHostByName(full) && !taken.has(full)) {
          name = full
          break
        }
      }
      name = `${kh.hostname}#${suffix}`
      suffix++
    }
    if (findHostByName(name)) {
      skipped++
      continue
    }
    taken.add(name)

    const input: HostInput = {
      name,
      hostname: kh.hostname,
      port,
      user,
      identityFile,
      proxyJump,
      group: cfg ? 'Imported' : 'known_hosts'
    }
    createHost(input)
    added++
  }

  return { added, skipped, total: knownHosts.length }
}
