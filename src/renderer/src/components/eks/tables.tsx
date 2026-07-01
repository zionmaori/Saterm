import { Database, KeyRound } from 'lucide-react'
import type { KubeItem } from './kubeTypes'
import { ageOf, formatMem, matchesFilter, parseMemBytes, rowKey } from './utils'

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
  filter
}: {
  items: KubeItem[]
  filter: string
}): React.JSX.Element {
  const rows = items.filter((n) => matchesFilter(n.metadata?.name ?? '', filter))
  if (!rows.length) return <div className="eks-note">No namespaces.</div>
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
