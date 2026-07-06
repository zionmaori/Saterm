import { app } from 'electron'
import Database from 'better-sqlite3'
import { join } from 'path'
import { copyFileSync, existsSync, mkdirSync, readdirSync, statSync, unlinkSync } from 'fs'

let dbInstance: Database.Database | null = null

const BACKUP_KEEP = 5

export function getDb(): Database.Database {
  if (dbInstance) return dbInstance
  const dir = app.getPath('userData')
  mkdirSync(dir, { recursive: true })
  const path = join(dir, 'termion.db')
  const dbExists = existsSync(path)
  const db = new Database(path)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')

  // Peek the current on-disk schema version so we can snapshot the DB before
  // any migration mutates it. Only backup when a real upgrade is pending —
  // fresh installs (dbExists=false) and no-op boots don't need snapshots.
  const currentVersion = readSchemaVersion(db)
  const targetVersion = MIGRATIONS.length
  if (dbExists && currentVersion > 0 && currentVersion < targetVersion) {
    try {
      backupDb(dir, path, currentVersion)
    } catch (err) {
      console.error('[migrate] backup failed (continuing anyway)', err)
    }
  }

  migrate(db)

  if (currentVersion < targetVersion) {
    setKv(db, 'dataVersion', String(targetVersion))
    console.log(`[migrate] schema v${currentVersion} -> v${targetVersion}`)
  }

  dbInstance = db
  return db
}

function readSchemaVersion(db: Database.Database): number {
  db.exec('CREATE TABLE IF NOT EXISTS schema_version (version INTEGER PRIMARY KEY);')
  const row = db.prepare('SELECT version FROM schema_version LIMIT 1').get() as
    | { version: number }
    | undefined
  return row?.version ?? 0
}

function setKv(db: Database.Database, key: string, value: string): void {
  db.prepare(
    'INSERT INTO kv(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value'
  ).run(key, value)
}

function backupDb(userDataDir: string, dbPath: string, oldVersion: number): void {
  const backupsDir = join(userDataDir, 'backups')
  mkdirSync(backupsDir, { recursive: true })
  const ts = timestamp()
  const dest = join(backupsDir, `termion.db.v${oldVersion}.${ts}.bak`)
  copyFileSync(dbPath, dest)
  console.log(`[migrate] backed up v${oldVersion} db -> ${dest}`)
  pruneBackups(backupsDir)
}

function pruneBackups(backupsDir: string): void {
  let entries: { name: string; mtimeMs: number }[]
  try {
    entries = readdirSync(backupsDir)
      .filter((n) => n.startsWith('termion.db.') && n.endsWith('.bak'))
      .map((n) => ({ name: n, mtimeMs: statSync(join(backupsDir, n)).mtimeMs }))
  } catch {
    return
  }
  if (entries.length <= BACKUP_KEEP) return
  entries.sort((a, b) => b.mtimeMs - a.mtimeMs)
  for (const stale of entries.slice(BACKUP_KEEP)) {
    try {
      unlinkSync(join(backupsDir, stale.name))
    } catch {
      /* ignore */
    }
  }
}

function timestamp(): string {
  const d = new Date()
  const pad = (n: number): string => String(n).padStart(2, '0')
  return (
    `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-` +
    `${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`
  )
}

const MIGRATIONS: ((d: Database.Database) => void)[] = [
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
        .prepare<
          [],
          { id: number; role: string; env: string; group: string | null }
        >('SELECT id, role, env, "group" as "group" FROM hosts')
        .all()
      const insert = d.prepare('INSERT OR IGNORE INTO host_tags(host_id, tag) VALUES (?, ?)')
      for (const r of rows) {
        const tags = new Set<string>()
        if (r.role && r.role !== 'misc') tags.add(r.role)
        if (r.env && r.env !== 'other') tags.add(r.env)
        if (r.group) tags.add(r.group.toLowerCase().replace(/\s+/g, '-'))
        for (const t of tags) insert.run(r.id, t)
      }
    },
    (d) => {
      d.exec(`
        ALTER TABLE snippets ADD COLUMN confirm_before_run INTEGER NOT NULL DEFAULT 0;
      `)
    },
    (d) => {
      // Migration #5 — local task manager.
      // project_id NULL means "global" scope.
      d.exec(`
        CREATE TABLE tasks (
          id           INTEGER PRIMARY KEY AUTOINCREMENT,
          project_id   INTEGER,
          title        TEXT    NOT NULL,
          body         TEXT,
          status       TEXT    NOT NULL DEFAULT 'todo',
          priority     INTEGER NOT NULL DEFAULT 0,
          due_at       INTEGER,
          created_at   INTEGER NOT NULL,
          updated_at   INTEGER NOT NULL,
          completed_at INTEGER,
          sort_key     INTEGER NOT NULL DEFAULT 0,
          FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
        );
        CREATE INDEX idx_tasks_project ON tasks(project_id);
        CREATE INDEX idx_tasks_status  ON tasks(status);
        CREATE INDEX idx_tasks_due     ON tasks(due_at);
      `)
    }
  ]

