import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertCircle,
  AlertTriangle,
  RefreshCw,
  Search,
  Server,
  Terminal as TerminalIcon
} from 'lucide-react'
import { useApp, type Tab } from '../store/app'
import KubeTree from './eks/KubeTree'
import KubeDetails from './eks/KubeDetails'
import { buildNamespaceTree, buildNodeTree, findNode } from './eks/buildTree'
import { podHasError } from './eks/utils'
import type {
  EksClusterCtx,
  KubeBundle,
  KubeEnv,
  KubeItem,
  ListPayload,
  TreeNode
} from './eks/kubeTypes'

interface Props {
  tab: Tab
  visible: boolean
}

type ViewMode = 'namespace' | 'node'

interface BundleState {
  loading: boolean
  error: string | null
  data: KubeBundle | null
}

interface EventsState {
  loading: boolean
  error: string | null
  items: KubeItem[] | null
}

type BundleKey = keyof Omit<KubeBundle, 'cluster'>

const RESOURCES: Array<{
  key: BundleKey
  resource: string
  cluster: boolean
}> = [
  { key: 'nodes', resource: 'nodes', cluster: true },
  { key: 'namespaces', resource: 'namespaces', cluster: true },
  { key: 'pods', resource: 'pods', cluster: false },
  { key: 'deployments', resource: 'deployments', cluster: false },
  { key: 'replicasets', resource: 'replicasets', cluster: false },
  { key: 'services', resource: 'services', cluster: false },
  { key: 'ingresses', resource: 'ingresses', cluster: false },
  { key: 'configmaps', resource: 'configmaps', cluster: false },
  { key: 'secrets', resource: 'secrets', cluster: false },
  { key: 'storageClasses', resource: 'storageclasses', cluster: true },
  { key: 'persistentVolumes', resource: 'persistentvolumes', cluster: true },
  { key: 'persistentVolumeClaims', resource: 'persistentvolumeclaims', cluster: false },
  { key: 'resourceQuotas', resource: 'resourcequotas', cluster: false },
  { key: 'limitRanges', resource: 'limitranges', cluster: false },
  { key: 'networkPolicies', resource: 'networkpolicies', cluster: false },
  { key: 'serviceAccounts', resource: 'serviceaccounts', cluster: false }
]

// Operator StorageCluster CRDs — probed best-effort. Missing CRDs render as empty.
const STORAGE_CLUSTER_CRDS = [
  'storageclusters.ceph.rook.io',
  'storageclusters.core.libopenstorage.org'
]

// Gateway API CRDs (gateway.networking.k8s.io). Best-effort — clusters without
// the Gateway API installed will simply see empty folders.
const GATEWAY_RESOURCES: Array<{
  key: 'gatewayClasses' | 'gateways' | 'httpRoutes'
  resource: string
  cluster: boolean
}> = [
  { key: 'gatewayClasses', resource: 'gatewayclasses.gateway.networking.k8s.io', cluster: true },
  { key: 'gateways', resource: 'gateways.gateway.networking.k8s.io', cluster: false },
  { key: 'httpRoutes', resource: 'httproutes.gateway.networking.k8s.io', cluster: false }
]

