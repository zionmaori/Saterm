import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertCircle,
  Box as BoxIcon,
  Boxes,
  Calendar,
  Database,
  FileText,
  Globe,
  Info,
  KeyRound,
  Layers,
  Network,
  RefreshCw,
  Search,
  Server,
  Terminal as TerminalIcon
} from 'lucide-react'
import { useApp, type Tab } from '../store/app'

interface Props {
  tab: Tab
  visible: boolean
}

type SectionKey =
  | 'overview'
  | 'nodes'
  | 'namespaces'
  | 'pods'
  | 'deployments'
  | 'services'
  | 'ingresses'
  | 'configmaps'
  | 'secrets'
  | 'events'

interface SectionDef {
  key: SectionKey
  label: string
  icon: React.ComponentType<{ size?: number; strokeWidth?: number }>
  /** kubectl resource name; null for overview (composite). */
  resource: string | null
  /** true for cluster-scoped resources (no namespace selector). */
  cluster: boolean
  /** true if the resource is namespaced (offer a namespace filter). */
  namespaced: boolean
}

const SECTIONS: SectionDef[] = [
  {
    key: 'overview',
    label: 'Overview',
    icon: Info,
    resource: null,
    cluster: true,
    namespaced: false
  },
  {
    key: 'nodes',
    label: 'Nodes',
    icon: Server,
    resource: 'nodes',
    cluster: true,
    namespaced: false
  },
  {
    key: 'namespaces',
    label: 'Namespaces',
    icon: Layers,
    resource: 'namespaces',
    cluster: true,
    namespaced: false
  },
  { key: 'pods', label: 'Pods', icon: BoxIcon, resource: 'pods', cluster: false, namespaced: true },
  {
    key: 'deployments',
    label: 'Deployments',
    icon: Boxes,
    resource: 'deployments',
    cluster: false,
    namespaced: true
  },
  {
    key: 'services',
    label: 'Services',
    icon: Network,
    resource: 'services',
    cluster: false,
    namespaced: true
  },
  {
    key: 'ingresses',
    label: 'Ingresses',
    icon: Globe,
    resource: 'ingresses',
    cluster: false,
    namespaced: true
  },
  {
    key: 'configmaps',
    label: 'ConfigMaps',
    icon: FileText,
    resource: 'configmaps',
    cluster: false,
    namespaced: true
  },
  {
    key: 'secrets',
    label: 'Secrets',
    icon: KeyRound,
    resource: 'secrets',
    cluster: false,
    namespaced: true
  },
  {
    key: 'events',
    label: 'Events',
    icon: Calendar,
    resource: 'events',
    cluster: false,
    namespaced: true
  }
]

interface KubeEnv {
  kubeconfigPath: string
  profile: string
  region: string
}

interface ListPayload {
  items?: KubeItem[]
}

interface KubeItem {
  kind?: string
  apiVersion?: string
  metadata?: {
    name?: string
    namespace?: string
    creationTimestamp?: string
    labels?: Record<string, string>
    uid?: string
  }
  spec?: Record<string, unknown>
  status?: Record<string, unknown>
  data?: Record<string, unknown>
  type?: string
}

interface SectionState {
  loading: boolean
  error: string | null
  data: ListPayload | null
  fetchedAt: number | null
}

const emptyState: SectionState = { loading: false, error: null, data: null, fetchedAt: null }

