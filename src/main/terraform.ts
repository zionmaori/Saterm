import { spawn, spawnSync } from 'child_process'
import { promises as fsp } from 'fs'
import { join, relative } from 'path'
import { getPath } from './shellEnv'
import type { TfBundle, TfDiagnostic, TfFile, TfValidateResult } from '../shared/types'

const IS_WIN = process.platform === 'win32'

function terraformInstallHint(): string {
  if (IS_WIN) {
    return 'Terraform CLI not found on PATH. Install with `winget install HashiCorp.Terraform` (or `choco install terraform`) and reopen Saterm.'
  }
  if (process.platform === 'linux') {
    return 'Terraform CLI not found on PATH. Install via your package manager (e.g. `apt install terraform`) and reopen Saterm.'
  }
  return 'Terraform CLI not found on PATH. Install with `brew install terraform` and reopen Saterm.'
}

function shellQuote(a: string): string {
  if (!IS_WIN) return a
  if (a.length > 0 && !/[\s"^&|<>()%!]/.test(a)) return a
  return `"${a.replace(/"/g, '""')}"`
}

const IGNORE_DIRS = new Set([
  '.terraform',
  '.git',
  '.svn',
  'node_modules',
  'dist',
  'out',
  '.next',
  '__pycache__'
])

const MAX_FILES = 50
const BUNDLE_MAX_FILES = 20
const PER_FILE_MAX_BYTES = 8 * 1024
const BUNDLE_MAX_BYTES = 150 * 1024
const SCAN_MAX_DEPTH = 8

function buildEnv(): NodeJS.ProcessEnv {
  return { ...process.env, PATH: getPath() }
}

let cachedCli: 'terraform' | 'tofu' | null | undefined
function detectCli(): 'terraform' | 'tofu' | null {
  if (cachedCli !== undefined) return cachedCli
  for (const candidate of ['terraform', 'tofu'] as const) {
    try {
      const r = spawnSync(candidate, ['version'], {
        env: buildEnv(),
        timeout: 3000,
        shell: IS_WIN,
        windowsHide: true
      })
      if (r.status === 0) {
        cachedCli = candidate
        return candidate
      }
    } catch {
      /* try next */
    }
  }
  cachedCli = null
  return null
}

// Reset the CLI cache if the user installs terraform/tofu later in the session.
export function resetTerraformCliCache(): void {
  cachedCli = undefined
}

// ──────────────────────────────────────────────────────────────────────────
// Discovery
// ──────────────────────────────────────────────────────────────────────────

async function walkTf(
  dir: string,
  root: string,
  out: TfFile[],
  depth: number,
  earlyExit?: () => boolean
): Promise<void> {
  if (depth > SCAN_MAX_DEPTH) return
  let entries: import('fs').Dirent[]
  try {
    entries = await fsp.readdir(dir, { withFileTypes: true })
  } catch {
    return
  }
  for (const e of entries) {
    if (earlyExit?.()) return
    if (e.name.startsWith('.') && e.name !== '.' && e.name !== '..') {
      // skip dotdirs except a couple — but we already skip dotdirs anyway since
      // terraform configs don't live in them. Allow root-level dotfiles? Not
      // needed; .tf files live in regular dirs.
      if (e.isDirectory()) continue
    }
    if (e.isDirectory()) {
      if (IGNORE_DIRS.has(e.name)) continue
      await walkTf(join(dir, e.name), root, out, depth + 1, earlyExit)
      if (out.length >= MAX_FILES && !earlyExit) return
    } else if (e.isFile() && (e.name.endsWith('.tf') || e.name.endsWith('.tf.json'))) {
      const abs = join(dir, e.name)
      out.push({ path: abs, relPath: relative(root, abs) })
      if (earlyExit?.()) return
      if (out.length >= MAX_FILES && !earlyExit) return
    }
  }
}

export async function detectTerraform(root: string): Promise<boolean> {
  let found = false
  const collected: TfFile[] = []
  await walkTf(root, root, collected, 0, () => {
    if (collected.length > 0) {
      found = true
      return true
    }
    return false
  })
  return found
}

export async function listTfFiles(root: string): Promise<TfFile[]> {
  const out: TfFile[] = []
  await walkTf(root, root, out, 0)
  out.sort((a, b) => {
    const aDepth = a.relPath.split('/').length
    const bDepth = b.relPath.split('/').length
    if (aDepth !== bDepth) return aDepth - bDepth
    return a.relPath.localeCompare(b.relPath)
  })
  return out.slice(0, MAX_FILES)
}

// ──────────────────────────────────────────────────────────────────────────
// Bundle for AI
// ──────────────────────────────────────────────────────────────────────────

export async function readTfBundle(root: string): Promise<TfBundle> {
  const all = await listTfFiles(root)
  const selected = all.slice(0, BUNDLE_MAX_FILES)
  let total = 0
  let truncated = all.length > selected.length
  const parts: string[] = []
  const includedFiles: TfFile[] = []
  for (const f of selected) {
    if (total >= BUNDLE_MAX_BYTES) {
      truncated = true
      break
    }
    let body: string
    try {
      body = await fsp.readFile(f.path, 'utf8')
    } catch {
      continue
    }
    let chunk = body
    if (chunk.length > PER_FILE_MAX_BYTES) {
      chunk = chunk.slice(0, PER_FILE_MAX_BYTES) + '\n# … truncated …\n'
      truncated = true
    }
    const header = `\n# === ${f.relPath} ===\n`
    if (total + header.length + chunk.length > BUNDLE_MAX_BYTES) {
      truncated = true
      break
    }
    parts.push(header + chunk)
    total += header.length + chunk.length
    includedFiles.push(f)
  }
  return {
    files: includedFiles,
    concatenated: parts.join(''),
    truncated
  }
}

// ──────────────────────────────────────────────────────────────────────────
// terraform validate
// ──────────────────────────────────────────────────────────────────────────

interface TfValidateJson {
  valid: boolean
  error_count?: number
  warning_count?: number
  diagnostics?: Array<{
    severity: string
    summary: string
    detail?: string
    range?: { filename?: string; start?: { line?: number } }
  }>
}

function runCli(
  cmd: string,
  args: string[],
  cwd: string
): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    let proc: ReturnType<typeof spawn>
    try {
      const spawnArgs = IS_WIN ? args.map(shellQuote) : args
      proc = spawn(cmd, spawnArgs, {
        env: buildEnv(),
        cwd,
        shell: IS_WIN,
        windowsHide: true
      })
    } catch (e) {
      reject(e)
      return
    }
    let stdout = ''
    let stderr = ''
    proc.stdout?.on('data', (d: Buffer) => (stdout += d.toString('utf8')))
    proc.stderr?.on('data', (d: Buffer) => (stderr += d.toString('utf8')))
    proc.on('error', (e) => reject(e))
    proc.on('close', (code) => resolve({ code: code ?? -1, stdout, stderr }))
  })
}

