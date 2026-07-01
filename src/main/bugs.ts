import { app } from 'electron'
import { mkdirSync, readFileSync, writeFileSync, readdirSync, existsSync, renameSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'
import type { BugReportInput } from '../shared/types'

export function bugsFilePath(): string {
  const dir = app.getPath('userData')
  mkdirSync(dir, { recursive: true })
  return join(dir, 'bugs.md')
}

function readExisting(path: string): string {
  if (!existsSync(path)) return ''
  try {
    return readFileSync(path, 'utf8')
  } catch {
    return ''
  }
}

function atomicWrite(path: string, content: string): void {
  const tmp = `${path}.tmp`
  writeFileSync(tmp, content, 'utf8')
  renameSync(tmp, path)
}

function formatEntry(input: BugReportInput, reportedAt: string): string {
  const ctx = input.context
  const heading = `## ${reportedAt.slice(0, 16).replace('T', ' ')} — ${input.title.trim()}`
  const meta: string[] = []
  if (ctx) {
    meta.push(`- Platform: ${ctx.platform}`)
    if (ctx.kind) {
      const where = ctx.title ? `${ctx.kind} / ${ctx.title}` : ctx.kind
      meta.push(`- Tab: ${where}`)
    }
    meta.push(`- Host: ${ctx.hostName ?? '—'}`)
    if (ctx.projectPath) meta.push(`- Project path: ${ctx.projectPath}`)
    meta.push(`- App: ${ctx.appVersion}`)
  }
  meta.push(`- Reported: ${reportedAt}`)
  return `${heading}\n${meta.join('\n')}\n\n${input.description.trim()}\n\n---\n\n`
}

const HEADER = '# Termion bug reports\n\n<!-- newest first -->\n\n'

export function reportBug(input: BugReportInput): { reportedAt: string; path: string } {
  const path = bugsFilePath()
  const existing = readExisting(path)
  const reportedAt = new Date().toISOString()
  const entry = formatEntry(input, reportedAt)
  let next: string
  if (existing.startsWith(HEADER)) {
    next = HEADER + entry + existing.slice(HEADER.length)
  } else if (existing.trim().length === 0) {
    next = HEADER + entry
  } else {
    next = HEADER + entry + existing
  }
  atomicWrite(path, next)
  writeMemoryPointer(path).catch(() => undefined)
  return { reportedAt, path }
}

export function listBugs(): string {
  const path = bugsFilePath()
  return readExisting(path)
}

async function writeMemoryPointer(dataPath: string): Promise<void> {
  try {
    const projectsDir = join(homedir(), '.claude', 'projects')
    if (!existsSync(projectsDir)) return
    const matches = readdirSync(projectsDir, { withFileTypes: true })
      .filter((e) => e.isDirectory() && e.name.toLowerCase().includes('termion'))
      .map((e) => e.name)
    if (matches.length !== 1) {
      // 0 → can't infer where to write. multiple → ambiguous, don't guess.
      console.log(`[bugs] skipping memory write: ${matches.length} matching .claude project dirs`)
      return
    }
    const memDir = join(projectsDir, matches[0], 'memory')
    mkdirSync(memDir, { recursive: true })
    const pointerPath = join(memDir, 'bugs.md')
    const count = countEntries(dataPath)
    const pointer =
      `---\n` +
      `name: termion-bug-reports\n` +
      `description: Bug reports captured via Termion's in-app "Report a bug" dialog. Read the data file for the full list.\n` +
      `metadata:\n` +
      `  type: reference\n` +
      `---\n\n` +
      `Termion writes user-reported bugs to its userData dir.\n\n` +
      `Path on this machine: \`${dataPath}\`\n\n` +
      `Count: ${count}. Last reported: ${new Date().toISOString()}.\n\n` +
      `Read that file directly (most recent at top) when discussing termion bugs.\n`
    atomicWrite(pointerPath, pointer)
    updateMemoryIndex(memDir)
  } catch (err) {
    console.log(`[bugs] memory pointer write failed: ${(err as Error).message}`)
  }
}

function countEntries(dataPath: string): number {
  const content = readExisting(dataPath)
  if (!content) return 0
  return (content.match(/^## /gm) || []).length
}

const MEMORY_INDEX_LINE = "- [Bug reports](bugs.md) — pointer to Termion's userData bug log"

function updateMemoryIndex(memDir: string): void {
  const indexPath = join(memDir, 'MEMORY.md')
  const existing = existsSync(indexPath) ? readFileSync(indexPath, 'utf8') : ''
  if (existing.includes('(bugs.md)')) return
  const next =
    existing.length === 0
      ? `${MEMORY_INDEX_LINE}\n`
      : `${existing.replace(/\s*$/, '')}\n${MEMORY_INDEX_LINE}\n`
  atomicWrite(indexPath, next)
}
