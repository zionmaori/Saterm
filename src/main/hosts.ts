import { getDb } from './db'
import { categorize } from './categorize'
import type { Host, HostInput, TagCount } from '../shared/types'

interface HostRow {
  id: number
  name: string
  hostname: string
  port: number
  user: string
  identity_file: string | null
  proxy_jump: string | null
  group: string | null
  role: string
  env: string
  pinned_at: number | null
  last_used_at: number | null
  tags_csv: string | null
  created_at: number
}

const fromRow = (r: HostRow): Host => ({
  id: r.id,
  name: r.name,
  hostname: r.hostname,
  port: r.port,
  user: r.user,
  identityFile: r.identity_file,
  proxyJump: r.proxy_jump,
  group: r.group,
  role: (r.role as Host['role']) ?? 'misc',
  env: (r.env as Host['env']) ?? 'other',
  tags: r.tags_csv ? r.tags_csv.split(',').filter(Boolean) : [],
  pinnedAt: r.pinned_at,
  lastUsedAt: r.last_used_at,
  createdAt: r.created_at
})

const SELECT_HOSTS = `
  SELECT h.*,
         (SELECT GROUP_CONCAT(tag, ',') FROM host_tags WHERE host_id = h.id) AS tags_csv
  FROM hosts h
`

function withDerived(input: HostInput): HostInput {
  if (input.role && input.env) return input
  const derived = categorize(input.hostname)
  return {
    ...input,
    role: input.role ?? derived.role,
    env: input.env ?? derived.env
  }
}

const normalizeTag = (t: string): string =>
  t.trim().toLowerCase().replace(/^#/, '').replace(/\s+/g, '-').slice(0, 64)

function replaceTags(hostId: number, tags: string[]): void {
  const db = getDb()
  const norm = Array.from(new Set(tags.map(normalizeTag).filter(Boolean)))
  const tx = db.transaction(() => {
    db.prepare('DELETE FROM host_tags WHERE host_id = ?').run(hostId)
    const ins = db.prepare('INSERT OR IGNORE INTO host_tags(host_id, tag) VALUES (?, ?)')
    for (const t of norm) ins.run(hostId, t)
  })
  tx()
}

export function listHosts(): Host[] {
  const rows = getDb()
    .prepare(`${SELECT_HOSTS} ORDER BY name COLLATE NOCASE`)
    .all() as HostRow[]
  return rows.map(fromRow)
}

export function getHost(id: number): Host | null {
  const row = getDb()
    .prepare(`${SELECT_HOSTS} WHERE h.id = ?`)
    .get(id) as HostRow | undefined
  return row ? fromRow(row) : null
}

export function createHost(input: HostInput): Host {
  const filled = withDerived(input)
  const stmt = getDb().prepare(
    `INSERT INTO hosts(name, hostname, port, user, identity_file, proxy_jump, "group", role, env, created_at)
     VALUES (@name, @hostname, @port, @user, @identityFile, @proxyJump, @group, @role, @env, @createdAt)`
  )
  const result = stmt.run({ ...filled, createdAt: Date.now() })
  const id = result.lastInsertRowid as number
  if (filled.tags && filled.tags.length) replaceTags(id, filled.tags)
  return getHost(id)!
}

export function updateHost(id: number, input: HostInput): Host {
  const filled = withDerived(input)
  getDb()
    .prepare(
      `UPDATE hosts
       SET name=@name, hostname=@hostname, port=@port, user=@user,
           identity_file=@identityFile, proxy_jump=@proxyJump, "group"=@group,
           role=@role, env=@env
       WHERE id=@id`
    )
    .run({ ...filled, id })
  if (filled.tags !== undefined) replaceTags(id, filled.tags)
  return getHost(id)!
}

export function deleteHost(id: number): void {
  getDb().prepare('DELETE FROM hosts WHERE id = ?').run(id)
}

export function findHostByName(name: string): Host | null {
  const row = getDb()
    .prepare(`${SELECT_HOSTS} WHERE h.name = ?`)
    .get(name) as HostRow | undefined
  return row ? fromRow(row) : null
}

/** Re-derive role/env for every existing host. Used as a one-time backfill on
 *  app start when the schema_version bumps. */
export function recategorizeAll(): number {
  const db = getDb()
  const rows = db.prepare('SELECT id, hostname FROM hosts').all() as { id: number; hostname: string }[]
  const upd = db.prepare('UPDATE hosts SET role = ?, env = ? WHERE id = ?')
  const tx = db.transaction((items: typeof rows) => {
    for (const r of items) {
      const c = categorize(r.hostname)
      upd.run(c.role, c.env, r.id)
    }
  })
  tx(rows)
  return rows.length
}

// ----- Tags -----

export function setHostTags(id: number, tags: string[]): Host {
  replaceTags(id, tags)
  return getHost(id)!
}

export function listAllTags(): TagCount[] {
  const rows = getDb()
    .prepare<[], { tag: string; count: number }>(
      'SELECT tag, COUNT(*) as count FROM host_tags GROUP BY tag ORDER BY count DESC, tag COLLATE NOCASE'
    )
    .all()
  return rows
}

/** Add or remove `tag` on every host in `ids` atomically. */
export function bulkSetTag(ids: number[], tag: string, add: boolean): void {
  if (!ids.length) return
  const t = normalizeTag(tag)
  if (!t) return
  const db = getDb()
  const tx = db.transaction(() => {
    if (add) {
      const ins = db.prepare('INSERT OR IGNORE INTO host_tags(host_id, tag) VALUES (?, ?)')
      for (const id of ids) ins.run(id, t)
    } else {
      const del = db.prepare('DELETE FROM host_tags WHERE host_id = ? AND tag = ?')
      for (const id of ids) del.run(id, t)
    }
  })
  tx()
}

// ----- Pin & recents -----

export function pinHost(id: number, pinned: boolean): void {
  getDb()
    .prepare('UPDATE hosts SET pinned_at = ? WHERE id = ?')
    .run(pinned ? Date.now() : null, id)
}

export function touchHost(id: number): void {
  getDb().prepare('UPDATE hosts SET last_used_at = ? WHERE id = ?').run(Date.now(), id)
}