export async function tfValidate(root: string): Promise<TfValidateResult> {
  const cli = detectCli()
  if (!cli) {
    return {
      ok: false,
      diagnostics: [],
      stderr: terraformInstallHint(),
      cliMissing: true
    }
  }
  let result: { code: number; stdout: string; stderr: string }
  try {
    result = await runCli(cli, ['validate', '-json', '-no-color'], root)
  } catch (e) {
    return {
      ok: false,
      diagnostics: [],
      stderr: (e as Error).message || 'Failed to run terraform validate.'
    }
  }
  // terraform validate -json prints JSON to stdout on both success and errors;
  // it only writes to stderr when something prevented validation (e.g. needs
  // `terraform init`).
  let parsed: TfValidateJson | null = null
  try {
    parsed = JSON.parse(result.stdout)
  } catch {
    parsed = null
  }
  if (!parsed) {
    return {
      ok: false,
      diagnostics: [],
      stderr: (result.stderr || result.stdout).trim()
    }
  }
  const diagnostics: TfDiagnostic[] = (parsed.diagnostics ?? []).map((d) => ({
    severity: d.severity === 'warning' ? 'warning' : 'error',
    summary: d.summary,
    detail: d.detail ?? '',
    file: d.range?.filename ? relative(root, d.range.filename) || d.range.filename : undefined,
    line: d.range?.start?.line
  }))
  return {
    ok: !!parsed.valid && diagnostics.every((d) => d.severity !== 'error'),
    diagnostics,
    stderr: result.stderr.trim()
  }
}
