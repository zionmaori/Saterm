import { useState } from 'react'
import { AlertCircle } from 'lucide-react'
import type { EksClusterCtx, KubeBundle, KubeItem, TreeNode } from './kubeTypes'
import { ageOf, formatMem, parseMemBytes, podPhase, podReadyCount } from './utils'
import {
  ConfigMapsTable,
  DeploymentsTable,
  EventsTable,
  IngressesTable,
  LimitRangesTable,
  NamespacesTable,
  NetworkPoliciesTable,
  NodesTable,
  PVCsTable,
  PersistentVolumesTable,
  Pill,
  PodsTable,
  ResourceQuotasTable,
  SecretsTable,
  ServiceAccountsTable,
  ServicesTable,
  StorageClassesTable,
  StorageClustersTable
} from './tables'

interface Props {
  selection: TreeNode
  bundle: KubeBundle
  cluster: EksClusterCtx
  filter: string
  onNavigate: (id: string) => void
  eventsState: { loading: boolean; error: string | null; items: KubeItem[] | null }
  onLoadEvents: () => void
}

export default function KubeDetails({
  selection,
  bundle,
  cluster,
  filter,
  onNavigate,
  eventsState,
  onLoadEvents
}: Props): React.JSX.Element {
  switch (selection.kind) {
    case 'cluster':
      return <OverviewView bundle={bundle} cluster={cluster} />
    case 'nodesFolder':
      return <NodesTable items={bundle.nodes} filter={filter} />
    case 'namespacesFolder':
      return <NamespacesTable items={bundle.namespaces} filter={filter} />
    case 'node':
      return selection.item ? (
        <NodeDetails
          node={selection.item}
          pods={podsForNode(bundle, selection.item)}
          onOpen={onNavigate}
        />
      ) : (
        <div className="eks-note">Missing node data.</div>
      )
    case 'namespace': {
      const ns = selection.namespace ?? selection.name
      return <NamespaceDetails ns={ns} bundle={bundle} onNavigate={onNavigate} />
    }
    case 'workloadsFolder':
    case 'deploymentsFolder': {
      const ns = selection.namespace
      const deps = ns
        ? bundle.deployments.filter((d) => d.metadata?.namespace === ns)
        : bundle.deployments
      return (
        <DeploymentsTable
          items={deps}
          filter={filter}
          onSelect={(d) => onNavigate(`ns/${d.metadata?.namespace}/dep/${d.metadata?.name}`)}
        />
      )
    }
    case 'servicesFolder': {
      const ns = selection.namespace
      const items = ns
        ? bundle.services.filter((s) => s.metadata?.namespace === ns)
        : bundle.services
      return (
        <ServicesTable
          items={items}
          filter={filter}
          onSelect={(s) => onNavigate(`ns/${s.metadata?.namespace}/svc/${s.metadata?.name}`)}
        />
      )
    }
    case 'ingressesFolder': {
      const ns = selection.namespace
      const items = ns
        ? bundle.ingresses.filter((i) => i.metadata?.namespace === ns)
        : bundle.ingresses
      return (
        <IngressesTable
          items={items}
          filter={filter}
          onSelect={(i) => onNavigate(`ns/${i.metadata?.namespace}/ing/${i.metadata?.name}`)}
        />
      )
    }
    case 'configmapsFolder': {
      const ns = selection.namespace
      const items = ns
        ? bundle.configmaps.filter((c) => c.metadata?.namespace === ns)
        : bundle.configmaps
      return (
        <ConfigMapsTable
          items={items}
          filter={filter}
          onSelect={(c) => onNavigate(`ns/${c.metadata?.namespace}/cm/${c.metadata?.name}`)}
        />
      )
    }
    case 'secretsFolder': {
      const ns = selection.namespace
      const items = ns ? bundle.secrets.filter((s) => s.metadata?.namespace === ns) : bundle.secrets
      return (
        <SecretsTable
          items={items}
          filter={filter}
          onSelect={(s) => onNavigate(`ns/${s.metadata?.namespace}/sec/${s.metadata?.name}`)}
        />
      )
    }
    case 'nodePodsFolder':
    case 'orphanPodsFolder':
    case 'unscheduledPodsFolder': {
      const podChildren = (selection.children ?? [])
        .map((c) => c.item)
        .filter((p): p is KubeItem => !!p)
      return (
        <PodsTable
          items={podChildren}
          filter={filter}
          onSelect={(p) => {
            if (selection.kind === 'nodePodsFolder') {
              const parent = selection.id.replace(/\/pods$/, '')
              onNavigate(`${parent}/pods/${p.metadata?.namespace}/${p.metadata?.name}`)
            } else if (selection.kind === 'orphanPodsFolder') {
              onNavigate(`ns/${p.metadata?.namespace}/orphanPods/${p.metadata?.name}`)
            } else {
              onNavigate(`node/__unscheduled/${p.metadata?.namespace}/${p.metadata?.name}`)
            }
          }}
        />
      )
    }
    case 'deployment':
      return selection.item ? (
        <DeploymentDetails dep={selection.item} bundle={bundle} onOpen={onNavigate} />
      ) : (
        <div className="eks-note">Missing data.</div>
      )
    case 'replicaset':
      return selection.item ? (
        <ReplicaSetDetails
          rs={selection.item}
          pods={selection.children ?? []}
          onOpen={onNavigate}
        />
      ) : (
        <div className="eks-note">Missing data.</div>
      )
    case 'pod':
      return selection.item ? (
        <PodDetails pod={selection.item} />
      ) : (
        <div className="eks-note">Missing data.</div>
      )
    case 'service':
      return selection.item ? (
        <ServiceDetails svc={selection.item} />
      ) : (
        <div className="eks-note">Missing data.</div>
      )
    case 'ingress':
      return selection.item ? (
        <IngressDetails ing={selection.item} />
      ) : (
        <div className="eks-note">Missing data.</div>
      )
    case 'configmap':
      return selection.item ? (
        <ConfigMapDetails cm={selection.item} />
      ) : (
        <div className="eks-note">Missing data.</div>
      )
    case 'secret':
      return selection.item ? (
        <SecretDetails sec={selection.item} />
      ) : (
        <div className="eks-note">Missing data.</div>
      )
    case 'storageFolder':
      return <StorageOverview bundle={bundle} onNavigate={onNavigate} />
    case 'storageClassesFolder':
      return (
        <StorageClassesTable
          items={bundle.storageClasses}
          filter={filter}
          onSelect={(s) => onNavigate(`storage/sc/${s.metadata?.name}`)}
        />
      )
    case 'pvsFolder':
      return (
        <PersistentVolumesTable
          items={bundle.persistentVolumes}
          filter={filter}
          onSelect={(v) => onNavigate(`storage/pv/${v.metadata?.name}`)}
        />
      )
    case 'storageClustersFolder':
      return (
        <StorageClustersTable
          items={bundle.storageClusters}
          filter={filter}
          onSelect={(s) => onNavigate(`storage/sccluster/${s.kind}/${s.metadata?.name}`)}
        />
      )
    case 'pvcsFolder': {
      const ns = selection.namespace
      const items = ns
        ? bundle.persistentVolumeClaims.filter((p) => p.metadata?.namespace === ns)
        : bundle.persistentVolumeClaims
      return (
        <PVCsTable
          items={items}
          filter={filter}
          onSelect={(p) => onNavigate(`ns/${p.metadata?.namespace}/pvc/${p.metadata?.name}`)}
        />
      )
    }
    case 'resourceQuotasFolder': {
      const ns = selection.namespace
      const items = ns
        ? bundle.resourceQuotas.filter((q) => q.metadata?.namespace === ns)
        : bundle.resourceQuotas
      return (
        <ResourceQuotasTable
          items={items}
          filter={filter}
          onSelect={(q) => onNavigate(`ns/${q.metadata?.namespace}/quota/${q.metadata?.name}`)}
        />
      )
    }
    case 'limitRangesFolder': {
      const ns = selection.namespace
      const items = ns
        ? bundle.limitRanges.filter((l) => l.metadata?.namespace === ns)
        : bundle.limitRanges
      return (
        <LimitRangesTable
          items={items}
          filter={filter}
          onSelect={(l) => onNavigate(`ns/${l.metadata?.namespace}/limit/${l.metadata?.name}`)}
        />
      )
    }
    case 'networkPoliciesFolder': {
      const ns = selection.namespace
      const items = ns
        ? bundle.networkPolicies.filter((n) => n.metadata?.namespace === ns)
        : bundle.networkPolicies
      return (
        <NetworkPoliciesTable
          items={items}
          filter={filter}
          onSelect={(n) => onNavigate(`ns/${n.metadata?.namespace}/netpol/${n.metadata?.name}`)}
        />
      )
    }
    case 'serviceAccountsFolder': {
      const ns = selection.namespace
      const items = ns
        ? bundle.serviceAccounts.filter((s) => s.metadata?.namespace === ns)
        : bundle.serviceAccounts
      return (
        <ServiceAccountsTable
          items={items}
          filter={filter}
          onSelect={(s) => onNavigate(`ns/${s.metadata?.namespace}/sa/${s.metadata?.name}`)}
        />
      )
    }
    case 'storageClass':
      return selection.item ? (
        <StorageClassDetails sc={selection.item} bundle={bundle} onOpen={onNavigate} />
      ) : (
        <div className="eks-note">Missing data.</div>
      )
    case 'pv':
      return selection.item ? (
        <PersistentVolumeDetails pv={selection.item} onOpen={onNavigate} />
      ) : (
        <div className="eks-note">Missing data.</div>
      )
    case 'pvc':
      return selection.item ? (
        <PersistentVolumeClaimDetails pvc={selection.item} bundle={bundle} onOpen={onNavigate} />
      ) : (
        <div className="eks-note">Missing data.</div>
      )
    case 'storageCluster':
      return selection.item ? (
        <StorageClusterDetails sc={selection.item} />
      ) : (
        <div className="eks-note">Missing data.</div>
      )
    case 'resourceQuota':
      return selection.item ? (
        <ResourceQuotaDetails q={selection.item} />
      ) : (
        <div className="eks-note">Missing data.</div>
      )
    case 'limitRange':
      return selection.item ? (
        <LimitRangeDetails lr={selection.item} />
      ) : (
        <div className="eks-note">Missing data.</div>
      )
    case 'networkPolicy':
      return selection.item ? (
        <NetworkPolicyDetails np={selection.item} />
      ) : (
        <div className="eks-note">Missing data.</div>
      )
    case 'serviceAccount':
      return selection.item ? (
        <ServiceAccountDetails sa={selection.item} />
      ) : (
        <div className="eks-note">Missing data.</div>
      )
    case 'eventsFolder':
      return <EventsPanel state={eventsState} onLoad={onLoadEvents} filter={filter} />
    default:
      return <div className="eks-note">Select a node to see details.</div>
  }
}

