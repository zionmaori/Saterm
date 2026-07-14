import type { KubeItem } from './kubeTypes'

export function ageOf(ts: string | undefined): string {
  if (!ts) return '—'
  const t = Date.parse(ts)
  if (!Number.isFinite(t)) return '—'
  const s = Math.max(0, Math.floor((Date.now() - t) / 1000))
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  if (h < 48) return `${h}h`
  const d = Math.floor(h / 24)
  if (d < 30) return `${d}d`
  const mo = Math.floor(d / 30)
  if (mo < 24) return `${mo}mo`
  return `${Math.floor(mo / 12)}y`
}

export function matchesFilter(text: string, q: string): boolean {
  if (!q.trim()) return true
  return text.toLowerCase().includes(q.toLowerCase())
}

export function rowKey(item: KubeItem, fallback: number): string {
  return (
    item.metadata?.uid ?? `${item.metadata?.namespace ?? ''}/${item.metadata?.name ?? fallback}`
  )
}

export function parseCpu(value: string | undefined): number {
  if (!value) return 0
  if (value.endsWith('m')) return Number.parseInt(value.slice(0, -1), 10) / 1000 || 0
  const n = Number.parseFloat(value)
  return Number.isFinite(n) ? n : 0
}

export function parseMemBytes(value: string | undefined): number {
  if (!value) return 0
  const m = value.match(/^(\d+)([KMGTPE]i?)?$/)
  if (!m) {
    const n = Number.parseInt(value, 10)
    return Number.isFinite(n) ? n : 0
  }
  const n = Number.parseInt(m[1], 10)
  const unit = m[2] ?? ''
  const mult: Record<string, number> = {
    '': 1,
    Ki: 1024,
    Mi: 1024 ** 2,
    Gi: 1024 ** 3,
    Ti: 1024 ** 4,
    Pi: 1024 ** 5,
    Ei: 1024 ** 6,
    K: 1000,
    M: 1000 ** 2,
    G: 1000 ** 3,
    T: 1000 ** 4,
    P: 1000 ** 5,
    E: 1000 ** 6
  }
  return n * (mult[unit] ?? 1)
}

export function formatMem(bytes: number): string {
  if (!bytes) return '—'
  const gib = bytes / 1024 ** 3
  if (gib >= 1) return `${gib.toFixed(1)} GiB`
  const mib = bytes / 1024 ** 2
  return `${mib.toFixed(0)} MiB`
}

/** Sum bytes from a k8s size string. */
export function podPhase(p: KubeItem): string {
  const st = (p.status as { phase?: string; reason?: string } | undefined) ?? {}
  return st.reason || st.phase || '—'
}

const HEALTHY_POD_PHASES = new Set(['Running', 'Succeeded', 'Pending', 'ContainerCreating'])

/**
 * True if the pod looks unhealthy: not in a normal phase, or has a container
 * that isn't ready / is waiting with a real reason / has crashed.
 */
export function podHasError(p: KubeItem): boolean {
  const phase = podPhase(p)
  if (!HEALTHY_POD_PHASES.has(phase)) return true
  const st =
    (p.status as
      | {
          containerStatuses?: Array<{
            ready?: boolean
            restartCount?: number
            state?: Record<string, { reason?: string; exitCode?: number }>
          }>
        }
      | undefined) ?? {}
  const cs = st.containerStatuses ?? []
  if (!cs.length && phase !== 'Succeeded') return phase !== 'Running' && phase !== 'Pending'
  for (const c of cs) {
    const waiting = c.state?.waiting
    if (waiting?.reason && waiting.reason !== 'ContainerCreating' && waiting.reason !== 'PodInitializing') {
      return true
    }
    const terminated = c.state?.terminated
    if (terminated && typeof terminated.exitCode === 'number' && terminated.exitCode !== 0) {
      return true
    }
  }
  return false
}

export function podReadyCount(p: KubeItem): { ready: number; total: number; restarts: number } {
  const st =
    (p.status as
      | { containerStatuses?: Array<{ ready?: boolean; restartCount?: number }> }
      | undefined) ?? {}
  const cs = st.containerStatuses ?? []
  const ready = cs.filter((c) => c.ready).length
  const restarts = cs.reduce((a, c) => a + (c.restartCount ?? 0), 0)
  return { ready, total: cs.length, restarts }
}