function migrate(db: Database.Database): void {
  const current = readSchemaVersion(db)
  const target = MIGRATIONS.length
  if (current >= target) return
  const run = db.transaction(() => {
    for (let i = current; i < target; i++) MIGRATIONS[i](db)
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
    .prepare(
      'INSERT INTO kv(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value'
    )
    .run(key, value)
}

// ---- Snippets ---------------------------------------------------------------

export interface SnippetRow {
  id: number
  title: string
  body: string
  host_filter: string | null
  confirm_before_run: number
}

export function listSnippets(): SnippetRow[] {
  return getDb()
    .prepare('SELECT id, title, body, host_filter, confirm_before_run FROM snippets ORDER BY title')
    .all() as SnippetRow[]
}

export function createSnippet(
  title: string,
  body: string,
  hostFilter: string | null,
  confirmBeforeRun: boolean
): SnippetRow {
  const db = getDb()
  const info = db
    .prepare(
      'INSERT INTO snippets(title, body, host_filter, confirm_before_run) VALUES (?, ?, ?, ?)'
    )
    .run(title, body, hostFilter, confirmBeforeRun ? 1 : 0)
  return db
    .prepare('SELECT id, title, body, host_filter, confirm_before_run FROM snippets WHERE id = ?')
    .get(info.lastInsertRowid) as SnippetRow
}

export function updateSnippet(
  id: number,
  title: string,
  body: string,
  hostFilter: string | null,
  confirmBeforeRun: boolean
): SnippetRow {
  const db = getDb()
  db.prepare(
    'UPDATE snippets SET title = ?, body = ?, host_filter = ?, confirm_before_run = ? WHERE id = ?'
  ).run(title, body, hostFilter, confirmBeforeRun ? 1 : 0, id)
  return db
    .prepare('SELECT id, title, body, host_filter, confirm_before_run FROM snippets WHERE id = ?')
    .get(id) as SnippetRow
}

export function deleteSnippet(id: number): void {
  getDb().prepare('DELETE FROM snippets WHERE id = ?').run(id)
}

// ---- Tasks ------------------------------------------------------------------

export interface TaskRow {
  id: number
  project_id: number | null
  title: string
  body: string | null
  status: string
  priority: number
  due_at: number | null
  created_at: number
  updated_at: number
  completed_at: number | null
  sort_key: number
}

const TASK_COLS =
  'id, project_id, title, body, status, priority, due_at, created_at, updated_at, completed_at, sort_key'

/**
 * List tasks.
 *  - `projectId === undefined` → every task across all scopes (future global inbox).
 *  - `projectId === null`      → global tasks only (project_id IS NULL).
 *  - `projectId === <n>`       → tasks for that project.
 */
export function listTasks(projectId: number | null | undefined): TaskRow[] {
  const db = getDb()
  if (projectId === undefined) {
    return db
      .prepare(`SELECT ${TASK_COLS} FROM tasks ORDER BY sort_key, created_at`)
      .all() as TaskRow[]
  }
  if (projectId === null) {
    return db
      .prepare(
        `SELECT ${TASK_COLS} FROM tasks WHERE project_id IS NULL ORDER BY sort_key, created_at`
      )
      .all() as TaskRow[]
  }
  return db
    .prepare(
      `SELECT ${TASK_COLS} FROM tasks WHERE project_id = ? ORDER BY sort_key, created_at`
    )
    .all(projectId) as TaskRow[]
}

export interface TaskCreateInput {
  projectId: number | null
  title: string
  body?: string | null
  status?: string
  priority?: number
  dueAt?: number | null
}

export function createTask(input: TaskCreateInput): TaskRow {
  const db = getDb()
  const now = Date.now()
  const info = db
    .prepare(
      `INSERT INTO tasks(project_id, title, body, status, priority, due_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      input.projectId,
      input.title,
      input.body ?? null,
      input.status ?? 'todo',
      input.priority ?? 0,
      input.dueAt ?? null,
      now,
      now
    )
  return db
    .prepare(`SELECT ${TASK_COLS} FROM tasks WHERE id = ?`)
    .get(info.lastInsertRowid) as TaskRow
}

export interface TaskPatch {
  title?: string
  body?: string | null
  status?: string
  priority?: number
  dueAt?: number | null
  sortKey?: number
}

export function updateTask(id: number, patch: TaskPatch): TaskRow {
  const db = getDb()
  const current = db.prepare(`SELECT ${TASK_COLS} FROM tasks WHERE id = ?`).get(id) as
    | TaskRow
    | undefined
  if (!current) throw new Error(`Task ${id} not found`)

  const now = Date.now()
  const nextStatus = patch.status ?? current.status
  let completedAt: number | null = current.completed_at
  if (nextStatus === 'done' && current.status !== 'done') completedAt = now
  else if (nextStatus !== 'done' && current.status === 'done') completedAt = null

  db.prepare(
    `UPDATE tasks
       SET title = ?, body = ?, status = ?, priority = ?, due_at = ?, sort_key = ?,
           updated_at = ?, completed_at = ?
       WHERE id = ?`
  ).run(
    patch.title ?? current.title,
    patch.body === undefined ? current.body : patch.body,
    nextStatus,
    patch.priority ?? current.priority,
    patch.dueAt === undefined ? current.due_at : patch.dueAt,
    patch.sortKey ?? current.sort_key,
    now,
    completedAt,
    id
  )
  return db.prepare(`SELECT ${TASK_COLS} FROM tasks WHERE id = ?`).get(id) as TaskRow
}

export function deleteTask(id: number): void {
  getDb().prepare('DELETE FROM tasks WHERE id = ?').run(id)
}
