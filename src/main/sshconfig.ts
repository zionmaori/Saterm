import { homedir } from 'os'
import { readFile } from 'fs/promises'
import { join, isAbsolute } from 'path'
import SSHConfig, { LineType } from 'ssh-config'
import { findHostByName, findHostByEndpoint, createHost } from './hosts'
import type { HostInput, ImportSshConfigResult } from '../shared/types'

interface ResolvedHost {
  name: string
  hostname: string
  port: number
  user: string
  identityFile: string | null
  proxyJump: string | null
}

const expand = (p: string): string =>
  p.startsWith('~') ? join(homedir(), p.slice(1)) : isAbsolute(p) ? p : p

async function readWithIncludes(path: string, seen = new Set<string>()): Promise<string> {
  const real = expand(path)
  if (seen.has(real)) return ''
  seen.add(real)
  let text: string
  try {
    text = await readFile(real, 'utf8')
  } catch {
    return ''
  }
  const out: string[] = []
  for (const line of text.split('\n')) {
    const m = line.match(/^\s*Include\s+(.+?)\s*$/i)
    if (m) {
      const target = expand(m[1].trim())
      out.push(await readWithIncludes(target, seen))
    } else {
      out.push(line)
    }
  }
  return out.join('\n')
}

export async function parseSshConfig(): Promise<ResolvedHost[]> {
  const text = await readWithIncludes(join(homedir(), '.ssh', 'config'))
  if (!text.trim()) return []
  const config = SSHConfig.parse(text)
  // Collect concrete host patterns (skip wildcards like "*", "*.foo").
  const names = new Set<string>()
  for (const node of config) {
    if (node.type !== LineType.DIRECTIVE) continue
    if (node.param.toLowerCase() !== 'host') continue
    const value = node.value
    const list = Array.isArray(value)
      ? value.map((v) => (typeof v === 'string' ? v : v.val))
      : String(value).split(/\s+/)
    for (const n of list) {
      if (!n || n.includes('*') || n.includes('?') || n.includes('!')) continue
      names.add(n)
    }
  }
  const result: ResolvedHost[] = []
  for (const name of names) {
    const resolved = config.compute(name) as Record<string, unknown>
    const hostname = String((resolved.HostName as string) ?? name)
    const port = Number((resolved.Port as string) ?? 22) || 22
    const user = String((resolved.User as string) ?? process.env.USER ?? 'root')
    const identityFileRaw = resolved.IdentityFile as string | string[] | undefined
    const identityFile = Array.isArray(identityFileRaw)
      ? identityFileRaw[0]
      : (identityFileRaw ?? null)
    const proxyJump = (resolved.ProxyJump as string | undefined) ?? null
    result.push({
      name,
      hostname,
      port,
      user,
      identityFile: identityFile ? expand(identityFile) : null,
      proxyJump
    })
  }
  return result
}

export async function importSshConfig(): Promise<ImportSshConfigResult> {
  const parsed = await parseSshConfig()
  let added = 0
  let skipped = 0
  for (const h of parsed) {
    if (findHostByName(h.name) || findHostByEndpoint(h.hostname, h.port)) {
      skipped++
      continue
    }
    const input: HostInput = {
      name: h.name,
      hostname: h.hostname,
      port: h.port,
      user: h.user,
      identityFile: h.identityFile,
      proxyJump: h.proxyJump,
      group: 'Imported'
    }
    createHost(input)
    added++
  }
  return { added, skipped, total: parsed.length }
}
