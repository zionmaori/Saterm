import { useApp } from '../store/app'
import type { CliRunEvent } from '../../../shared/types'

/** Minimal relative-path resolver — the renderer has no Node `path` module,
 *  and this only needs to handle the shapes a shell cwd + user-typed arg can
 *  produce. */
function resolvePath(cwd: string, p: string): string {
  if (/^([a-zA-Z]:[\\/]|[\\/])/.test(p)) return p
  const sep = cwd.includes('\\') && !cwd.includes('/') ? '\\' : '/'
  const combined = `${cwd.replace(/[\\/]+$/, '')}${sep}${p}`
  const parts = combined.split(/[\\/]/)
  const out: string[] = []
  for (const part of parts) {
    if (part === '' || part === '.') continue
    if (part === '..') out.pop()
    else out.push(part)
  }
  return (sep === '/' ? '/' : '') + out.join(sep)
}

function findByName<T extends { name: string }>(items: T[], query: string): T | null {
  const q = query.trim().toLowerCase()
  if (!q) return null
  const exact = items.find((i) => i.name.toLowerCase() === q)
  if (exact) return exact
  return items.find((i) => i.name.toLowerCase().includes(q)) ?? null
}

/** Dispatches a `saterm <cmd> [args...]` invocation forwarded from the CLI
 *  wrapper (see cliInstall.ts / cli.ts on the main side). Runs against
 *  whichever window received it — main only forwards to the primary window,
 *  so there's exactly one listener active at a time. */
export function runCliCommand({ cwd, tokens }: CliRunEvent): void {
  const [cmd, ...rest] = tokens
  const arg = rest.join(' ')
  const state = useApp.getState()

  switch (cmd) {
    case undefined:
      // Bare `saterm` — main process already focused/restored the window.
      return
    case 'new':
      state.openLocalTab()
      return
    case 'ssh': {
      const host = findByName(state.hosts, arg)
      if (!host) {
        alert(`saterm ssh: no host matching "${arg}"`)
        return
      }
      state.openSshTab(host)
      return
    }
    case 'project': {
      const q = arg.trim().toLowerCase()
      const existing =
        findByName(state.projects, arg) ??
        state.projects.find((p) => p.path.toLowerCase().includes(q)) ??
        null
      if (existing) {
        state.openProjectTab(existing)
        return
      }
      const abs = resolvePath(cwd, arg)
      void window.api.fs
        .readDir(abs)
        .then(() => window.api.projects.add(abs))
        .then(async (p) => {
          await useApp.getState().refreshProjects()
          useApp.getState().openProjectTab(p)
        })
        .catch(() => alert(`saterm project: no project matching "${arg}"`))
      return
    }
    case 'snippet':
      document.dispatchEvent(new CustomEvent('saterm:run-snippet', { detail: { title: arg } }))
      return
    case 'open': {
      const colonIdx = arg.indexOf(':')
      if (colonIdx > 0) {
        const hostPart = arg.slice(0, colonIdx)
        const remotePath = arg.slice(colonIdx + 1)
        const host = state.hosts.find((h) => h.name.toLowerCase() === hostPart.toLowerCase())
        if (host && remotePath) {
          state.openRemoteFileTab(host.id, remotePath)
          return
        }
      }
      state.openFileTab(resolvePath(cwd, arg))
      return
    }
    default:
      alert(`saterm: unknown command "${cmd}"`)
  }
}