export default function EksDashboard({ tab, visible }: Props): React.JSX.Element {
  const openEksTab = useApp((s) => s.openEksTab)
  const openEksK9sTab = useApp((s) => s.openEksK9sTab)
  const env: KubeEnv | null = useMemo(() => {
    if (!tab.eks || !tab.kubeconfigPath) return null
    return {
      kubeconfigPath: tab.kubeconfigPath,
      profile: tab.eks.profile,
      region: tab.eks.region
    }
  }, [tab.eks, tab.kubeconfigPath])

  const [view, setView] = useState<ViewMode>('namespace')
  const [namespace, setNamespace] = useState<string>('all')
  const [filter, setFilter] = useState('')
  const [errorsOnly, setErrorsOnly] = useState(false)
  const [bundle, setBundle] = useState<BundleState>({ loading: false, error: null, data: null })
  const [events, setEvents] = useState<EventsState>({ loading: false, error: null, items: null })
  const [selectedId, setSelectedId] = useState<string>('cluster')

  const cluster: EksClusterCtx | null = tab.eks
    ? { profile: tab.eks.profile, region: tab.eks.region, cluster: tab.eks.cluster }
    : null

  const fetchBundle = useCallback(async (): Promise<void> => {
    if (!env || !tab.eks) return
    setBundle({ loading: true, error: null, data: null })
    const nsOpts = { namespace: 'all' as const }
    try {
      const results = await Promise.all([
        window.api.aws
          .describeCluster(tab.eks.profile, tab.eks.region, tab.eks.cluster)
          .catch(() => null),
        ...RESOURCES.map((r) =>
          (
            window.api.kube.get(
              env,
              r.resource,
              r.cluster ? { cluster: true } : nsOpts
            ) as Promise<ListPayload>
          ).catch(() => ({ items: [] as KubeItem[] }))
        ),
        ...STORAGE_CLUSTER_CRDS.map((res) =>
          (
            window.api.kube.get(env, res, { cluster: true }) as Promise<ListPayload>
          ).catch(() => ({ items: [] as KubeItem[] }))
        ),
        ...GATEWAY_RESOURCES.map((r) =>
          (
            window.api.kube.get(
              env,
              r.resource,
              r.cluster ? { cluster: true } : nsOpts
            ) as Promise<ListPayload>
          ).catch(() => ({ items: [] as KubeItem[] }))
        )
      ])
      const [clusterInfo, ...rest] = results
      const lists = rest.slice(0, RESOURCES.length)
      const crdLists = rest.slice(RESOURCES.length, RESOURCES.length + STORAGE_CLUSTER_CRDS.length)
      const gatewayLists = rest.slice(RESOURCES.length + STORAGE_CLUSTER_CRDS.length)
      const data: KubeBundle = {
        cluster: (clusterInfo as Record<string, unknown> | null) ?? null,
        nodes: [],
        namespaces: [],
        pods: [],
        deployments: [],
        replicasets: [],
        services: [],
        ingresses: [],
        configmaps: [],
        secrets: [],
        storageClasses: [],
        persistentVolumes: [],
        persistentVolumeClaims: [],
        storageClusters: [],
        resourceQuotas: [],
        limitRanges: [],
        networkPolicies: [],
        serviceAccounts: [],
        gatewayClasses: [],
        gateways: [],
        httpRoutes: []
      }
      RESOURCES.forEach((r, i) => {
        const payload = lists[i] as ListPayload
        data[r.key] = payload?.items ?? []
      })
      data.storageClusters = crdLists.flatMap((p) => ((p as ListPayload)?.items ?? []) as KubeItem[])
      GATEWAY_RESOURCES.forEach((r, i) => {
        const payload = gatewayLists[i] as ListPayload
        data[r.key] = payload?.items ?? []
      })
      setBundle({ loading: false, error: null, data })
    } catch (e) {
      setBundle({ loading: false, error: (e as Error).message, data: null })
    }
  }, [env, tab.eks])

  const fetchEvents = useCallback(async (): Promise<void> => {
    if (!env) return
    setEvents({ loading: true, error: null, items: null })
    try {
      const payload = (await window.api.kube.get(env, 'events', {
        namespace: 'all'
      })) as ListPayload
      setEvents({ loading: false, error: null, items: payload.items ?? [] })
    } catch (e) {
      setEvents({ loading: false, error: (e as Error).message, items: null })
    }
  }, [env])

  useEffect(() => {
    if (!visible || !env) return
    if (!bundle.data && !bundle.loading && !bundle.error) void fetchBundle()
  }, [visible, env, bundle, fetchBundle])

  const viewBundle = useMemo<KubeBundle | null>(() => {
    if (!bundle.data) return null
    if (!errorsOnly) return bundle.data
    return { ...bundle.data, pods: bundle.data.pods.filter(podHasError) }
  }, [bundle.data, errorsOnly])

  const tree = useMemo<TreeNode | null>(() => {
    if (!viewBundle || !cluster) return null
    return view === 'namespace'
      ? buildNamespaceTree(viewBundle, cluster, { namespaceFilter: namespace, search: filter })
      : buildNodeTree(viewBundle, cluster, { namespaceFilter: namespace, search: filter })
  }, [viewBundle, cluster, view, namespace, filter])

  const selection = useMemo<TreeNode | null>(() => {
    if (!tree) return null
    return findNode(tree, selectedId) ?? tree
  }, [tree, selectedId])

  const handleRefresh = (): void => {
    void fetchBundle()
    if (events.items !== null) void fetchEvents()
  }

  const namespaceItems = bundle.data?.namespaces ?? []

  if (!env || !tab.eks || !cluster) {
    return (
      <div style={{ display: visible ? 'flex' : 'none', flex: 1 }} className="eks-empty">
        <div>EKS dashboard requires a cluster context.</div>
      </div>
    )
  }

  return (
    <div className="eks-root" style={{ display: visible ? 'flex' : 'none' }}>
      <div className="eks-tree-panel">
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
        <div className="eks-view-toggle">
          <button
            className={view === 'namespace' ? 'active' : ''}
            onClick={() => setView('namespace')}
          >
            Namespace
          </button>
          <button className={view === 'node' ? 'active' : ''} onClick={() => setView('node')}>
            Node
          </button>
        </div>
        <div className="eks-tree-scroll">
          {bundle.loading && !tree ? (
            <div className="eks-note">Loading…</div>
          ) : bundle.error ? (
            <div className="eks-error">
              <AlertCircle size={13} /> {bundle.error}
            </div>
          ) : tree ? (
            <KubeTree
              root={tree}
              selectedId={selection?.id ?? null}
              onSelect={(n) => setSelectedId(n.id)}
              defaultExpandedIds={['cluster', 'nodes', 'namespaces']}
            />
          ) : (
            <div className="eks-note">No data.</div>
          )}
        </div>
      </div>

      <div className="eks-main">
        <div className="eks-header">
          <span className="eks-header-title">{selection ? selection.name : cluster.cluster}</span>
          <select
            className="eks-ns-select"
            value={namespace}
            onChange={(e) => setNamespace(e.target.value)}
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
          <div className="eks-search">
            <Search size={12} strokeWidth={2} />
            <input
              type="text"
              placeholder="Filter tree…"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            />
          </div>
          <button
            className={`sidebar2-icon${errorsOnly ? ' active' : ''}`}
            onClick={() => setErrorsOnly((v) => !v)}
            title={errorsOnly ? 'Show all pods' : 'Show only pods with errors'}
          >
            <AlertTriangle size={13} />
          </button>
          <button
            className="sidebar2-icon"
            onClick={handleRefresh}
            title="Refresh"
            disabled={bundle.loading}
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
          <button
            className="sidebar2-icon eks-k9s-btn"
            onClick={() => {
              if (!tab.eks) return
              void openEksK9sTab({
                name: tab.eks.cluster,
                profile: tab.eks.profile,
                region: tab.eks.region
              })
            }}
            title="Open k9s terminal"
          >
            <span className="eks-k9s-label">k9s</span>
          </button>
        </div>

        <div className="eks-body">
          {bundle.loading && !bundle.data ? (
            <div className="eks-note">Loading…</div>
          ) : bundle.error ? (
            <div className="eks-error">
              <AlertCircle size={13} /> {bundle.error}
            </div>
          ) : viewBundle && selection ? (
            <KubeDetails
              selection={selection}
              bundle={viewBundle}
              cluster={cluster}
              filter={filter}
              onNavigate={(id) => setSelectedId(id)}
              eventsState={events}
              onLoadEvents={() => void fetchEvents()}
            />
          ) : (
            <div className="eks-note">Nothing selected.</div>
          )}
        </div>
      </div>
    </div>
  )
}
