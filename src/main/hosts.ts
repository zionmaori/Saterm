import { getDb } from './db'
import { categorize } from './categorize'
import type { GroupCount, Host, HostInput, TagCount } from '../shared/types'

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
  const rows = getDb().prepare(`${SELECT_HOSTS} ORDER BY name COLLATE NOCASE`).all() as HostRow[]
  return rows.map(fromRow)
}

export function getHost(id: number): Host | null {
  const row = getDb().prepare(`${SELECT_HOSTS} WHERE h.id = ?`).get(id) as HostRow | undefined
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
  const row = getDb().prepare(`${SELECT_HOSTS} WHERE h.name = ?`).get(name) as HostRow | undefined
  return row ? fromRow(row) : null
}

export function findHostByEndpoint(hostname: string, port: number): Host | null {
  const row = getDb()
    .prepare(`${SELECT_HOSTS} WHERE LOWER(h.hostname) = LOWER(?) AND h.port = ?`)
    .get(hostname, port) as HostRow | undefined
  return row ? fromRow(row) : null
}

interface DedupRow {
  id: number
  hostname: string
  port: number
  pinned_at: number | null
  last_used_at: number | null
  identity_file: string | null
  proxy_jump: string | null
  group: string | null
  tag_count: number
}

/** Collapse hosts that share the same (hostname, port). One keeper is chosen
 *  per group (pinned > most-recent > most-tagged > has-identity > oldest); the
 *  losers' tags are merged into the keeper, any non-null fields the keeper is
 *  missing are filled in from the losers, then the losers are deleted.
 *
 *  Returns the number of rows deleted. Safe to call repeatedly — a no-op once
 *  no duplicates remain.
 */
export function dedupHostsByEndpoint(): number {
  const db = getDb()
  const rows = db
    .prepare(
      `SELECT h.id, h.hostname, h.port, h.pinned_at, h.last_used_at,
              h.identity_file, h.proxy_jump, h."group" as "group",
              (SELECT COUNT(*) FROM host_tags WHERE host_id = h.id) as tag_count
       FROM hosts h`
    )
    .all() as DedupRow[]

  const groups = new Map<string, DedupRow[]>()
  for (const r of rows) {
    const key = `${r.hostname.toLowerCase()}|${r.port}`
    const list = groups.get(key)
    if (list) list.push(r)
    else groups.set(key, [r])
  }

  const losers: DedupRow[] = []
  const merges: { keeper: DedupRow; losers: DedupRow[] }[] = []
  for (const group of groups.values()) {
    if (group.length < 2) continue
    group.sort((a, b) => {
      if ((a.pinned_at != null) !== (b.pinned_at != null)) return a.pinned_at != null ? -1 : 1
      const au = a.last_used_at ?? 0
      const bu = b.last_used_at ?? 0
      if (au !== bu) return bu - au
      if (a.tag_count !== b.tag_count) return b.tag_count - a.tag_count
      if ((a.identity_file != null) !== (b.identity_file != null))
        return a.identity_file != null ? -1 : 1
      return a.id - b.id
    })
    const [keeper, ...rest] = group
    merges.push({ keeper, losers: rest })
    losers.push(...rest)
  }

  if (!losers.length) return 0

  const insTag = db.prepare('INSERT OR IGNORE INTO host_tags(host_id, tag) VALUES (?, ?)')
  const getTags = db.prepare('SELECT tag FROM host_tags WHERE host_id = ?')
  const delHost = db.prepare('DELETE FROM hosts WHERE id = ?')
  const updKeeper = db.prepare(
    `UPDATE hosts SET identity_file = ?, proxy_jump = ?, "group" = ?,
            pinned_at = ?, last_used_at = ? WHERE id = ?`
  )

  const tx = db.transaction(() => {
    for (const { keeper, losers: lost } of merges) {
      let identity = keeper.identity_file
      let proxy = keeper.proxy_jump
      let group = keeper.group
      let pinned = keeper.pinned_at
      let lastUsed = keeper.last_used_at
      for (const l of lost) {
        if (!identity && l.identity_file) identity = l.identity_file
        if (!proxy && l.proxy_jump) proxy = l.proxy_jump
        if (!group && l.group) group = l.group
        if (!pinned && l.pinned_at) pinned = l.pinned_at
        if ((l.last_used_at ?? 0) > (lastUsed ?? 0)) lastUsed = l.last_used_at
        const tags = getTags.all(l.id) as { tag: string }[]
        for (const t of tags) insTag.run(keeper.id, t.tag)
      }
      if (
        identity !== keeper.identity_file ||
        proxy !== keeper.proxy_jump ||
        group !== keeper.group ||
        pinned !== keeper.pinned_at ||
        lastUsed !== keeper.last_used_at
      ) {
        updKeeper.run(identity, proxy, group, pinned, lastUsed, keeper.id)
      }
      for (const l of lost) delHost.run(l.id)
    }
  })
  tx()
  return losers.length
}

/** Re-derive role/env for every existing host. Used as a one-time backfill on
 *  app start when the schema_version bumps. */
export function recategorizeAll(): number {
  const db = getDb()
  const rows = db.prepare('SELECT id, hostname FROM hosts').all() as {
    id: number
    hostname: string
  }[]
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

export function listAllGroups(): GroupCount[] {
  const rows = getDb()
    .prepare<[], { group: string; count: number }>(
      `SELECT "group" AS "group", COUNT(*) as count
       FROM hosts
       WHERE "group" IS NOT NULL AND TRIM("group") <> ''
       GROUP BY "group"
       ORDER BY count DESC, "group" COLLATE NOCASE`
    )
    .all()
  return rows
}

export function listAllTags(): TagCount[] {
  const rows = getDb()
    .prepare<
      [],
      { tag: string; count: number }
    >('SELECT tag, COUNT(*) as count FROM host_tags GROUP BY tag ORDER BY count DESC, tag COLLATE NOCASE')
    .all()
  return rows
}

/** Set `group` on every host in `ids` atomically. Pass null to clear. */
export function bulkSetGroup(ids: number[], group: string | null): void {
  if (!ids.length) return
  const g = group?.trim() || null
  const db = getDb()
  const upd = db.prepare('UPDATE hosts SET "group" = ? WHERE id = ?')
  const tx = db.transaction(() => {
    for (const id of ids) upd.run(g, id)
  })
  tx()
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