function podsForNode(bundle: KubeBundle, node: KubeItem): KubeItem[] {
  const name = node.metadata?.name ?? ''
  return bundle.pods.filter((p) => (p.spec as { nodeName?: string } | undefined)?.nodeName === name)
}

function DetailsHeader({
  title,
  subtitle,
  status
}: {
  title: string
  subtitle?: string
  status?: React.ReactNode
}): React.JSX.Element {
  return (
    <div className="eks-details-header">
      <div className="eks-details-title">{title}</div>
      {subtitle && <div className="eks-details-subtitle">{subtitle}</div>}
      {status && <div className="eks-details-status">{status}</div>}
    </div>
  )
}

function Section({
  label,
  children
}: {
  label: string
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <div className="eks-details-section">
      <div className="eks-details-section-label">{label}</div>
      <div className="eks-details-section-body">{children}</div>
    </div>
  )
}

function KV({ label, children }: { label: string; children: React.ReactNode }): React.JSX.Element {
  return (
    <div className="eks-kv-row">
      <div className="eks-kv-label">{label}</div>
      <div className="eks-kv-value">{children}</div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────
// Overview (cluster root)
// ─────────────────────────────────────────────────────────────────────────

function OverviewView({
  bundle,
  cluster
}: {
  bundle: KubeBundle
  cluster: EksClusterCtx
}): React.JSX.Element {
  const info = bundle.cluster
  const nodeItems = bundle.nodes

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
    totalCpu += Number.parseFloat(cap.cpu ?? '0') || 0
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
        <Card label="Namespaces" value={String(bundle.namespaces.length)} />
        <Card label="Pods" value={String(bundle.pods.length)} />
        <Card label="Deployments" value={String(bundle.deployments.length)} />
        <Card label="Services" value={String(bundle.services.length)} />
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

// ─────────────────────────────────────────────────────────────────────────
// Node
// ─────────────────────────────────────────────────────────────────────────

function NodeDetails({
  node,
  pods,
  onOpen
}: {
  node: KubeItem
  pods: KubeItem[]
  onOpen: (id: string) => void
}): React.JSX.Element {
  const status = node.status as
    | {
        conditions?: Array<{ type?: string; status?: string; reason?: string; message?: string }>
        capacity?: Record<string, string>
        allocatable?: Record<string, string>
        addresses?: Array<{ type?: string; address?: string }>
        nodeInfo?: Record<string, string>
      }
    | undefined
  const ready = status?.conditions?.find((c) => c.type === 'Ready')?.status === 'True'
  const labels = node.metadata?.labels ?? {}
  const roles =
    Object.keys(labels)
      .filter((k) => k.startsWith('node-role.kubernetes.io/'))
      .map((k) => k.replace('node-role.kubernetes.io/', ''))
      .join(', ') || 'worker'
  const instance =
    labels['node.kubernetes.io/instance-type'] || labels['beta.kubernetes.io/instance-type'] || '—'
  const zone =
    labels['topology.kubernetes.io/zone'] || labels['failure-domain.beta.kubernetes.io/zone'] || '—'
  const cap = status?.capacity ?? {}
  const alloc = status?.allocatable ?? {}
  const addrs = status?.addresses ?? []
  const internalIp = addrs.find((a) => a.type === 'InternalIP')?.address ?? '—'
  const externalIp = addrs.find((a) => a.type === 'ExternalIP')?.address
  const taints =
    (node.spec as { taints?: Array<{ key?: string; value?: string; effect?: string }> } | undefined)
      ?.taints ?? []

  return (
    <div className="eks-details">
      <DetailsHeader
        title={node.metadata?.name ?? ''}
        subtitle={`node · ${roles} · ${instance} · ${zone}`}
        status={<Pill kind={ready ? 'ok' : 'err'}>{ready ? 'Ready' : 'NotReady'}</Pill>}
      />
      <div className="eks-card-grid">
        <Card label="Kubelet" value={status?.nodeInfo?.kubeletVersion ?? '—'} />
        <Card label="OS" value={status?.nodeInfo?.osImage ?? '—'} />
        <Card label="Kernel" value={status?.nodeInfo?.kernelVersion ?? '—'} />
        <Card label="Runtime" value={status?.nodeInfo?.containerRuntimeVersion ?? '—'} />
        <Card label="CPU (capacity)" value={cap.cpu ?? '—'} />
        <Card label="Memory (capacity)" value={formatMem(parseMemBytes(cap.memory))} />
        <Card label="CPU (allocatable)" value={alloc.cpu ?? '—'} />
        <Card label="Memory (allocatable)" value={formatMem(parseMemBytes(alloc.memory))} />
        <Card label="Pods (capacity)" value={cap.pods ?? '—'} />
      </div>
      <Section label="Addresses">
        <div className="eks-kv-grid">
          <KV label="Internal IP">
            <code>{internalIp}</code>
          </KV>
          {externalIp && (
            <KV label="External IP">
              <code>{externalIp}</code>
            </KV>
          )}
          {addrs
            .filter((a) => a.type !== 'InternalIP' && a.type !== 'ExternalIP')
            .map((a, i) => (
              <KV key={i} label={a.type ?? '—'}>
                <code>{a.address ?? '—'}</code>
              </KV>
            ))}
        </div>
      </Section>
      {taints.length > 0 && (
        <Section label={`Taints (${taints.length})`}>
          <ul className="eks-plain-list">
            {taints.map((t, i) => (
              <li key={i} className="eks-mono">
                {t.key}={t.value ?? '—'}:{t.effect ?? '—'}
              </li>
            ))}
          </ul>
        </Section>
      )}
      <Section label={`Pods on this node (${pods.length})`}>
        <PodsTable
          items={pods}
          filter=""
          onSelect={(p) =>
            onOpen(`node/${node.metadata?.name}/pods/${p.metadata?.namespace}/${p.metadata?.name}`)
          }
        />
      </Section>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────
// Namespace
// ─────────────────────────────────────────────────────────────────────────

function NamespaceDetails({
  ns,
  bundle,
  onNavigate
}: {
  ns: string
  bundle: KubeBundle
  onNavigate: (id: string) => void
}): React.JSX.Element {
  const count = (arr: KubeItem[]): number => arr.filter((x) => x.metadata?.namespace === ns).length
  const nsObj = bundle.namespaces.find((n) => n.metadata?.name === ns)
  const labels = nsObj?.metadata?.labels ?? {}
  const annotations =
    (nsObj?.metadata as { annotations?: Record<string, string> } | undefined)?.annotations ?? {}
  const phase = (nsObj?.status as { phase?: string } | undefined)?.phase ?? '—'
  return (
    <div className="eks-details">
      <DetailsHeader
        title={ns}
        subtitle="namespace"
        status={<Pill kind={phase === 'Active' ? 'ok' : 'warn'}>{phase}</Pill>}
      />
      <div className="eks-card-grid">
        <button
          className="eks-card eks-card-neutral eks-card-clickable"
          onClick={() => onNavigate(`ns/${ns}/workloads`)}
        >
          <div className="eks-card-label">Deployments</div>
          <div className="eks-card-value">{count(bundle.deployments)}</div>
        </button>
        <button
          className="eks-card eks-card-neutral eks-card-clickable"
          onClick={() => onNavigate(`ns/${ns}/workloads`)}
        >
          <div className="eks-card-label">Pods</div>
          <div className="eks-card-value">{count(bundle.pods)}</div>
        </button>
        <button
          className="eks-card eks-card-neutral eks-card-clickable"
          onClick={() => onNavigate(`ns/${ns}/services`)}
        >
          <div className="eks-card-label">Services</div>
          <div className="eks-card-value">{count(bundle.services)}</div>
        </button>
        <button
          className="eks-card eks-card-neutral eks-card-clickable"
          onClick={() => onNavigate(`ns/${ns}/ingresses`)}
        >
          <div className="eks-card-label">Ingresses</div>
          <div className="eks-card-value">{count(bundle.ingresses)}</div>
        </button>
        <button
          className="eks-card eks-card-neutral eks-card-clickable"
          onClick={() => onNavigate(`ns/${ns}/configmaps`)}
        >
          <div className="eks-card-label">ConfigMaps</div>
          <div className="eks-card-value">{count(bundle.configmaps)}</div>
        </button>
        <button
          className="eks-card eks-card-neutral eks-card-clickable"
          onClick={() => onNavigate(`ns/${ns}/secrets`)}
        >
          <div className="eks-card-label">Secrets</div>
          <div className="eks-card-value">{count(bundle.secrets)}</div>
        </button>
        <button
          className="eks-card eks-card-neutral eks-card-clickable"
          onClick={() => onNavigate(`ns/${ns}/pvcs`)}
        >
          <div className="eks-card-label">PVCs</div>
          <div className="eks-card-value">{count(bundle.persistentVolumeClaims)}</div>
        </button>
        <button
          className="eks-card eks-card-neutral eks-card-clickable"
          onClick={() => onNavigate(`ns/${ns}/quotas`)}
        >
          <div className="eks-card-label">Resource quotas</div>
          <div className="eks-card-value">{count(bundle.resourceQuotas)}</div>
        </button>
        <button
          className="eks-card eks-card-neutral eks-card-clickable"
          onClick={() => onNavigate(`ns/${ns}/limits`)}
        >
          <div className="eks-card-label">Limit ranges</div>
          <div className="eks-card-value">{count(bundle.limitRanges)}</div>
        </button>
        <button
          className="eks-card eks-card-neutral eks-card-clickable"
          onClick={() => onNavigate(`ns/${ns}/netpols`)}
        >
          <div className="eks-card-label">Network policies</div>
          <div className="eks-card-value">{count(bundle.networkPolicies)}</div>
        </button>
        <button
          className="eks-card eks-card-neutral eks-card-clickable"
          onClick={() => onNavigate(`ns/${ns}/sas`)}
        >
          <div className="eks-card-label">Service accounts</div>
          <div className="eks-card-value">{count(bundle.serviceAccounts)}</div>
        </button>
      </div>
      {Object.keys(labels).length > 0 && (
        <Section label={`Labels (${Object.keys(labels).length})`}>
          <div className="eks-chips">
            {Object.entries(labels).map(([k, v]) => (
              <span key={k} className="eks-chip">
                {k}={v}
              </span>
            ))}
          </div>
        </Section>
      )}
      {Object.keys(annotations).length > 0 && (
        <Section label={`Annotations (${Object.keys(annotations).length})`}>
          <div className="eks-chips">
            {Object.entries(annotations).map(([k, v]) => (
              <span key={k} className="eks-chip" title={v}>
                {k}={v.length > 60 ? `${v.slice(0, 60)}…` : v}
              </span>
            ))}
          </div>
        </Section>
      )}
      <Section label="Created">
        <div className="eks-mono">
          {nsObj?.metadata?.creationTimestamp
            ? `${nsObj.metadata.creationTimestamp} · ${ageOf(nsObj.metadata.creationTimestamp)} ago`
            : '—'}
        </div>
      </Section>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────
// Deployment
// ─────────────────────────────────────────────────────────────────────────

function DeploymentDetails({
  dep,
  bundle,
  onOpen
}: {
  dep: KubeItem
  bundle: KubeBundle
  onOpen: (id: string) => void
}): React.JSX.Element {
  const st =
    (dep.status as
      | {
          readyReplicas?: number
          replicas?: number
          updatedReplicas?: number
          availableReplicas?: number
        }
      | undefined) ?? {}
  const spec =
    (dep.spec as
      | {
          replicas?: number
          strategy?: { type?: string; rollingUpdate?: Record<string, unknown> }
          selector?: { matchLabels?: Record<string, string> }
          template?: {
            spec?: { containers?: Array<{ name?: string; image?: string; ports?: unknown[] }> }
          }
        }
      | undefined) ?? {}
  const replicas = st.replicas ?? spec.replicas ?? 0
  const ready = st.readyReplicas ?? 0
  const accent: 'ok' | 'warn' | 'err' =
    ready === replicas && replicas > 0 ? 'ok' : ready === 0 ? 'err' : 'warn'
  const containers = spec.template?.spec?.containers ?? []
  const selector = spec.selector?.matchLabels ?? {}

  const dUid = dep.metadata?.uid ?? ''
  const ownedRs = bundle.replicasets.filter((rs) =>
    (rs.metadata?.ownerReferences ?? []).some((r) => r?.uid === dUid)
  )
  const ownedPods: KubeItem[] = []
  for (const rs of ownedRs) {
    for (const p of bundle.pods) {
      if ((p.metadata?.ownerReferences ?? []).some((r) => r?.uid === rs.metadata?.uid)) {
        ownedPods.push(p)
      }
    }
  }

  return (
    <div className="eks-details">
      <DetailsHeader
        title={dep.metadata?.name ?? ''}
        subtitle={`deployment · ${dep.metadata?.namespace ?? ''}`}
        status={<Pill kind={accent}>{`${ready}/${replicas}`}</Pill>}
      />
      <div className="eks-card-grid">
        <Card label="Replicas" value={String(replicas)} />
        <Card label="Ready" value={String(ready)} />
        <Card label="Updated" value={String(st.updatedReplicas ?? 0)} />
        <Card label="Available" value={String(st.availableReplicas ?? 0)} />
        <Card label="Strategy" value={spec.strategy?.type ?? '—'} />
        <Card label="Age" value={ageOf(dep.metadata?.creationTimestamp)} />
      </div>
      <Section label="Containers">
        <div className="eks-kv-grid">
          {containers.map((c, i) => (
            <KV key={i} label={c.name ?? `#${i}`}>
              <code>{c.image ?? '—'}</code>
            </KV>
          ))}
          {!containers.length && <div className="eks-note">No containers.</div>}
        </div>
      </Section>
      {Object.keys(selector).length > 0 && (
        <Section label="Selector">
          <div className="eks-chips">
            {Object.entries(selector).map(([k, v]) => (
              <span key={k} className="eks-chip">
                {k}={v}
              </span>
            ))}
          </div>
        </Section>
      )}
      <Section label={`ReplicaSets (${ownedRs.length})`}>
        <ul className="eks-plain-list">
          {ownedRs.map((rs) => {
            const rsSt =
              (rs.status as { readyReplicas?: number; replicas?: number } | undefined) ?? {}
            const line = `${rs.metadata?.name ?? ''} — ${rsSt.readyReplicas ?? 0}/${rsSt.replicas ?? 0}`
            return (
              <li key={rs.metadata?.uid ?? rs.metadata?.name}>
                <button
                  className="eks-linklike"
                  onClick={() =>
                    onOpen(
                      `ns/${dep.metadata?.namespace}/dep/${dep.metadata?.name}/rs/${rs.metadata?.name}`
                    )
                  }
                >
                  {line}
                </button>
              </li>
            )
          })}
        </ul>
      </Section>
      <Section label={`Pods (${ownedPods.length})`}>
        <PodsTable
          items={ownedPods}
          filter=""
          onSelect={(p) =>
            onOpen(
              `ns/${dep.metadata?.namespace}/dep/${dep.metadata?.name}/rs/${
                (p.metadata?.ownerReferences ?? []).find((r) => r?.controller)?.name ??
                (p.metadata?.ownerReferences ?? [])[0]?.name ??
                ''
              }/pod/${p.metadata?.name}`
            )
          }
        />
      </Section>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────
// ReplicaSet
// ─────────────────────────────────────────────────────────────────────────

function ReplicaSetDetails({
  rs,
  pods,
  onOpen
}: {
  rs: KubeItem
  pods: TreeNode[]
  onOpen: (id: string) => void
}): React.JSX.Element {
  const st = (rs.status as { readyReplicas?: number; replicas?: number } | undefined) ?? {}
  const spec =
    (rs.spec as
      | {
          replicas?: number
          template?: {
            spec?: { containers?: Array<{ name?: string; image?: string }> }
          }
        }
      | undefined) ?? {}
  const ready = st.readyReplicas ?? 0
  const total = st.replicas ?? spec.replicas ?? 0
  const containers = spec.template?.spec?.containers ?? []
  const podItems: KubeItem[] = pods.map((p) => p.item).filter((x): x is KubeItem => !!x)
  return (
    <div className="eks-details">
      <DetailsHeader
        title={rs.metadata?.name ?? ''}
        subtitle={`replicaset · ${rs.metadata?.namespace ?? ''}`}
        status={
          <Pill kind={total === 0 ? 'warn' : ready === total ? 'ok' : 'err'}>
            {`${ready}/${total}`}
          </Pill>
        }
      />
      <Section label="Containers">
        <div className="eks-kv-grid">
          {containers.map((c, i) => (
            <KV key={i} label={c.name ?? `#${i}`}>
              <code>{c.image ?? '—'}</code>
            </KV>
          ))}
          {!containers.length && <div className="eks-note">No containers.</div>}
        </div>
      </Section>
      <Section label={`Pods (${podItems.length})`}>
        <PodsTable
          items={podItems}
          filter=""
          onSelect={(p) =>
            onOpen(
              `ns/${rs.metadata?.namespace}/dep/${
                (rs.metadata?.ownerReferences ?? []).find((r) => r?.controller)?.name ??
                (rs.metadata?.ownerReferences ?? [])[0]?.name ??
                ''
              }/rs/${rs.metadata?.name}/pod/${p.metadata?.name}`
            )
          }
        />
      </Section>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────
// Pod
// ─────────────────────────────────────────────────────────────────────────

function PodDetails({ pod }: { pod: KubeItem }): React.JSX.Element {
  const status =
    (pod.status as
      | {
          phase?: string
          reason?: string
          podIP?: string
          hostIP?: string
          startTime?: string
          containerStatuses?: Array<{
            name?: string
            ready?: boolean
            restartCount?: number
            image?: string
            imageID?: string
            state?: Record<string, { reason?: string; message?: string; exitCode?: number }>
          }>
          initContainerStatuses?: Array<{
            name?: string
            ready?: boolean
            restartCount?: number
          }>
          conditions?: Array<{ type?: string; status?: string }>
        }
      | undefined) ?? {}
  const spec =
    (pod.spec as
      | {
          nodeName?: string
          serviceAccountName?: string
          containers?: Array<{ name?: string; image?: string; ports?: unknown[] }>
          initContainers?: Array<{ name?: string; image?: string }>
          volumes?: Array<{ name?: string }>
          restartPolicy?: string
        }
      | undefined) ?? {}

  const phase = podPhase(pod)
  const rc = podReadyCount(pod)
  const accent: 'ok' | 'warn' | 'err' =
    phase === 'Running' || phase === 'Succeeded'
      ? 'ok'
      : phase === 'Pending' || phase === 'ContainerCreating'
        ? 'warn'
        : 'err'
  const cs = status.containerStatuses ?? []

  return (
    <div className="eks-details">
      <DetailsHeader
        title={pod.metadata?.name ?? ''}
        subtitle={`pod · ${pod.metadata?.namespace ?? ''}`}
        status={<Pill kind={accent}>{phase}</Pill>}
      />
      <div className="eks-card-grid">
        <Card label="Ready" value={`${rc.ready}/${rc.total}`} />
        <Card label="Restarts" value={String(rc.restarts)} />
        <Card label="Node" value={spec.nodeName ?? '—'} />
        <Card label="Pod IP" value={status.podIP ?? '—'} />
        <Card label="Host IP" value={status.hostIP ?? '—'} />
        <Card label="Age" value={ageOf(pod.metadata?.creationTimestamp)} />
        <Card label="Service account" value={spec.serviceAccountName ?? '—'} />
        <Card label="Restart policy" value={spec.restartPolicy ?? '—'} />
      </div>
      <Section label={`Containers (${(spec.containers ?? []).length})`}>
        <div className="eks-container-list">
          {(spec.containers ?? []).map((c, i) => {
            const cState = cs.find((s) => s.name === c.name)
            const state = cState?.state ?? {}
            const stateName = Object.keys(state)[0] ?? 'unknown'
            const stateInfo = state[stateName] ?? {}
            const isReady = !!cState?.ready
            return (
              <div key={i} className="eks-container-card">
                <div className="eks-container-head">
                  <span className="eks-container-name">{c.name ?? '—'}</span>
                  <Pill kind={isReady ? 'ok' : 'warn'}>{isReady ? 'ready' : 'not ready'}</Pill>
                  <span className="eks-container-state">{stateName}</span>
                </div>
                <div className="eks-kv-grid">
                  <KV label="Image">
                    <code>{c.image ?? '—'}</code>
                  </KV>
                  <KV label="Restarts">{cState?.restartCount ?? 0}</KV>
                  {stateInfo?.reason && <KV label="Reason">{stateInfo.reason}</KV>}
                  {stateInfo?.message && <KV label="Message">{stateInfo.message}</KV>}
                  {typeof stateInfo?.exitCode === 'number' && (
                    <KV label="Exit code">{stateInfo.exitCode}</KV>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </Section>
      {(spec.initContainers ?? []).length > 0 && (
        <Section label={`Init containers (${(spec.initContainers ?? []).length})`}>
          <div className="eks-kv-grid">
            {(spec.initContainers ?? []).map((c, i) => (
              <KV key={i} label={c.name ?? `#${i}`}>
                <code>{c.image ?? '—'}</code>
              </KV>
            ))}
          </div>
        </Section>
      )}
      {(status.conditions ?? []).length > 0 && (
        <Section label="Conditions">
          <div className="eks-kv-grid">
            {(status.conditions ?? []).map((c, i) => (
              <KV key={i} label={c.type ?? '—'}>
                {c.status ?? '—'}
              </KV>
            ))}
          </div>
        </Section>
      )}
      {(spec.volumes ?? []).length > 0 && (
        <Section label={`Volumes (${(spec.volumes ?? []).length})`}>
          <ul className="eks-plain-list">
            {(spec.volumes ?? []).map((v, i) => (
              <li key={i} className="eks-mono">
                {v.name ?? '—'}
              </li>
            ))}
          </ul>
        </Section>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────
// Service
// ─────────────────────────────────────────────────────────────────────────

function ServiceDetails({ svc }: { svc: KubeItem }): React.JSX.Element {
  const spec =
    (svc.spec as
      | {
          type?: string
          clusterIP?: string
          selector?: Record<string, string>
          ports?: Array<{
            port?: number
            targetPort?: number | string
            protocol?: string
            nodePort?: number
            name?: string
          }>
          externalIPs?: string[]
        }
      | undefined) ?? {}
  const status =
    (svc.status as
      | { loadBalancer?: { ingress?: Array<{ hostname?: string; ip?: string }> } }
      | undefined) ?? {}
  const lb = status.loadBalancer?.ingress ?? []
  const external =
    lb
      .map((g) => g.hostname || g.ip || '')
      .filter(Boolean)
      .join(', ') ||
    (spec.externalIPs ?? []).join(', ') ||
    '—'
  const ports = spec.ports ?? []
  const selector = spec.selector ?? {}
  return (
    <div className="eks-details">
      <DetailsHeader
        title={svc.metadata?.name ?? ''}
        subtitle={`service · ${svc.metadata?.namespace ?? ''}`}
      />
      <div className="eks-card-grid">
        <Card label="Type" value={spec.type ?? '—'} />
        <Card label="Cluster IP" value={spec.clusterIP ?? '—'} />
        <Card label="External" value={external} />
        <Card label="Age" value={ageOf(svc.metadata?.creationTimestamp)} />
      </div>
      <Section label={`Ports (${ports.length})`}>
        <table className="eks-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Port</th>
              <th>Target</th>
              <th>Node port</th>
              <th>Protocol</th>
            </tr>
          </thead>
          <tbody>
            {ports.map((p, i) => (
              <tr key={i}>
                <td>{p.name ?? '—'}</td>
                <td>{p.port ?? '—'}</td>
                <td>{String(p.targetPort ?? '—')}</td>
                <td>{p.nodePort ?? '—'}</td>
                <td>{p.protocol ?? 'TCP'}</td>
              </tr>
            ))}
            {!ports.length && (
              <tr>
                <td colSpan={5} className="eks-note">
                  No ports.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Section>
      {Object.keys(selector).length > 0 && (
        <Section label="Selector">
          <div className="eks-chips">
            {Object.entries(selector).map(([k, v]) => (
              <span key={k} className="eks-chip">
                {k}={v}
              </span>
            ))}
          </div>
        </Section>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────
// Ingress
// ─────────────────────────────────────────────────────────────────────────

function IngressDetails({ ing }: { ing: KubeItem }): React.JSX.Element {
  const spec =
    (ing.spec as
      | {
          ingressClassName?: string
          rules?: Array<{
            host?: string
            http?: {
              paths?: Array<{
                path?: string
                pathType?: string
                backend?: {
                  service?: { name?: string; port?: { number?: number; name?: string } }
                }
              }>
            }
          }>
        }
      | undefined) ?? {}
  const status =
    (ing.status as
      | { loadBalancer?: { ingress?: Array<{ hostname?: string; ip?: string }> } }
      | undefined) ?? {}
  const addr =
    (status.loadBalancer?.ingress ?? [])
      .map((g) => g.hostname || g.ip || '')
      .filter(Boolean)
      .join(', ') || '—'
  const rules = spec.rules ?? []
  return (
    <div className="eks-details">
      <DetailsHeader
        title={ing.metadata?.name ?? ''}
        subtitle={`ingress · ${ing.metadata?.namespace ?? ''}`}
      />
      <div className="eks-card-grid">
        <Card label="Class" value={spec.ingressClassName ?? '—'} />
        <Card label="Address" value={addr} />
        <Card label="Age" value={ageOf(ing.metadata?.creationTimestamp)} />
      </div>
      <Section label={`Rules (${rules.length})`}>
        <table className="eks-table">
          <thead>
            <tr>
              <th>Host</th>
              <th>Path</th>
              <th>Type</th>
              <th>Backend</th>
            </tr>
          </thead>
          <tbody>
            {rules.flatMap((r, i) => {
              const paths = r.http?.paths ?? []
              if (!paths.length) {
                return [
                  <tr key={`${i}-0`}>
                    <td>{r.host ?? '*'}</td>
                    <td colSpan={3} className="eks-note">
                      No paths.
                    </td>
                  </tr>
                ]
              }
              return paths.map((p, j) => {
                const b = p.backend?.service
                const port = b?.port?.number ?? b?.port?.name ?? '—'
                return (
                  <tr key={`${i}-${j}`}>
                    <td>{r.host ?? '*'}</td>
                    <td className="eks-mono">{p.path ?? '/'}</td>
                    <td>{p.pathType ?? '—'}</td>
                    <td className="eks-mono">
                      {b?.name ?? '—'}:{port}
                    </td>
                  </tr>
                )
              })
            })}
          </tbody>
        </table>
      </Section>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────
// ConfigMap
// ─────────────────────────────────────────────────────────────────────────

function ConfigMapDetails({ cm }: { cm: KubeItem }): React.JSX.Element {
  const data = (cm.data ?? {}) as Record<string, string>
  const keys = Object.keys(data).sort()
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const toggle = (k: string): void =>
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(k)) next.delete(k)
      else next.add(k)
      return next
    })
  return (
    <div className="eks-details">
      <DetailsHeader
        title={cm.metadata?.name ?? ''}
        subtitle={`configmap · ${cm.metadata?.namespace ?? ''}`}
      />
      <div className="eks-card-grid">
        <Card label="Keys" value={String(keys.length)} />
        <Card label="Age" value={ageOf(cm.metadata?.creationTimestamp)} />
      </div>
      <Section label={`Data (${keys.length})`}>
        {!keys.length && <div className="eks-note">No keys.</div>}
        {keys.map((k) => {
          const value = data[k] ?? ''
          const isOpen = expanded.has(k)
          return (
            <div key={k} className="eks-cm-entry">
              <button className="eks-cm-key" onClick={() => toggle(k)}>
                <span>{isOpen ? '▼' : '▶'}</span>
                <span className="eks-mono">{k}</span>
                <span className="eks-cm-size">{value.length} chars</span>
              </button>
              {isOpen && <pre className="eks-cm-value">{value}</pre>}
            </div>
          )
        })}
      </Section>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────
// Secret
// ─────────────────────────────────────────────────────────────────────────

function SecretDetails({ sec }: { sec: KubeItem }): React.JSX.Element {
  const data = (sec.data ?? {}) as Record<string, string>
  const keys = Object.keys(data).sort()
  return (
    <div className="eks-details">
      <DetailsHeader
        title={sec.metadata?.name ?? ''}
        subtitle={`secret · ${sec.metadata?.namespace ?? ''}`}
      />
      <div className="eks-card-grid">
        <Card label="Type" value={sec.type ?? 'Opaque'} />
        <Card label="Keys" value={String(keys.length)} />
        <Card label="Age" value={ageOf(sec.metadata?.creationTimestamp)} />
      </div>
      <Section label={`Keys (${keys.length})`}>
        {!keys.length && <div className="eks-note">No keys.</div>}
        <table className="eks-table">
          <thead>
            <tr>
              <th>Key</th>
              <th>Size (bytes)</th>
            </tr>
          </thead>
          <tbody>
            {keys.map((k) => {
              const v = data[k] ?? ''
              // k8s secret values are base64; decoded size ≈ (len * 3/4)
              const decodedSize = Math.floor((v.length * 3) / 4)
              return (
                <tr key={k}>
                  <td className="eks-mono">{k}</td>
                  <td>{decodedSize}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </Section>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────
// Events (lazy)
// ─────────────────────────────────────────────────────────────────────────

function EventsPanel({
  state,
  onLoad,
  filter
}: {
  state: { loading: boolean; error: string | null; items: KubeItem[] | null }
  onLoad: () => void
  filter: string
}): React.JSX.Element {
  if (state.loading && !state.items) return <div className="eks-note">Loading events…</div>
  if (state.error)
    return (
      <div className="eks-error">
        <AlertCircle size={13} /> {state.error}
      </div>
    )
  if (!state.items) {
    return (
      <div className="eks-details">
        <DetailsHeader title="events" subtitle="cluster events across all namespaces" />
        <button className="eks-btn" onClick={onLoad}>
          Load events
        </button>
      </div>
    )
  }
  return <EventsTable items={state.items} filter={filter} />
}

// ─────────────────────────────────────────────────────────────────────────
// Storage overview
// ─────────────────────────────────────────────────────────────────────────

function StorageOverview({
  bundle,
  onNavigate
}: {
  bundle: KubeBundle
  onNavigate: (id: string) => void
}): React.JSX.Element {
  const totalPvCapacity = bundle.persistentVolumes.reduce((acc, v) => {
    const spec = (v.spec as { capacity?: { storage?: string } } | undefined) ?? {}
    return acc + parseMemBytes(spec.capacity?.storage)
  }, 0)
  const boundPvs = bundle.persistentVolumes.filter(
    (v) => (v.status as { phase?: string } | undefined)?.phase === 'Bound'
  ).length
  return (
    <div className="eks-details">
      <DetailsHeader title="storage" subtitle="cluster-scoped storage resources" />
      <div className="eks-card-grid">
        <button
          className="eks-card eks-card-neutral eks-card-clickable"
          onClick={() => onNavigate('storage/storageclasses')}
        >
          <div className="eks-card-label">Storage classes</div>
          <div className="eks-card-value">{bundle.storageClasses.length}</div>
        </button>
        <button
          className="eks-card eks-card-neutral eks-card-clickable"
          onClick={() => onNavigate('storage/pvs')}
        >
          <div className="eks-card-label">PVs</div>
          <div className="eks-card-value">
            {boundPvs}/{bundle.persistentVolumes.length}
          </div>
        </button>
        <Card label="Total capacity" value={formatMem(totalPvCapacity)} />
        {bundle.storageClusters.length > 0 && (
          <button
            className="eks-card eks-card-neutral eks-card-clickable"
            onClick={() => onNavigate('storage/storageclusters')}
          >
            <div className="eks-card-label">Storage clusters</div>
            <div className="eks-card-value">{bundle.storageClusters.length}</div>
          </button>
        )}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────
// StorageClass
// ─────────────────────────────────────────────────────────────────────────

function StorageClassDetails({
  sc,
  bundle,
  onOpen
}: {
  sc: KubeItem
  bundle: KubeBundle
  onOpen: (id: string) => void
}): React.JSX.Element {
  const scAny = sc as unknown as {
    provisioner?: string
    reclaimPolicy?: string
    volumeBindingMode?: string
    allowVolumeExpansion?: boolean
    parameters?: Record<string, string>
    mountOptions?: string[]
  }
  const name = sc.metadata?.name ?? ''
  const isDefault =
    sc.metadata?.labels?.['storageclass.kubernetes.io/is-default-class'] === 'true' ||
    (sc.metadata as { annotations?: Record<string, string> } | undefined)?.annotations?.[
      'storageclass.kubernetes.io/is-default-class'
    ] === 'true'
  const params = scAny.parameters ?? {}
  const pvsUsing = bundle.persistentVolumes.filter(
    (v) => (v.spec as { storageClassName?: string } | undefined)?.storageClassName === name
  )
  return (
    <div className="eks-details">
      <DetailsHeader
        title={name}
        subtitle="storage class"
        status={isDefault ? <Pill kind="ok">default</Pill> : undefined}
      />
      <div className="eks-kv-grid">
        <KV label="Provisioner">
          <code>{scAny.provisioner ?? '—'}</code>
        </KV>
        <KV label="Reclaim policy">{scAny.reclaimPolicy ?? '—'}</KV>
        <KV label="Volume binding mode">{scAny.volumeBindingMode ?? '—'}</KV>
        <KV label="Allow volume expansion">{scAny.allowVolumeExpansion ? 'yes' : 'no'}</KV>
        <KV label="Age">{ageOf(sc.metadata?.creationTimestamp)}</KV>
      </div>
      {Object.keys(params).length > 0 && (
        <Section label={`Parameters (${Object.keys(params).length})`}>
          <div className="eks-chips">
            {Object.entries(params).map(([k, v]) => (
              <span key={k} className="eks-chip">
                {k}={v}
              </span>
            ))}
          </div>
        </Section>
      )}
      {(scAny.mountOptions?.length ?? 0) > 0 && (
        <Section label="Mount options">
          <ul className="eks-plain-list">
            {(scAny.mountOptions ?? []).map((m, i) => (
              <li key={i} className="eks-mono">
                {m}
              </li>
            ))}
          </ul>
        </Section>
      )}
      <Section label={`PVs using this class (${pvsUsing.length})`}>
        {!pvsUsing.length && <div className="eks-note">None.</div>}
        <ul className="eks-plain-list">
          {pvsUsing.map((v) => (
            <li key={v.metadata?.uid ?? v.metadata?.name}>
              <button
                className="eks-linklike"
                onClick={() => onOpen(`storage/pv/${v.metadata?.name}`)}
              >
                {v.metadata?.name}
              </button>
            </li>
          ))}
        </ul>
      </Section>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────
// PersistentVolume
// ─────────────────────────────────────────────────────────────────────────

function PersistentVolumeDetails({
  pv,
  onOpen
}: {
  pv: KubeItem
  onOpen: (id: string) => void
}): React.JSX.Element {
  const spec =
    (pv.spec as
      | {
          capacity?: { storage?: string }
          accessModes?: string[]
          persistentVolumeReclaimPolicy?: string
          storageClassName?: string
          claimRef?: { namespace?: string; name?: string; kind?: string }
          volumeMode?: string
          csi?: { driver?: string; volumeHandle?: string }
          nfs?: { server?: string; path?: string }
          hostPath?: { path?: string }
          awsElasticBlockStore?: { volumeID?: string }
        }
      | undefined) ?? {}
  const status =
    (pv.status as { phase?: string; reason?: string; message?: string } | undefined) ?? {}
  const phase = status.phase ?? '—'
  const accent: 'ok' | 'warn' | 'err' =
    phase === 'Bound' ? 'ok' : phase === 'Available' ? 'warn' : 'err'
  const source = spec.csi
    ? `csi/${spec.csi.driver ?? ''} · ${spec.csi.volumeHandle ?? ''}`
    : spec.nfs
      ? `nfs/${spec.nfs.server}:${spec.nfs.path}`
      : spec.awsElasticBlockStore
        ? `ebs/${spec.awsElasticBlockStore.volumeID}`
        : spec.hostPath
          ? `hostPath/${spec.hostPath.path}`
          : '—'
  return (
    <div className="eks-details">
      <DetailsHeader
        title={pv.metadata?.name ?? ''}
        subtitle="persistent volume"
        status={<Pill kind={accent}>{phase}</Pill>}
      />
      <div className="eks-kv-grid">
        <KV label="Capacity">{spec.capacity?.storage ?? '—'}</KV>
        <KV label="Access modes">
          <code>{(spec.accessModes ?? []).join(',') || '—'}</code>
        </KV>
        <KV label="Reclaim policy">{spec.persistentVolumeReclaimPolicy ?? '—'}</KV>
        <KV label="Storage class">{spec.storageClassName ?? '—'}</KV>
        <KV label="Volume mode">{spec.volumeMode ?? '—'}</KV>
        <KV label="Source">
          <code>{source}</code>
        </KV>
        <KV label="Age">{ageOf(pv.metadata?.creationTimestamp)}</KV>
      </div>
      {spec.claimRef && (
        <Section label="Claim">
          <button
            className="eks-linklike"
            onClick={() =>
              spec.claimRef?.namespace && spec.claimRef?.name
                ? onOpen(`ns/${spec.claimRef.namespace}/pvc/${spec.claimRef.name}`)
                : undefined
            }
          >
            {spec.claimRef.namespace}/{spec.claimRef.name}
          </button>
        </Section>
      )}
      {status.message && (
        <Section label="Message">
          <div className="eks-mono">{status.message}</div>
        </Section>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────
// PersistentVolumeClaim
// ─────────────────────────────────────────────────────────────────────────

function PersistentVolumeClaimDetails({
  pvc,
  bundle,
  onOpen
}: {
  pvc: KubeItem
  bundle: KubeBundle
  onOpen: (id: string) => void
}): React.JSX.Element {
  const spec =
    (pvc.spec as
      | {
          volumeName?: string
          storageClassName?: string
          accessModes?: string[]
          resources?: { requests?: { storage?: string } }
          volumeMode?: string
        }
      | undefined) ?? {}
  const status =
    (pvc.status as { phase?: string; capacity?: { storage?: string } } | undefined) ?? {}
  const phase = status.phase ?? '—'
  const accent: 'ok' | 'warn' | 'err' =
    phase === 'Bound' ? 'ok' : phase === 'Pending' ? 'warn' : 'err'
  const name = pvc.metadata?.name ?? ''
  const ns = pvc.metadata?.namespace ?? ''
  const mountedBy = bundle.pods.filter((p) => {
    if (p.metadata?.namespace !== ns) return false
    const volumes =
      (
        p.spec as
          | { volumes?: Array<{ persistentVolumeClaim?: { claimName?: string } }> }
          | undefined
      )?.volumes ?? []
    return volumes.some((v) => v.persistentVolumeClaim?.claimName === name)
  })
  return (
    <div className="eks-details">
      <DetailsHeader
        title={name}
        subtitle={`persistent volume claim · ${ns}`}
        status={<Pill kind={accent}>{phase}</Pill>}
      />
      <div className="eks-kv-grid">
        <KV label="Volume">
          {spec.volumeName ? (
            <button
              className="eks-linklike"
              onClick={() => onOpen(`storage/pv/${spec.volumeName}`)}
            >
              {spec.volumeName}
            </button>
          ) : (
            '—'
          )}
        </KV>
        <KV label="Storage class">{spec.storageClassName ?? '—'}</KV>
        <KV label="Capacity">
          {status.capacity?.storage ?? spec.resources?.requests?.storage ?? '—'}
        </KV>
        <KV label="Access modes">
          <code>{(spec.accessModes ?? []).join(',') || '—'}</code>
        </KV>
        <KV label="Volume mode">{spec.volumeMode ?? '—'}</KV>
        <KV label="Age">{ageOf(pvc.metadata?.creationTimestamp)}</KV>
      </div>
      <Section label={`Mounted by pods (${mountedBy.length})`}>
        {!mountedBy.length && <div className="eks-note">Not mounted.</div>}
        <ul className="eks-plain-list">
          {mountedBy.map((p) => (
            <li key={p.metadata?.uid ?? p.metadata?.name} className="eks-mono">
              {p.metadata?.name}
            </li>
          ))}
        </ul>
      </Section>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────
// StorageCluster (operator CR — raw dump)
// ─────────────────────────────────────────────────────────────────────────

function StorageClusterDetails({ sc }: { sc: KubeItem }): React.JSX.Element {
  const status = (sc.status ?? {}) as Record<string, unknown>
  const spec = (sc.spec ?? {}) as Record<string, unknown>
  return (
    <div className="eks-details">
      <DetailsHeader
        title={sc.metadata?.name ?? ''}
        subtitle={`${sc.kind ?? 'StorageCluster'}${sc.metadata?.namespace ? ` · ${sc.metadata.namespace}` : ''}`}
      />
      <div className="eks-kv-grid">
        <KV label="API version">
          <code>{sc.apiVersion ?? '—'}</code>
        </KV>
        <KV label="Kind">{sc.kind ?? '—'}</KV>
        <KV label="Age">{ageOf(sc.metadata?.creationTimestamp)}</KV>
      </div>
      <Section label="Spec">
        <pre className="eks-cm-value">{JSON.stringify(spec, null, 2)}</pre>
      </Section>
      <Section label="Status">
        <pre className="eks-cm-value">{JSON.stringify(status, null, 2)}</pre>
      </Section>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────
// ResourceQuota
// ─────────────────────────────────────────────────────────────────────────

function ResourceQuotaDetails({ q }: { q: KubeItem }): React.JSX.Element {
  const spec = (q.spec as { hard?: Record<string, string>; scopes?: string[] } | undefined) ?? {}
  const status =
    (q.status as { hard?: Record<string, string>; used?: Record<string, string> } | undefined) ?? {}
  const hard = status.hard ?? spec.hard ?? {}
  const used = status.used ?? {}
  const keys = Object.keys(hard).sort()
  return (
    <div className="eks-details">
      <DetailsHeader
        title={q.metadata?.name ?? ''}
        subtitle={`resource quota · ${q.metadata?.namespace ?? ''}`}
      />
      <div className="eks-kv-grid">
        <KV label="Scopes">
          <code>{(spec.scopes ?? []).join(', ') || '—'}</code>
        </KV>
        <KV label="Age">{ageOf(q.metadata?.creationTimestamp)}</KV>
      </div>
      <Section label={`Resources (${keys.length})`}>
        {!keys.length && <div className="eks-note">No limits defined.</div>}
        {keys.length > 0 && (
          <table className="eks-table">
            <thead>
              <tr>
                <th>Resource</th>
                <th>Used</th>
                <th>Hard</th>
              </tr>
            </thead>
            <tbody>
              {keys.map((k) => (
                <tr key={k}>
                  <td className="eks-mono">{k}</td>
                  <td>{used[k] ?? '—'}</td>
                  <td>{hard[k] ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────
// LimitRange
// ─────────────────────────────────────────────────────────────────────────

function LimitRangeDetails({ lr }: { lr: KubeItem }): React.JSX.Element {
  const spec =
    (lr.spec as
      | {
          limits?: Array<{
            type?: string
            default?: Record<string, string>
            defaultRequest?: Record<string, string>
            max?: Record<string, string>
            min?: Record<string, string>
          }>
        }
      | undefined) ?? {}
  const limits = spec.limits ?? []
  return (
    <div className="eks-details">
      <DetailsHeader
        title={lr.metadata?.name ?? ''}
        subtitle={`limit range · ${lr.metadata?.namespace ?? ''}`}
      />
      <div className="eks-kv-grid">
        <KV label="Age">{ageOf(lr.metadata?.creationTimestamp)}</KV>
      </div>
      {!limits.length && <div className="eks-note">No limits defined.</div>}
      {limits.map((lim, i) => {
        const resources = new Set<string>([
          ...Object.keys(lim.default ?? {}),
          ...Object.keys(lim.defaultRequest ?? {}),
          ...Object.keys(lim.max ?? {}),
          ...Object.keys(lim.min ?? {})
        ])
        const keys = Array.from(resources).sort()
        return (
          <Section key={i} label={`${lim.type ?? 'Limit'}`}>
            <table className="eks-table">
              <thead>
                <tr>
                  <th>Resource</th>
                  <th>Min</th>
                  <th>Default request</th>
                  <th>Default</th>
                  <th>Max</th>
                </tr>
              </thead>
              <tbody>
                {keys.map((k) => (
                  <tr key={k}>
                    <td className="eks-mono">{k}</td>
                    <td>{lim.min?.[k] ?? '—'}</td>
                    <td>{lim.defaultRequest?.[k] ?? '—'}</td>
                    <td>{lim.default?.[k] ?? '—'}</td>
                    <td>{lim.max?.[k] ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Section>
        )
      })}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────
// NetworkPolicy
// ─────────────────────────────────────────────────────────────────────────

function NetworkPolicyDetails({ np }: { np: KubeItem }): React.JSX.Element {
  const spec =
    (np.spec as
      | {
          policyTypes?: string[]
          podSelector?: { matchLabels?: Record<string, string> }
          ingress?: unknown[]
          egress?: unknown[]
        }
      | undefined) ?? {}
  const sel = spec.podSelector?.matchLabels ?? {}
  return (
    <div className="eks-details">
      <DetailsHeader
        title={np.metadata?.name ?? ''}
        subtitle={`network policy · ${np.metadata?.namespace ?? ''}`}
      />
      <div className="eks-kv-grid">
        <KV label="Policy types">
          <code>{(spec.policyTypes ?? []).join(', ') || '—'}</code>
        </KV>
        <KV label="Age">{ageOf(np.metadata?.creationTimestamp)}</KV>
      </div>
      <Section label="Pod selector">
        {Object.keys(sel).length ? (
          <div className="eks-chips">
            {Object.entries(sel).map(([k, v]) => (
              <span key={k} className="eks-chip">
                {k}={v}
              </span>
            ))}
          </div>
        ) : (
          <div className="eks-note">All pods in the namespace.</div>
        )}
      </Section>
      {(spec.ingress?.length ?? 0) > 0 && (
        <Section label={`Ingress rules (${spec.ingress?.length ?? 0})`}>
          <pre className="eks-cm-value">{JSON.stringify(spec.ingress, null, 2)}</pre>
        </Section>
      )}
      {(spec.egress?.length ?? 0) > 0 && (
        <Section label={`Egress rules (${spec.egress?.length ?? 0})`}>
          <pre className="eks-cm-value">{JSON.stringify(spec.egress, null, 2)}</pre>
        </Section>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────
// ServiceAccount
// ─────────────────────────────────────────────────────────────────────────

function ServiceAccountDetails({ sa }: { sa: KubeItem }): React.JSX.Element {
  const saAny = sa as unknown as {
    secrets?: Array<{ name?: string }>
    imagePullSecrets?: Array<{ name?: string }>
    automountServiceAccountToken?: boolean
  }
  const secrets = saAny.secrets ?? []
  const pullSecrets = saAny.imagePullSecrets ?? []
  return (
    <div className="eks-details">
      <DetailsHeader
        title={sa.metadata?.name ?? ''}
        subtitle={`service account · ${sa.metadata?.namespace ?? ''}`}
      />
      <div className="eks-kv-grid">
        <KV label="Automount token">
          {saAny.automountServiceAccountToken === false ? 'no' : 'yes (default)'}
        </KV>
        <KV label="Age">{ageOf(sa.metadata?.creationTimestamp)}</KV>
      </div>
      <Section label={`Mounted secrets (${secrets.length})`}>
        {!secrets.length && <div className="eks-note">None.</div>}
        <ul className="eks-plain-list">
          {secrets.map((s, i) => (
            <li key={i} className="eks-mono">
              {s.name ?? '—'}
            </li>
          ))}
        </ul>
      </Section>
      <Section label={`Image pull secrets (${pullSecrets.length})`}>
        {!pullSecrets.length && <div className="eks-note">None.</div>}
        <ul className="eks-plain-list">
          {pullSecrets.map((s, i) => (
            <li key={i} className="eks-mono">
              {s.name ?? '—'}
            </li>
          ))}
        </ul>
      </Section>
    </div>
  )
}
