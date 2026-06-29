import { app } from 'electron'
import Database from 'better-sqlite3'
import { join } from 'path'
import { mkdirSync } from 'fs'

let dbInstance: Database.Database | null = null

export function getDb(): Database.Database {
  if (dbInstance) return dbInstance
  const dir = app.getPath('userData')
  mkdirSync(dir, { recursive: true })
  const path = join(dir, 'termion.db')
  const db = new Database(path)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  migrate(db)
  dbInstance = db
  return db
}

function migrate(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_version (
      version INTEGER PRIMARY KEY
    );
  `)
  const row = db.prepare('SELECT version FROM schema_version LIMIT 1').get() as
    | { version: number }
    | undefined
  const current = row?.version ?? 0
  const migrations: ((d: Database.Database) => void)[] = [
    (d) => {
      d.exec(`
        CREATE TABLE hosts (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          hostname TEXT NOT NULL,
          port INTEGER NOT NULL DEFAULT 22,
          user TEXT NOT NULL,
          identity_file TEXT,
          proxy_jump TEXT,
          "group" TEXT,
          created_at INTEGER NOT NULL
        );
        CREATE UNIQUE INDEX idx_hosts_name ON hosts(name);

        CREATE TABLE projects (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          path TEXT NOT NULL UNIQUE,
          vcs TEXT NOT NULL DEFAULT 'none',
          last_opened_at INTEGER NOT NULL
        );

        CREATE TABLE snippets (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          title TEXT NOT NULL,
          body TEXT NOT NULL,
          host_filter TEXT
        );

        CREATE TABLE kv (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL
        );
      `)
    },
    (d) => {
      d.exec(`
        ALTER TABLE hosts ADD COLUMN role TEXT NOT NULL DEFAULT 'misc';
        ALTER TABLE hosts ADD COLUMN env  TEXT NOT NULL DEFAULT 'other';
      `)
    },
    (d) => {
      // Migration #3 — free-form tags, pin & recents.
      //
      // host_tags is many-to-many. role/env/group columns are left in place
      // as a safety net for this release; the UI stops reading them after
      // Phase 7c. A later migration can drop them once we're confident.
      d.exec(`
        CREATE TABLE host_tags (
          host_id INTEGER NOT NULL,
          tag     TEXT    NOT NULL,
          PRIMARY KEY (host_id, tag),
          FOREIGN KEY (host_id) REFERENCES hosts(id) ON DELETE CASCADE
        );
        CREATE INDEX idx_host_tags_tag ON host_tags(tag);

        ALTER TABLE hosts ADD COLUMN pinned_at    INTEGER;
        ALTER TABLE hosts ADD COLUMN last_used_at INTEGER;
      `)

      // Backfill tags from existing role/env/group.
      const rows = d
        .prepare<[], { id: number; role: string; env: string; group: string | null }>(
          'SELECT id, role, env, "group" as "group" FROM hosts'
        )
        .all()
      const insert = d.prepare(
        'INSERT OR IGNORE INTO host_tags(host_id, tag) VALUES (?, ?)'
      )
      for (const r of rows) {
        const tags = new Set<string>()
        if (r.role && r.role !== 'misc') tags.add(r.role)
        if (r.env && r.env !== 'other') tags.add(r.env)
        if (r.group) tags.add(r.group.toLowerCase().replace(/\s+/g, '-'))
        for (const t of tags) insert.run(r.id, t)
      }
    }
  ]
  const target = migrations.length
  if (current >= target) return
  const run = db.transaction(() => {
    for (let i = current; i < target; i++) migrations[i](db)
    db.prepare('DELETE FROM schema_version').run()
    db.prepare('INSERT INTO schema_version(version) VALUES (?)').run(target)
  })
  run()
}

export function kvGet(key: string): string | null {
  const row = getDb().prepare('SELECT value FROM kv WHERE key = ?').get(key) as
    | { value: string }
    | undefined
  return row?.value ?? null
}

export function kvSet(key: string, value: string): void {
  getDb()
    .prepare('INSERT INTO kv(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value')
    .run(key, value)
}

// ---- Snippets ---------------------------------------------------------------

export interface SnippetRow {
  id: number
  title: string
  body: string
  host_filter: string | null
}

export function listSnippets(): SnippetRow[] {
  return getDb().prepare('SELECT id, title, body, host_filter FROM snippets ORDER BY title').all() as SnippetRow[]
}

export function createSnippet(title: string, body: string, hostFilter: string | null): SnippetRow {
  const db = getDb()
  const info = db.prepare('INSERT INTO snippets(title, body, host_filter) VALUES (?, ?, ?)').run(title, body, hostFilter)
  return db.prepare('SELECT id, title, body, host_filter FROM snippets WHERE id = ?').get(info.lastInsertRowid) as SnippetRow
}

export function updateSnippet(id: number, title: string, body: string, hostFilter: string | null): SnippetRow {
  const db = getDb()
  db.prepare('UPDATE snippets SET title = ?, body = ?, host_filter = ? WHERE id = ?').run(title, body, hostFilter, id)
  return db.prepare('SELECT id, title, body, host_filter FROM snippets WHERE id = ?').get(id) as SnippetRow
}

export function deleteSnippet(id: number): void {
  getDb().prepare('DELETE FROM snippets WHERE id = ?').run(id)
}
