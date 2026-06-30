import { existsSync, statSync, watch as fsWatch, type FSWatcher } from 'fs'
import { readdir, readFile, writeFile, mkdir, rename } from 'fs/promises'
import { join, basename, relative, sep, dirname } from 'path'
import { spawn } from 'child_process'
import { BrowserWindow, shell } from 'electron'
import { getDb } from './db'
import type { Project, VcsKind } from '../shared/types'

interface ProjectRow {
  id: number
  name: string
  path: string
  vcs: VcsKind
  last_opened_at: number
}

const fromRow = (r: ProjectRow): Project => ({
  id: r.id,
  name: r.name,
  path: r.path,
  vcs: r.vcs,
  lastOpenedAt: r.last_opened_at
})

export function detectVcs(path: string): VcsKind {
  if (existsSync(join(path, '.git'))) return 'git'
  if (existsSync(join(path, '.svn'))) return 'svn'
  return 'none'
}

export function listProjects(): Project[] {
  const rows = getDb()
    .prepare('SELECT * FROM projects ORDER BY last_opened_at DESC')
    .all() as ProjectRow[]
  return rows.map(fromRow)
}

export function addProject(path: string): Project {
  const name = basename(path)
  const vcs = detectVcs(path)
  const now = Date.now()
  const stmt = getDb().prepare(
    `INSERT INTO projects(name, path, vcs, last_opened_at) VALUES (?, ?, ?, ?)
     ON CONFLICT(path) DO UPDATE SET last_opened_at = excluded.last_opened_at, vcs = excluded.vcs
     RETURNING *`
  )
  const row = stmt.get(name, path, vcs, now) as ProjectRow
  return fromRow(row)
}

export function touchProject(id: number): void {
  // Refresh `vcs` while we're here — projects can gain a .git after import.
  const row = getDb().prepare('SELECT path FROM projects WHERE id = ?').get(id) as
    | { path: string }
    | undefined
  if (row) {
    const vcs = detectVcs(row.path)
    getDb()
      .prepare('UPDATE projects SET last_opened_at = ?, vcs = ? WHERE id = ?')
      .run(Date.now(), vcs, id)
  }
}

/** Re-detect VCS for every project. Called once on startup so existing rows
 *  pick up a newly-created .git/.svn dir without forcing the user to re-add. */
export function refreshAllProjectVcs(): number {
  const db = getDb()
  const rows = db.prepare('SELECT id, path FROM projects').all() as {
    id: number
    path: string
  }[]
  const upd = db.prepare('UPDATE projects SET vcs = ? WHERE id = ?')
  let changed = 0
  const tx = db.transaction((items: typeof rows) => {
    for (const r of items) {
      const v = detectVcs(r.path)
      const cur = db.prepare('SELECT vcs FROM projects WHERE id = ?').get(r.id) as
        | { vcs: string }
        | undefined
      if (cur && cur.vcs !== v) {
        upd.run(v, r.id)
        changed++
      }
    }
  })
  tx(rows)
  return changed
}

export function removeProject(id: number): void {
  getDb().prepare('DELETE FROM projects WHERE id = ?').run(id)
}

export interface DirEntry {
  name: string
  path: string
  isDir: boolean
}

/** Dirs to hide from the file tree. These are noise (build output, dependency
 *  caches), not "hidden" in the dotfile sense. Dotfiles/dotdirs like .git,
 *  .env, .vscode are now shown — like `ls -a`. */
const IGNORED_DIRS = new Set(['node_modules', '.next', 'dist', 'out'])
const IGNORED_FILE_PREFIXES = ['.DS_']

export async function readDir(path: string): Promise<DirEntry[]> {
  const entries = await readdir(path, { withFileTypes: true })
  const filtered = entries
    .filter(
      (e) =>
        !IGNORED_DIRS.has(e.name) &&
        !IGNORED_FILE_PREFIXES.some((p) => e.name.startsWith(p))
    )
    .map((e) => ({
      name: e.name,
      path: join(path, e.name),
      isDir: e.isDirectory()
    }))
  filtered.sort((a, b) => {
    if (a.isDir !== b.isDir) return a.isDir ? -1 : 1
    return a.name.localeCompare(b.name)
  })
  return filtered
}

export async function readTextFile(path: string): Promise<string> {
  return readFile(path, 'utf8')
}

export async function writeTextFile(path: string, content: string): Promise<void> {
  await writeFile(path, content, 'utf8')
}

export async function createFile(path: string, content = ''): Promise<void> {
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, content, { encoding: 'utf8', flag: 'wx' })
}

