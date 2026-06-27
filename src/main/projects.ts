import { existsSync, statSync } from 'fs'
import { readdir, readFile, writeFile, mkdir, rename } from 'fs/promises'
import { join, basename, relative, sep, dirname } from 'path'
import { spawn } from 'child_process'
import { shell } from 'electron'
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
  getDb().prepare('UPDATE projects SET last_opened_at = ? WHERE id = ?').run(Date.now(), id)
}

export function removeProject(id: number): void {
  getDb().prepare('DELETE FROM projects WHERE id = ?').run(id)
}

export interface DirEntry {
  name: string
  path: string
  isDir: boolean
}

const IGNORED_DIRS = new Set(['.git', '.svn', 'node_modules', '.next', 'dist', 'out', '.DS_Store'])

export async function readDir(path: string): Promise<DirEntry[]> {
  const entries = await readdir(path, { withFileTypes: true })
  const filtered = entries
    .filter((e) => !IGNORED_DIRS.has(e.name) && !e.name.startsWith('.DS_'))
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

export interface QuickOpenEntry {
  name: string
  relPath: string
  absPath: string
}

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
      if (IGNORED_DIRS.has(e.name)) continue
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
