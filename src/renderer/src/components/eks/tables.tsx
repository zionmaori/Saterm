import { Database, KeyRound } from 'lucide-react'
import type { KubeItem } from './kubeTypes'
import { ageOf, formatMem, matchesFilter, parseMemBytes, podPhase, rowKey } from './utils'

export function Pill({
  kind,
  children
}: {
  kind: 'ok' | 'warn' | 'err'
  children: React.ReactNode
}): React.JSX.Element {
  return <span className={`eks-pill eks-pill-${kind}`}>{children}</span>
}

export function NodesTable({
  items,
  filter
}: {
  items: KubeItem[]
  filter: string
}): React.JSX.Element {
  const rows = items.filter((n) => matchesFilter(n.metadata?.name ?? '', filter))
  if (!rows.length) return <div className="eks-note">No nodes.</div>
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

export function NamespacesTable({
  items,
  pods,
  filter,
  onSelect
}: {
  items: KubeItem[]
  pods: KubeItem[]
  filter: string
  onSelect?: (n: KubeItem) => void
}): React.JSX.Element {
  const rows = items.filter((n) => matchesFilter(n.metadata?.name ?? '', filter))
  if (!rows.length) return <div className="eks-note">No namespaces.</div>
  const podsByNs = new Map<string, { running: number; total: number }>()
  for (const p of pods) {
    const ns = p.metadata?.namespace ?? ''
    const bucket = podsByNs.get(ns) ?? { running: 0, total: 0 }
    bucket.total += 1
    if (podPhase(p) === 'Running') bucket.running += 1
    podsByNs.set(ns, bucket)
  }
  return (
    <div className="eks-table-wrap">
      <table className="eks-table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Status</th>
            <th>Pods</th>
            <th>Age</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((n, i) => {
            const phase = (n.status as { phase?: string } | undefined)?.phase ?? '—'
            const name = n.metadata?.name ?? ''
            const counts = podsByNs.get(name) ?? { running: 0, total: 0 }
            return (
              <tr
                key={rowKey(n, i)}
                onClick={onSelect ? () => onSelect(n) : undefined}
                className={onSelect ? 'eks-row-clickable' : undefined}
              >
                <td className="eks-td-name">{name}</td>
                <td>
                  <Pill kind={phase === 'Active' ? 'ok' : 'warn'}>{phase}</Pill>
                </td>
                <td>{`${counts.running}/${counts.total}`}</td>
                <td>{ageOf(n.metadata?.creationTimestamp)}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

export function PodsTable({
  items,
  filter,
  onSelect
}: {
  items: KubeItem[]
  filter: string
  onSelect?: (p: KubeItem) => void
}): React.JSX.Element {
  const rows = items.filter((p) => {
    const name = p.metadata?.name ?? ''
    const ns = p.metadata?.namespace ?? ''
    return matchesFilter(`${ns}/${name}`, filter)
  })
  if (!rows.length) return <div className="eks-note">No pods.</div>
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
              <tr
                key={rowKey(p, i)}
                onClick={onSelect ? () => onSelect(p) : undefined}
                className={onSelect ? 'eks-row-clickable' : undefined}
              >
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

export function DeploymentsTable({
  items,
  filter,
  onSelect
}: {
  items: KubeItem[]
  filter: string
  onSelect?: (d: KubeItem) => void
}): React.JSX.Element {
  const rows = items.filter((d) => {
    const name = d.metadata?.name ?? ''
    const ns = d.metadata?.namespace ?? ''
    return matchesFilter(`${ns}/${name}`, filter)
  })
  if (!rows.length) return <div className="eks-note">No deployments.</div>
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
              <tr
                key={rowKey(d, i)}
                onClick={onSelect ? () => onSelect(d) : undefined}
                className={onSelect ? 'eks-row-clickable' : undefined}
              >
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

export function ServicesTable({
  items,
  filter,
  onSelect
}: {
  items: KubeItem[]
  filter: string
  onSelect?: (s: KubeItem) => void
}): React.JSX.Element {
  const rows = items.filter((s) => {
    const name = s.metadata?.name ?? ''
    const ns = s.metadata?.namespace ?? ''
    return matchesFilter(`${ns}/${name}`, filter)
  })
  if (!rows.length) return <div className="eks-note">No services.</div>
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
              <tr
                key={rowKey(s, i)}
                onClick={onSelect ? () => onSelect(s) : undefined}
                className={onSelect ? 'eks-row-clickable' : undefined}
              >
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

export function IngressesTable({
  items,
  filter,
  onSelect
}: {
  items: KubeItem[]
  filter: string
  onSelect?: (i: KubeItem) => void
}): React.JSX.Element {
  const rows = items.filter((s) => {
    const name = s.metadata?.name ?? ''
    const ns = s.metadata?.namespace ?? ''
    return matchesFilter(`${ns}/${name}`, filter)
  })
  if (!rows.length) return <div className="eks-note">No ingresses.</div>
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
              <tr
                key={rowKey(i, idx)}
                onClick={onSelect ? () => onSelect(i) : undefined}
                className={onSelect ? 'eks-row-clickable' : undefined}
              >
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

export function ConfigMapsTable({
  items,
  filter,
  onSelect
}: {
  items: KubeItem[]
  filter: string
  onSelect?: (c: KubeItem) => void
}): React.JSX.Element {
  const rows = items.filter((s) => {
    const name = s.metadata?.name ?? ''
    const ns = s.metadata?.namespace ?? ''
    return matchesFilter(`${ns}/${name}`, filter)
  })
  if (!rows.length) return <div className="eks-note">No config maps.</div>
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
              <tr
                key={rowKey(s, i)}
                onClick={onSelect ? () => onSelect(s) : undefined}
                className={onSelect ? 'eks-row-clickable' : undefined}
              >
                <td>{s.metadata?.namespace ?? ''}</td>
                <td className="eks-td-name">
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

export function SecretsTable({
  items,
  filter,
  onSelect
}: {
  items: KubeItem[]
  filter: string
  onSelect?: (s: KubeItem) => void
}): React.JSX.Element {
  const rows = items.filter((s) => {
    const name = s.metadata?.name ?? ''
    const ns = s.metadata?.namespace ?? ''
    return matchesFilter(`${ns}/${name}`, filter)
  })
  if (!rows.length) return <div className="eks-note">No secrets.</div>
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
              <tr
                key={rowKey(s, i)}
                onClick={onSelect ? () => onSelect(s) : undefined}
                className={onSelect ? 'eks-row-clickable' : undefined}
              >
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

export function StorageClassesTable({
  items,
  filter,
  onSelect
}: {
  items: KubeItem[]
  filter: string
  onSelect?: (s: KubeItem) => void
}): React.JSX.Element {
  const rows = items.filter((s) => matchesFilter(s.metadata?.name ?? '', filter))
  if (!rows.length) return <div className="eks-note">No storage classes.</div>
  return (
    <div className="eks-table-wrap">
      <table className="eks-table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Provisioner</th>
            <th>Reclaim</th>
            <th>Binding mode</th>
            <th>Allow expand</th>
            <th>Default</th>
            <th>Age</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((s, i) => {
            const sc = s as unknown as {
              provisioner?: string
              reclaimPolicy?: string
              volumeBindingMode?: string
              allowVolumeExpansion?: boolean
            }
            const isDefault =
              s.metadata?.labels?.['storageclass.kubernetes.io/is-default-class'] === 'true' ||
              (s.metadata as { annotations?: Record<string, string> } | undefined)?.annotations?.[
                'storageclass.kubernetes.io/is-default-class'
              ] === 'true'
            return (
              <tr
                key={rowKey(s, i)}
                onClick={onSelect ? () => onSelect(s) : undefined}
                className={onSelect ? 'eks-row-clickable' : undefined}
              >
                <td className="eks-td-name">{s.metadata?.name ?? ''}</td>
                <td className="eks-mono">{sc.provisioner ?? '—'}</td>
                <td>{sc.reclaimPolicy ?? '—'}</td>
                <td>{sc.volumeBindingMode ?? '—'}</td>
                <td>{sc.allowVolumeExpansion ? 'yes' : 'no'}</td>
                <td>{isDefault ? <Pill kind="ok">default</Pill> : '—'}</td>
                <td>{ageOf(s.metadata?.creationTimestamp)}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

export function PersistentVolumesTable({
  items,
  filter,
  onSelect
}: {
  items: KubeItem[]
  filter: string
  onSelect?: (v: KubeItem) => void
}): React.JSX.Element {
  const rows = items.filter((v) => matchesFilter(v.metadata?.name ?? '', filter))
  if (!rows.length) return <div className="eks-note">No persistent volumes.</div>
  return (
    <div className="eks-table-wrap">
      <table className="eks-table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Capacity</th>
            <th>Access</th>
            <th>Reclaim</th>
            <th>Status</th>
            <th>Claim</th>
            <th>Storage class</th>
            <th>Age</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((v, i) => {
            const spec =
              (v.spec as
                | {
                    capacity?: { storage?: string }
                    accessModes?: string[]
                    persistentVolumeReclaimPolicy?: string
                    storageClassName?: string
                    claimRef?: { namespace?: string; name?: string }
                  }
                | undefined) ?? {}
            const status = (v.status as { phase?: string } | undefined) ?? {}
            const phase = status.phase ?? '—'
            const accent: 'ok' | 'warn' | 'err' =
              phase === 'Bound' ? 'ok' : phase === 'Available' ? 'warn' : 'err'
            const claim = spec.claimRef ? `${spec.claimRef.namespace}/${spec.claimRef.name}` : '—'
            return (
              <tr
                key={rowKey(v, i)}
                onClick={onSelect ? () => onSelect(v) : undefined}
                className={onSelect ? 'eks-row-clickable' : undefined}
              >
                <td className="eks-td-name">{v.metadata?.name ?? ''}</td>
                <td>{spec.capacity?.storage ?? '—'}</td>
                <td className="eks-mono">{(spec.accessModes ?? []).join(',') || '—'}</td>
                <td>{spec.persistentVolumeReclaimPolicy ?? '—'}</td>
                <td>
                  <Pill kind={accent}>{phase}</Pill>
                </td>
                <td className="eks-td-truncate" title={claim}>
                  {claim}
                </td>
                <td>{spec.storageClassName ?? '—'}</td>
                <td>{ageOf(v.metadata?.creationTimestamp)}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

export function StorageClustersTable({
  items,
  filter,
  onSelect
}: {
  items: KubeItem[]
  filter: string
  onSelect?: (s: KubeItem) => void
}): React.JSX.Element {
  const rows = items.filter((s) => matchesFilter(s.metadata?.name ?? '', filter))
  if (!rows.length) return <div className="eks-note">No storage clusters.</div>
  return (
    <div className="eks-table-wrap">
      <table className="eks-table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Kind</th>
            <th>Namespace</th>
            <th>Phase</th>
            <th>Age</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((s, i) => {
            const status = (s.status as { phase?: string; state?: string } | undefined) ?? {}
            const phase = status.phase ?? status.state ?? '—'
            return (
              <tr
                key={rowKey(s, i)}
                onClick={onSelect ? () => onSelect(s) : undefined}
                className={onSelect ? 'eks-row-clickable' : undefined}
              >
                <td className="eks-td-name">{s.metadata?.name ?? ''}</td>
                <td className="eks-mono">{s.kind ?? '—'}</td>
                <td>{s.metadata?.namespace ?? '—'}</td>
                <td>{phase}</td>
                <td>{ageOf(s.metadata?.creationTimestamp)}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

export function PVCsTable({
  items,
  filter,
  onSelect
}: {
  items: KubeItem[]
  filter: string
  onSelect?: (p: KubeItem) => void
}): React.JSX.Element {
  const rows = items.filter((p) => {
    const name = p.metadata?.name ?? ''
    const ns = p.metadata?.namespace ?? ''
    return matchesFilter(`${ns}/${name}`, filter)
  })
  if (!rows.length) return <div className="eks-note">No persistent volume claims.</div>
  return (
    <div className="eks-table-wrap">
      <table className="eks-table">
        <thead>
          <tr>
            <th>Namespace</th>
            <th>Name</th>
            <th>Status</th>
            <th>Volume</th>
            <th>Capacity</th>
            <th>Access</th>
            <th>Storage class</th>
            <th>Age</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((p, i) => {
            const spec =
              (p.spec as
                | {
                    volumeName?: string
                    storageClassName?: string
                    accessModes?: string[]
                    resources?: { requests?: { storage?: string } }
                  }
                | undefined) ?? {}
            const status =
              (p.status as { phase?: string; capacity?: { storage?: string } } | undefined) ?? {}
            const phase = status.phase ?? '—'
            const accent: 'ok' | 'warn' | 'err' =
              phase === 'Bound' ? 'ok' : phase === 'Pending' ? 'warn' : 'err'
            const cap = status.capacity?.storage ?? spec.resources?.requests?.storage ?? '—'
            return (
              <tr
                key={rowKey(p, i)}
                onClick={onSelect ? () => onSelect(p) : undefined}
                className={onSelect ? 'eks-row-clickable' : undefined}
              >
                <td>{p.metadata?.namespace ?? ''}</td>
                <td className="eks-td-name">{p.metadata?.name ?? ''}</td>
                <td>
                  <Pill kind={accent}>{phase}</Pill>
                </td>
                <td className="eks-td-truncate eks-mono" title={spec.volumeName ?? ''}>
                  {spec.volumeName ?? '—'}
                </td>
                <td>{cap}</td>
                <td className="eks-mono">{(spec.accessModes ?? []).join(',') || '—'}</td>
                <td>{spec.storageClassName ?? '—'}</td>
                <td>{ageOf(p.metadata?.creationTimestamp)}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

export function ResourceQuotasTable({
  items,
  filter,
  onSelect
}: {
  items: KubeItem[]
  filter: string
  onSelect?: (q: KubeItem) => void
}): React.JSX.Element {
  const rows = items.filter((q) => {
    const name = q.metadata?.name ?? ''
    const ns = q.metadata?.namespace ?? ''
    return matchesFilter(`${ns}/${name}`, filter)
  })
  if (!rows.length) return <div className="eks-note">No resource quotas.</div>
  return (
    <div className="eks-table-wrap">
      <table className="eks-table">
        <thead>
          <tr>
            <th>Namespace</th>
            <th>Name</th>
            <th>Hard limits</th>
            <th>Age</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((q, i) => {
            const status = (q.status as { hard?: Record<string, string> } | undefined) ?? {}
            const spec = (q.spec as { hard?: Record<string, string> } | undefined) ?? {}
            const hardCount = Object.keys(status.hard ?? spec.hard ?? {}).length
            return (
              <tr
                key={rowKey(q, i)}
                onClick={onSelect ? () => onSelect(q) : undefined}
                className={onSelect ? 'eks-row-clickable' : undefined}
              >
                <td>{q.metadata?.namespace ?? ''}</td>
                <td className="eks-td-name">{q.metadata?.name ?? ''}</td>
                <td>{hardCount}</td>
                <td>{ageOf(q.metadata?.creationTimestamp)}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

export function LimitRangesTable({
  items,
  filter,
  onSelect
}: {
  items: KubeItem[]
  filter: string
  onSelect?: (l: KubeItem) => void
}): React.JSX.Element {
  const rows = items.filter((l) => {
    const name = l.metadata?.name ?? ''
    const ns = l.metadata?.namespace ?? ''
    return matchesFilter(`${ns}/${name}`, filter)
  })
  if (!rows.length) return <div className="eks-note">No limit ranges.</div>
  return (
    <div className="eks-table-wrap">
      <table className="eks-table">
        <thead>
          <tr>
            <th>Namespace</th>
            <th>Name</th>
            <th>Types</th>
            <th>Age</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((l, i) => {
            const spec = (l.spec as { limits?: Array<{ type?: string }> } | undefined) ?? {}
            const types = (spec.limits ?? [])
              .map((t) => t.type ?? '')
              .filter(Boolean)
              .join(', ')
            return (
              <tr
                key={rowKey(l, i)}
                onClick={onSelect ? () => onSelect(l) : undefined}
                className={onSelect ? 'eks-row-clickable' : undefined}
              >
                <td>{l.metadata?.namespace ?? ''}</td>
                <td className="eks-td-name">{l.metadata?.name ?? ''}</td>
                <td className="eks-td-truncate" title={types}>
                  {types || '—'}
                </td>
                <td>{ageOf(l.metadata?.creationTimestamp)}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

export function NetworkPoliciesTable({
  items,
  filter,
  onSelect
}: {
  items: KubeItem[]
  filter: string
  onSelect?: (n: KubeItem) => void
}): React.JSX.Element {
  const rows = items.filter((n) => {
    const name = n.metadata?.name ?? ''
    const ns = n.metadata?.namespace ?? ''
    return matchesFilter(`${ns}/${name}`, filter)
  })
  if (!rows.length) return <div className="eks-note">No network policies.</div>
  return (
    <div className="eks-table-wrap">
      <table className="eks-table">
        <thead>
          <tr>
            <th>Namespace</th>
            <th>Name</th>
            <th>Types</th>
            <th>Pod selector</th>
            <th>Age</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((n, i) => {
            const spec =
              (n.spec as
                | {
                    policyTypes?: string[]
                    podSelector?: { matchLabels?: Record<string, string> }
                  }
                | undefined) ?? {}
            const types = (spec.policyTypes ?? []).join(', ') || '—'
            const sel = spec.podSelector?.matchLabels ?? {}
            const selStr = Object.entries(sel)
              .map(([k, v]) => `${k}=${v}`)
              .join(', ')
            return (
              <tr
                key={rowKey(n, i)}
                onClick={onSelect ? () => onSelect(n) : undefined}
                className={onSelect ? 'eks-row-clickable' : undefined}
              >
                <td>{n.metadata?.namespace ?? ''}</td>
                <td className="eks-td-name">{n.metadata?.name ?? ''}</td>
                <td className="eks-mono">{types}</td>
                <td className="eks-td-truncate eks-mono" title={selStr}>
                  {selStr || 'all pods'}
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

export function ServiceAccountsTable({
  items,
  filter,
  onSelect
}: {
  items: KubeItem[]
  filter: string
  onSelect?: (s: KubeItem) => void
}): React.JSX.Element {
  const rows = items.filter((s) => {
    const name = s.metadata?.name ?? ''
    const ns = s.metadata?.namespace ?? ''
    return matchesFilter(`${ns}/${name}`, filter)
  })
  if (!rows.length) return <div className="eks-note">No service accounts.</div>
  return (
    <div className="eks-table-wrap">
      <table className="eks-table">
        <thead>
          <tr>
            <th>Namespace</th>
            <th>Name</th>
            <th>Secrets</th>
            <th>Age</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((s, i) => {
            const secrets = (s as unknown as { secrets?: unknown[] }).secrets ?? []
            return (
              <tr
                key={rowKey(s, i)}
                onClick={onSelect ? () => onSelect(s) : undefined}
                className={onSelect ? 'eks-row-clickable' : undefined}
              >
                <td>{s.metadata?.namespace ?? ''}</td>
                <td className="eks-td-name">{s.metadata?.name ?? ''}</td>
                <td>{secrets.length}</td>
                <td>{ageOf(s.metadata?.creationTimestamp)}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

export function EventsTable({
  items,
  filter
}: {
  items: KubeItem[]
  filter: string
}): React.JSX.Element {
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
  if (!rows.length) return <div className="eks-note">No events.</div>
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