export async function createDirectory(path: string): Promise<void> {
  await mkdir(path, { recursive: true })
}

export async function renameEntry(from: string, to: string): Promise<void> {
  await rename(from, to)
}

export async function trashEntry(path: string): Promise<void> {
  await shell.trashItem(path)
}

/** Recursive directory watch. macOS + Windows support `recursive: true` natively;
 *  on Linux we fall back to a non-recursive watch on the root (renderer still gets
 *  events for direct children, which is enough for the common case). */
interface WatchEntry {
  watcher: FSWatcher
  refs: number
}
const watchers = new Map<string, WatchEntry>()

const emit = (path: string, kind: 'change' | 'rename'): void => {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send('fs:changed', { root: path, kind })
  }
}

export function watchDir(root: string): void {
  const existing = watchers.get(root)
  if (existing) {
    existing.refs += 1
    return
  }
  try {
    const isLinux = process.platform === 'linux'
    const watcher = fsWatch(root, { recursive: !isLinux }, (eventType) => {
      emit(root, eventType === 'rename' ? 'rename' : 'change')
    })
    watcher.on('error', () => {
      /* silently drop — watchers can die on network volumes */
    })
    watchers.set(root, { watcher, refs: 1 })
  } catch {
    /* unwatchable path — fine, just no live updates */
  }
}

export function unwatchDir(root: string): void {
  const entry = watchers.get(root)
  if (!entry) return
  entry.refs -= 1
  if (entry.refs <= 0) {
    try { entry.watcher.close() } catch { /* ignore */ }
    watchers.delete(root)
  }
}

export interface QuickOpenEntry {
  name: string
  relPath: string
  absPath: string
}

/** Quick-open + ripgrep search SHOULD skip .git etc. — different rules from
 *  the visible file tree. The tree is a browser; this is a code search. */
const QUICKOPEN_IGNORED_DIRS = new Set([
  ...IGNORED_DIRS,
  '.git',
  '.svn',
  '.hg',
  '.cache',
  '.idea',
  '.vscode'
])

export async function quickOpenList(root: string, limit = 5000): Promise<QuickOpenEntry[]> {
  const out: QuickOpenEntry[] = []
  const stack: string[] = [root]
  while (stack.length && out.length < limit) {
    const dir = stack.pop()!
    let entries: import('fs').Dirent[]
    try {
      entries = await readdir(dir, { withFileTypes: true })
    } catch {
      continue
    }
    for (const e of entries) {
      if (QUICKOPEN_IGNORED_DIRS.has(e.name)) continue
      const p = join(dir, e.name)
      if (e.isDirectory()) {
        stack.push(p)
      } else {
        const rel = relative(root, p)
        out.push({ name: e.name, relPath: rel, absPath: p })
        if (out.length >= limit) break
      }
    }
  }
  return out
}

export interface SearchHit {
  file: string
  line: number
  column: number
  text: string
}

export async function ripgrepSearch(root: string, query: string, maxHits = 1000): Promise<SearchHit[]> {
  return new Promise((resolve, reject) => {
    const child = spawn('rg', ['--json', '--smart-case', '--max-count', '200', '--', query, root])
    const hits: SearchHit[] = []
    let buf = ''
    child.stdout.on('data', (chunk: Buffer) => {
      buf += chunk.toString('utf8')
      let nl: number
      while ((nl = buf.indexOf('\n')) !== -1) {
        const line = buf.slice(0, nl)
        buf = buf.slice(nl + 1)
        if (!line) continue
        try {
          const msg = JSON.parse(line)
          if (msg.type !== 'match') continue
          const data = msg.data
          const file = data.path?.text ?? ''
          const lineNumber = data.line_number ?? 0
          const text = data.lines?.text ?? ''
          for (const sub of data.submatches ?? []) {
            hits.push({
              file,
              line: lineNumber,
              column: (sub.start ?? 0) + 1,
              text: text.replace(/\n$/, '')
            })
            if (hits.length >= maxHits) break
          }
        } catch { /* ignore non-JSON line */ }
        if (hits.length >= maxHits) {
          try {
            child.kill()
          } catch { /* noop */ }
          break
        }
      }
    })
    child.on('error', (e: NodeJS.ErrnoException) => {
      if (e.code === 'ENOENT') {
        reject(new Error('ripgrep (rg) not found — install via `brew install ripgrep`'))
      } else {
        reject(e)
      }
    })
    child.on('close', () => resolve(hits))
  })
}

export function pathExists(p: string): boolean {
  try {
    return statSync(p).isFile() || statSync(p).isDirectory()
  } catch {
    return false
  }
}

export const pathSep = sep