export default function EksDashboard({ tab, visible }: Props): React.JSX.Element {
  const openEksTab = useApp((s) => s.openEksTab)
  const env: KubeEnv | null = useMemo(() => {
    if (!tab.eks || !tab.kubeconfigPath) return null
    return {
      kubeconfigPath: tab.kubeconfigPath,
      profile: tab.eks.profile,
      region: tab.eks.region
    }
  }, [tab.eks, tab.kubeconfigPath])

  const [active, setActive] = useState<SectionKey>('overview')
  const [namespace, setNamespace] = useState<string>('all')
  const [filter, setFilter] = useState('')
  const [sections, setSections] = useState<Record<SectionKey, SectionState>>(() => {
    const o = {} as Record<SectionKey, SectionState>
    for (const s of SECTIONS) o[s.key] = { ...emptyState }
    return o
  })
  const [overview, setOverview] = useState<{
    loading: boolean
    error: string | null
    data: Record<string, unknown> | null
  }>({ loading: false, error: null, data: null })

  const fetchSection = useCallback(
    async (key: SectionKey, ns: string) => {
      if (!env) return
      const def = SECTIONS.find((s) => s.key === key)
      if (!def || !def.resource) return
      setSections((s) => ({ ...s, [key]: { ...s[key], loading: true, error: null } }))
      try {
        const data = (await window.api.kube.get(env, def.resource, {
          cluster: def.cluster,
          namespace: def.namespaced ? ns : undefined
        })) as ListPayload
        setSections((s) => ({
          ...s,
          [key]: { loading: false, error: null, data, fetchedAt: Date.now() }
        }))
      } catch (e) {
        setSections((s) => ({
          ...s,
          [key]: { ...s[key], loading: false, error: (e as Error).message }
        }))
      }
    },
    [env]
  )

  const fetchOverview = useCallback(async () => {
    if (!env || !tab.eks) return
    setOverview({ loading: true, error: null, data: null })
    try {
      const [info, nodes] = await Promise.all([
        window.api.aws.describeCluster(tab.eks.profile, tab.eks.region, tab.eks.cluster),
        window.api.kube.get(env, 'nodes', { cluster: true }).catch(() => null)
      ])
      setOverview({
        loading: false,
        error: null,
        data: {
          cluster: info as Record<string, unknown> | null,
          nodes: nodes as ListPayload | null
        }
      })
    } catch (e) {
      setOverview({ loading: false, error: (e as Error).message, data: null })
    }
  }, [env, tab.eks])

  // Initial load when the tab becomes visible.
  useEffect(() => {
    if (!visible || !env) return
    if (active === 'overview') {
      if (!overview.data && !overview.loading && !overview.error) void fetchOverview()
    } else {
      const s = sections[active]
      if (!s.data && !s.loading && !s.error) void fetchSection(active, namespace)
    }
  }, [visible, env, active, namespace, sections, overview, fetchOverview, fetchSection])

  const handleRefresh = (): void => {
    if (active === 'overview') void fetchOverview()
    else void fetchSection(active, namespace)
  }

  const handleNamespaceChange = (ns: string): void => {
    setNamespace(ns)
    // Invalidate cached data for namespaced sections, fetch the active one immediately.
    setSections((s) => {
      const next = { ...s }
      for (const def of SECTIONS) {
        if (def.namespaced) next[def.key] = { ...emptyState }
      }
      return next
    })
    if (active !== 'overview') {
      const def = SECTIONS.find((d) => d.key === active)
      if (def?.namespaced) void fetchSection(active, ns)
    }
  }

  const namespaceItems = useMemo(() => {
    const nsState = sections.namespaces
    return (nsState.data?.items ?? []) as KubeItem[]
  }, [sections.namespaces])

  // Lazy-load the namespaces list once (for the selector) when tab opens.
  useEffect(() => {
    if (!visible || !env) return
    if (sections.namespaces.data || sections.namespaces.loading) return
    void fetchSection('namespaces', 'all')
  }, [visible, env, sections.namespaces, fetchSection])

  if (!env || !tab.eks) {
    return (
      <div style={{ display: visible ? 'flex' : 'none', flex: 1 }} className="eks-empty">
        <div>EKS dashboard requires a cluster context.</div>
      </div>
    )
  }

  const sectionDef = SECTIONS.find((s) => s.key === active)!
  const sectionState = sections[active]

  return (
    <div className="eks-root" style={{ display: visible ? 'flex' : 'none' }}>
      <div className="eks-sidebar">
        <div className="eks-cluster">
          <div className="eks-cluster-name" title={tab.eks.cluster}>
            <Server size={13} strokeWidth={2} />
            <span>{tab.eks.cluster}</span>
          </div>
          <div className="eks-cluster-meta">
            <span>{tab.eks.profile}</span>
            <span>·</span>
            <span>{tab.eks.region}</span>
          </div>
        </div>
        {SECTIONS.map((s) => {
          const Icon = s.icon
          const isActive = s.key === active
          const state = sections[s.key]
          const count = state.data?.items?.length
          return (
            <button
              key={s.key}
              className={`eks-nav ${isActive ? 'active' : ''}`}
              onClick={() => setActive(s.key)}
            >
              <Icon size={13} strokeWidth={2} />
              <span>{s.label}</span>
              {typeof count === 'number' && <span className="eks-nav-count">{count}</span>}
            </button>
          )
        })}
      </div>

      <div className="eks-main">
        <div className="eks-header">
          <span className="eks-header-title">{sectionDef.label}</span>
          {sectionDef.namespaced && (
            <select
              className="eks-ns-select"
              value={namespace}
              onChange={(e) => handleNamespaceChange(e.target.value)}
              title="Filter by namespace"
            >
              <option value="all">All namespaces</option>
              {namespaceItems.map((n) => {
                const nm = n.metadata?.name ?? ''
                return (
                  <option key={nm} value={nm}>
                    {nm}
                  </option>
                )
              })}
            </select>
          )}
          <div className="eks-search">
            <Search size={12} strokeWidth={2} />
            <input
              type="text"
              placeholder="Filter…"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            />
          </div>
          <button
            className="sidebar2-icon"
            onClick={handleRefresh}
            title="Refresh"
            disabled={
              (active === 'overview' && overview.loading) ||
              (active !== 'overview' && sectionState.loading)
            }
          >
            <RefreshCw size={13} />
          </button>
          <button
            className="sidebar2-icon"
            onClick={() => {
              if (!tab.eks) return
              void openEksTab({
                name: tab.eks.cluster,
                profile: tab.eks.profile,
                region: tab.eks.region
              })
            }}
            title="Open kubectl terminal"
          >
            <TerminalIcon size={13} />
          </button>
        </div>

        <div className="eks-body">
          {active === 'overview' ? (
            <OverviewView
              loading={overview.loading}
              error={overview.error}
              data={overview.data}
              cluster={tab.eks}
            />
          ) : sectionState.loading && !sectionState.data ? (
            <div className="eks-note">Loading…</div>
          ) : sectionState.error ? (
            <div className="eks-error">
              <AlertCircle size={13} /> {sectionState.error}
            </div>
          ) : (
            <SectionTable
              section={active}
              items={(sectionState.data?.items ?? []) as KubeItem[]}
              filter={filter}
            />
          )}
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────

function ageOf(ts: string | undefined): string {
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

function matchesFilter(text: string, q: string): boolean {
  if (!q.trim()) return true
  return text.toLowerCase().includes(q.toLowerCase())
}

function rowKey(item: KubeItem, fallback: number): string {
  return (
    item.metadata?.uid ?? `${item.metadata?.namespace ?? ''}/${item.metadata?.name ?? fallback}`
  )
}

// ─────────────────────────────────────────────────────────────────────────
// Overview
// ─────────────────────────────────────────────────────────────────────────

function OverviewView({
  loading,
  error,
  data,
  cluster
}: {
  loading: boolean
  error: string | null
  data: Record<string, unknown> | null
  cluster: { profile: string; region: string; cluster: string }
}): React.JSX.Element {
  if (loading && !data) return <div className="eks-note">Loading…</div>
  if (error)
    return (
      <div className="eks-error">
        <AlertCircle size={13} /> {error}
      </div>
    )

  const info = (data?.cluster ?? null) as Record<string, unknown> | null
  const nodesPayload = (data?.nodes ?? null) as ListPayload | null
  const nodeItems = (nodesPayload?.items ?? []) as KubeItem[]

  const get = (path: string): unknown => {
    if (!info) return null
    const parts = path.split('.')
    let cur: unknown = info
    for (const p of parts) {
      if (!cur || typeof cur !== 'object') return null
      cur = (cur as Record<string, unknown>)[p]
    }
    return cur
  }

  const stat = (get('status') as string) ?? '—'
  const version = (get('version') as string) ?? '—'
  const platformVersion = (get('platformVersion') as string) ?? '—'
  const endpoint = (get('endpoint') as string) ?? '—'
  const roleArn = (get('roleArn') as string) ?? '—'
  const vpcId = (get('resourcesVpcConfig.vpcId') as string) ?? '—'
  const createdAt = (get('createdAt') as string) ?? null
  const logging = (() => {
    const lg = get('logging.clusterLogging')
    if (!Array.isArray(lg)) return '—'
    const enabled: string[] = []
    for (const entry of lg) {
      if (entry && typeof entry === 'object') {
        const e = entry as { enabled?: boolean; types?: string[] }
        if (e.enabled && Array.isArray(e.types)) enabled.push(...e.types)
      }
    }
    return enabled.length ? enabled.join(', ') : 'none'
  })()

  let totalCpu = 0
  let totalMem = 0
  let readyNodes = 0
  for (const n of nodeItems) {
    const cap = (n.status as { capacity?: Record<string, string> } | undefined)?.capacity ?? {}
    totalCpu += parseCpu(cap.cpu)
    totalMem += parseMemBytes(cap.memory)
    const conds =
      (n.status as { conditions?: Array<{ type?: string; status?: string }> } | undefined)
        ?.conditions ?? []
    if (conds.some((c) => c.type === 'Ready' && c.status === 'True')) readyNodes++
  }

  return (
    <div className="eks-overview">
      <div className="eks-card-grid">
        <Card label="Status" value={stat} accent={stat === 'ACTIVE' ? 'ok' : 'warn'} />
        <Card label="Kubernetes" value={version} />
        <Card label="Platform" value={platformVersion} />
        <Card label="Nodes" value={`${readyNodes}/${nodeItems.length} ready`} />
        <Card label="Total CPU" value={`${totalCpu} cores`} />
        <Card label="Total Memory" value={formatMem(totalMem)} />
        <Card label="VPC" value={vpcId} />
        <Card label="Logging" value={logging} />
      </div>
      <div className="eks-detail-list">
        <DetailRow label="Cluster">{cluster.cluster}</DetailRow>
        <DetailRow label="Profile">{cluster.profile}</DetailRow>
        <DetailRow label="Region">{cluster.region}</DetailRow>
        <DetailRow label="Endpoint">
          <code>{endpoint}</code>
        </DetailRow>
        <DetailRow label="Service Role">
          <code>{roleArn}</code>
        </DetailRow>
        <DetailRow label="Created">
          {createdAt ? `${createdAt} · ${ageOf(createdAt)} ago` : '—'}
        </DetailRow>
      </div>
    </div>
  )
}

function Card({
  label,
  value,
  accent
}: {
  label: string
  value: string
  accent?: 'ok' | 'warn' | 'err'
}): React.JSX.Element {
  return (
    <div className={`eks-card eks-card-${accent ?? 'neutral'}`}>
      <div className="eks-card-label">{label}</div>
      <div className="eks-card-value">{value}</div>
    </div>
  )
}

function DetailRow({
  label,
  children
}: {
  label: string
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <div className="eks-detail-row">
      <div className="eks-detail-label">{label}</div>
      <div className="eks-detail-value">{children}</div>
    </div>
  )
}

function parseCpu(value: string | undefined): number {
  if (!value) return 0
  if (value.endsWith('m')) return Number.parseInt(value.slice(0, -1), 10) / 1000 || 0
  const n = Number.parseFloat(value)
  return Number.isFinite(n) ? n : 0
}

function parseMemBytes(value: string | undefined): number {
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

function formatMem(bytes: number): string {
  if (!bytes) return '—'
  const gib = bytes / 1024 ** 3
  if (gib >= 1) return `${gib.toFixed(1)} GiB`
  const mib = bytes / 1024 ** 2
  return `${mib.toFixed(0)} MiB`
}

// ─────────────────────────────────────────────────────────────────────────
// Section table
// ─────────────────────────────────────────────────────────────────────────

function SectionTable({
  section,
  items,
  filter
}: {
  section: SectionKey
  items: KubeItem[]
  filter: string
}): React.JSX.Element {
  if (!items || items.length === 0) {
    return <div className="eks-note">No items.</div>
  }
  switch (section) {
    case 'nodes':
      return <NodesTable items={items} filter={filter} />
    case 'namespaces':
      return <NamespacesTable items={items} filter={filter} />
    case 'pods':
      return <PodsTable items={items} filter={filter} />
    case 'deployments':
      return <DeploymentsTable items={items} filter={filter} />
    case 'services':
      return <ServicesTable items={items} filter={filter} />
    case 'ingresses':
      return <IngressesTable items={items} filter={filter} />
    case 'configmaps':
      return <SimpleNsTable items={items} filter={filter} kind="ConfigMap" />
    case 'secrets':
      return <SecretsTable items={items} filter={filter} />
    case 'events':
      return <EventsTable items={items} filter={filter} />
    default:
      return <div className="eks-note">Unsupported section.</div>
  }
}

function NodesTable({ items, filter }: { items: KubeItem[]; filter: string }): React.JSX.Element {
  const rows = items.filter((n) => matchesFilter(n.metadata?.name ?? '', filter))
  return (
    <div className="eks-table-wrap">
      <table className="eks-table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Status</th>
            <th>Roles</th>
            <th>Version</th>
            <th>Instance</th>
            <th>CPU</th>
            <th>Memory</th>
            <th>Internal IP</th>
            <th>Age</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((n, i) => {
            const conds =
              (n.status as { conditions?: Array<{ type?: string; status?: string }> } | undefined)
                ?.conditions ?? []
            const ready = conds.find((c) => c.type === 'Ready')?.status === 'True'
            const labels = n.metadata?.labels ?? {}
            const roles =
              Object.keys(labels)
                .filter((k) => k.startsWith('node-role.kubernetes.io/'))
                .map((k) => k.replace('node-role.kubernetes.io/', ''))
                .join(', ') || 'worker'
            const nodeInfo =
              (n.status as { nodeInfo?: Record<string, string> } | undefined)?.nodeInfo ?? {}
            const cap =
              (n.status as { capacity?: Record<string, string> } | undefined)?.capacity ?? {}
            const addrs =
              (n.status as { addresses?: Array<{ type?: string; address?: string }> } | undefined)
                ?.addresses ?? []
            const internalIp = addrs.find((a) => a.type === 'InternalIP')?.address ?? '—'
            const instance =
              labels['node.kubernetes.io/instance-type'] ||
              labels['beta.kubernetes.io/instance-type'] ||
              '—'
            return (
              <tr key={rowKey(n, i)}>
                <td className="eks-td-name">{n.metadata?.name ?? ''}</td>
                <td>
                  <Pill kind={ready ? 'ok' : 'err'}>{ready ? 'Ready' : 'NotReady'}</Pill>
                </td>
                <td>{roles}</td>
                <td className="eks-mono">{nodeInfo.kubeletVersion ?? '—'}</td>
                <td>{instance}</td>
                <td>{cap.cpu ?? '—'}</td>
                <td>{formatMem(parseMemBytes(cap.memory))}</td>
                <td className="eks-mono">{internalIp}</td>
                <td>{ageOf(n.metadata?.creationTimestamp)}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function NamespacesTable({
  items,
  filter
}: {
  items: KubeItem[]
  filter: string
}): React.JSX.Element {
  const rows = items.filter((n) => matchesFilter(n.metadata?.name ?? '', filter))
  return (
    <div className="eks-table-wrap">
      <table className="eks-table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Status</th>
            <th>Age</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((n, i) => {
            const phase = (n.status as { phase?: string } | undefined)?.phase ?? '—'
            return (
              <tr key={rowKey(n, i)}>
                <td className="eks-td-name">{n.metadata?.name ?? ''}</td>
                <td>
                  <Pill kind={phase === 'Active' ? 'ok' : 'warn'}>{phase}</Pill>
                </td>
                <td>{ageOf(n.metadata?.creationTimestamp)}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function PodsTable({ items, filter }: { items: KubeItem[]; filter: string }): React.JSX.Element {
  const rows = items.filter((p) => {
    const name = p.metadata?.name ?? ''
    const ns = p.metadata?.namespace ?? ''
    return matchesFilter(`${ns}/${name}`, filter)
  })
  return (
    <div className="eks-table-wrap">
      <table className="eks-table">
        <thead>
          <tr>
            <th>Namespace</th>
            <th>Name</th>
            <th>Ready</th>
            <th>Status</th>
            <th>Restarts</th>
            <th>Node</th>
            <th>IP</th>
            <th>Age</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((p, i) => {
            const st =
              (p.status as
                | {
                    phase?: string
                    podIP?: string
                    containerStatuses?: Array<{ ready?: boolean; restartCount?: number }>
                    reason?: string
                  }
                | undefined) ?? {}
            const cs = st.containerStatuses ?? []
            const readyCount = cs.filter((c) => c.ready).length
            const restarts = cs.reduce((a, c) => a + (c.restartCount ?? 0), 0)
            const phase = st.reason || st.phase || '—'
            const sp = (p.spec as { nodeName?: string } | undefined) ?? {}
            const accent: 'ok' | 'warn' | 'err' =
              phase === 'Running' || phase === 'Succeeded'
                ? 'ok'
                : phase === 'Pending' || phase === 'ContainerCreating'
                  ? 'warn'
                  : 'err'
            return (
              <tr key={rowKey(p, i)}>
                <td>{p.metadata?.namespace ?? ''}</td>
                <td className="eks-td-name">{p.metadata?.name ?? ''}</td>
                <td>{`${readyCount}/${cs.length}`}</td>
                <td>
                  <Pill kind={accent}>{phase}</Pill>
                </td>
                <td>{restarts}</td>
                <td className="eks-td-truncate">{sp.nodeName ?? '—'}</td>
                <td className="eks-mono">{st.podIP ?? '—'}</td>
                <td>{ageOf(p.metadata?.creationTimestamp)}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function DeploymentsTable({
  items,
  filter
}: {
  items: KubeItem[]
  filter: string
}): React.JSX.Element {
  const rows = items.filter((d) => {
    const name = d.metadata?.name ?? ''
    const ns = d.metadata?.namespace ?? ''
    return matchesFilter(`${ns}/${name}`, filter)
  })
  return (
    <div className="eks-table-wrap">
      <table className="eks-table">
        <thead>
          <tr>
            <th>Namespace</th>
            <th>Name</th>
            <th>Ready</th>
            <th>Up-to-date</th>
            <th>Available</th>
            <th>Image</th>
            <th>Age</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((d, i) => {
            const st =
              (d.status as
                | {
                    readyReplicas?: number
                    replicas?: number
                    updatedReplicas?: number
                    availableReplicas?: number
                  }
                | undefined) ?? {}
            const replicas = st.replicas ?? 0
            const ready = st.readyReplicas ?? 0
            const spec =
              (d.spec as
                | { template?: { spec?: { containers?: Array<{ image?: string }> } } }
                | undefined) ?? {}
            const images = (spec.template?.spec?.containers ?? [])
              .map((c) => c.image ?? '')
              .filter(Boolean)
              .join(', ')
            const accent: 'ok' | 'warn' | 'err' =
              ready === replicas && replicas > 0 ? 'ok' : ready === 0 ? 'err' : 'warn'
            return (
              <tr key={rowKey(d, i)}>
                <td>{d.metadata?.namespace ?? ''}</td>
                <td className="eks-td-name">{d.metadata?.name ?? ''}</td>
                <td>
                  <Pill kind={accent}>{`${ready}/${replicas}`}</Pill>
                </td>
                <td>{st.updatedReplicas ?? 0}</td>
                <td>{st.availableReplicas ?? 0}</td>
                <td className="eks-td-truncate eks-mono" title={images}>
                  {images || '—'}
                </td>
                <td>{ageOf(d.metadata?.creationTimestamp)}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function ServicesTable({
  items,
  filter
}: {
  items: KubeItem[]
  filter: string
}): React.JSX.Element {
  const rows = items.filter((s) => {
    const name = s.metadata?.name ?? ''
    const ns = s.metadata?.namespace ?? ''
    return matchesFilter(`${ns}/${name}`, filter)
  })
  return (
    <div className="eks-table-wrap">
      <table className="eks-table">
        <thead>
          <tr>
            <th>Namespace</th>
            <th>Name</th>
            <th>Type</th>
            <th>Cluster IP</th>
            <th>External</th>
            <th>Ports</th>
            <th>Age</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((s, i) => {
            const spec =
              (s.spec as
                | {
                    type?: string
                    clusterIP?: string
                    ports?: Array<{
                      port?: number
                      targetPort?: number | string
                      protocol?: string
                      nodePort?: number
                    }>
                    externalIPs?: string[]
                  }
                | undefined) ?? {}
            const status =
              (s.status as
                | { loadBalancer?: { ingress?: Array<{ hostname?: string; ip?: string }> } }
                | undefined) ?? {}
            const lbIngress = status.loadBalancer?.ingress ?? []
            const external =
              lbIngress
                .map((g) => g.hostname || g.ip || '')
                .filter(Boolean)
                .join(', ') ||
              (spec.externalIPs ?? []).join(', ') ||
              '—'
            const ports = (spec.ports ?? [])
              .map((p) => `${p.port}${p.nodePort ? `:${p.nodePort}` : ''}/${p.protocol ?? 'TCP'}`)
              .join(', ')
            return (
              <tr key={rowKey(s, i)}>
                <td>{s.metadata?.namespace ?? ''}</td>
                <td className="eks-td-name">{s.metadata?.name ?? ''}</td>
                <td>{spec.type ?? '—'}</td>
                <td className="eks-mono">{spec.clusterIP ?? '—'}</td>
                <td className="eks-td-truncate eks-mono" title={external}>
                  {external}
                </td>
                <td className="eks-td-truncate eks-mono" title={ports}>
                  {ports || '—'}
                </td>
                <td>{ageOf(s.metadata?.creationTimestamp)}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function IngressesTable({
  items,
  filter
}: {
  items: KubeItem[]
  filter: string
}): React.JSX.Element {
  const rows = items.filter((s) => {
    const name = s.metadata?.name ?? ''
    const ns = s.metadata?.namespace ?? ''
    return matchesFilter(`${ns}/${name}`, filter)
  })
  return (
    <div className="eks-table-wrap">
      <table className="eks-table">
        <thead>
          <tr>
            <th>Namespace</th>
            <th>Name</th>
            <th>Class</th>
            <th>Hosts</th>
            <th>Address</th>
            <th>Age</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((i, idx) => {
            const spec =
              (i.spec as
                | { ingressClassName?: string; rules?: Array<{ host?: string }> }
                | undefined) ?? {}
            const hosts = (spec.rules ?? []).map((r) => r.host ?? '*').join(', ') || '—'
            const status =
              (i.status as
                | { loadBalancer?: { ingress?: Array<{ hostname?: string; ip?: string }> } }
                | undefined) ?? {}
            const addr =
              (status.loadBalancer?.ingress ?? [])
                .map((g) => g.hostname || g.ip || '')
                .filter(Boolean)
                .join(', ') || '—'
            return (
              <tr key={rowKey(i, idx)}>
                <td>{i.metadata?.namespace ?? ''}</td>
                <td className="eks-td-name">{i.metadata?.name ?? ''}</td>
                <td>{spec.ingressClassName ?? '—'}</td>
                <td className="eks-td-truncate" title={hosts}>
                  {hosts}
                </td>
                <td className="eks-td-truncate eks-mono" title={addr}>
                  {addr}
                </td>
                <td>{ageOf(i.metadata?.creationTimestamp)}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function SimpleNsTable({
  items,
  filter,
  kind
}: {
  items: KubeItem[]
  filter: string
  kind: string
}): React.JSX.Element {
  const rows = items.filter((s) => {
    const name = s.metadata?.name ?? ''
    const ns = s.metadata?.namespace ?? ''
    return matchesFilter(`${ns}/${name}`, filter)
  })
  return (
    <div className="eks-table-wrap">
      <table className="eks-table">
        <thead>
          <tr>
            <th>Namespace</th>
            <th>Name</th>
            <th>Keys</th>
            <th>Age</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((s, i) => {
            const data = s.data ?? {}
            const keys = Object.keys(data).length
            return (
              <tr key={rowKey(s, i)}>
                <td>{s.metadata?.namespace ?? ''}</td>
                <td className="eks-td-name" title={kind}>
                  <Database
                    size={12}
                    strokeWidth={2}
                    style={{ verticalAlign: 'middle', marginRight: 4 }}
                  />
                  {s.metadata?.name ?? ''}
                </td>
                <td>{keys}</td>
                <td>{ageOf(s.metadata?.creationTimestamp)}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function SecretsTable({ items, filter }: { items: KubeItem[]; filter: string }): React.JSX.Element {
  const rows = items.filter((s) => {
    const name = s.metadata?.name ?? ''
    const ns = s.metadata?.namespace ?? ''
    return matchesFilter(`${ns}/${name}`, filter)
  })
  return (
    <div className="eks-table-wrap">
      <table className="eks-table">
        <thead>
          <tr>
            <th>Namespace</th>
            <th>Name</th>
            <th>Type</th>
            <th>Keys</th>
            <th>Age</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((s, i) => {
            const data = s.data ?? {}
            const keys = Object.keys(data).length
            return (
              <tr key={rowKey(s, i)}>
                <td>{s.metadata?.namespace ?? ''}</td>
                <td className="eks-td-name">
                  <KeyRound
                    size={12}
                    strokeWidth={2}
                    style={{ verticalAlign: 'middle', marginRight: 4 }}
                  />
                  {s.metadata?.name ?? ''}
                </td>
                <td className="eks-mono">{s.type ?? 'Opaque'}</td>
                <td>{keys}</td>
                <td>{ageOf(s.metadata?.creationTimestamp)}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function EventsTable({ items, filter }: { items: KubeItem[]; filter: string }): React.JSX.Element {
  const sorted = [...items].sort((a, b) => {
    const ta =
      Date.parse(
        (a as { lastTimestamp?: string }).lastTimestamp ?? a.metadata?.creationTimestamp ?? ''
      ) || 0
    const tb =
      Date.parse(
        (b as { lastTimestamp?: string }).lastTimestamp ?? b.metadata?.creationTimestamp ?? ''
      ) || 0
    return tb - ta
  })
  const rows = sorted.filter((ev) => {
    const obj = (ev as { involvedObject?: { kind?: string; name?: string } }).involvedObject
    const text = `${ev.metadata?.namespace ?? ''} ${obj?.kind ?? ''}/${obj?.name ?? ''} ${(ev as { message?: string }).message ?? ''}`
    return matchesFilter(text, filter)
  })
  return (
    <div className="eks-table-wrap">
      <table className="eks-table">
        <thead>
          <tr>
            <th>Last seen</th>
            <th>Type</th>
            <th>Reason</th>
            <th>Object</th>
            <th>Message</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((ev, i) => {
            const e = ev as {
              type?: string
              reason?: string
              message?: string
              lastTimestamp?: string
              count?: number
              involvedObject?: { kind?: string; name?: string }
            }
            const last = e.lastTimestamp ?? ev.metadata?.creationTimestamp
            const obj = e.involvedObject
            const accent: 'ok' | 'warn' | 'err' =
              e.type === 'Warning' ? 'warn' : e.type === 'Error' ? 'err' : 'ok'
            return (
              <tr key={rowKey(ev, i)}>
                <td>{ageOf(last)}</td>
                <td>
                  <Pill kind={accent}>{e.type ?? '—'}</Pill>
                </td>
                <td>{e.reason ?? '—'}</td>
                <td
                  className="eks-mono eks-td-truncate"
                  title={`${obj?.kind ?? ''}/${obj?.name ?? ''}`}
                >
                  {obj?.kind ? `${obj.kind}/` : ''}
                  {obj?.name ?? '—'}
                </td>
                <td className="eks-td-truncate" title={e.message ?? ''}>
                  {e.message ?? '—'}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function Pill({
  kind,
  children
}: {
  kind: 'ok' | 'warn' | 'err'
  children: React.ReactNode
}): React.JSX.Element {
  return <span className={`eks-pill eks-pill-${kind}`}>{children}</span>
}
