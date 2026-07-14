import { useEffect, useState } from 'react'
import {
  Box as BoxIcon,
  Boxes,
  Calendar,
  ChevronDown,
  ChevronRight,
  Cloud,
  Copy,
  Database,
  FileText,
  Folder,
  FolderOpen,
  Gauge,
  Globe,
  HardDrive,
  KeyRound,
  Layers,
  Network,
  Scale,
  Server,
  Shield,
  UserCircle
} from 'lucide-react'
import type { TreeKind, TreeNode } from './kubeTypes'

interface Props {
  root: TreeNode
  selectedId: string | null
  onSelect: (n: TreeNode) => void
  defaultExpandedIds?: string[]
}

const ICON_SIZE = 13

function KindIcon({ kind, open }: { kind: TreeKind; open: boolean }): React.JSX.Element | null {
  const s = ICON_SIZE
  const w = 1.8
  switch (kind) {
    case 'cluster':
      return <Cloud size={s} strokeWidth={w} />
    case 'nodesFolder':
    case 'namespacesFolder':
    case 'workloadsFolder':
    case 'deploymentsFolder':
    case 'podsFolder':
    case 'gatewayFolder':
    case 'gatewayClassesFolder':
    case 'gatewaysFolder':
    case 'httpRoutesFolder':
    case 'servicesFolder':
    case 'ingressesFolder':
    case 'configmapsFolder':
    case 'secretsFolder':
    case 'nodePodsFolder':
    case 'orphanPodsFolder':
    case 'otherPodsFolder':
    case 'unscheduledPodsFolder':
    case 'eventsFolder':
    case 'storageFolder':
    case 'storageClassesFolder':
    case 'pvsFolder':
    case 'storageClustersFolder':
    case 'pvcsFolder':
    case 'resourceQuotasFolder':
    case 'limitRangesFolder':
    case 'networkPoliciesFolder':
    case 'serviceAccountsFolder':
      return open ? <FolderOpen size={s} strokeWidth={w} /> : <Folder size={s} strokeWidth={w} />
    case 'node':
      return <Server size={s} strokeWidth={w} />
    case 'namespace':
      return <Layers size={s} strokeWidth={w} />
    case 'deployment':
    case 'otherWorkload':
      return <Boxes size={s} strokeWidth={w} />
    case 'replicaset':
      return <Copy size={s} strokeWidth={w} />
    case 'pod':
      return <BoxIcon size={s} strokeWidth={w} />
    case 'service':
      return <Network size={s} strokeWidth={w} />
    case 'ingress':
    case 'gateway':
    case 'httpRoute':
    case 'gatewayClass':
      return <Globe size={s} strokeWidth={w} />
    case 'configmap':
      return <FileText size={s} strokeWidth={w} />
    case 'secret':
      return <KeyRound size={s} strokeWidth={w} />
    case 'storageClass':
      return <Database size={s} strokeWidth={w} />
    case 'pv':
    case 'pvc':
      return <HardDrive size={s} strokeWidth={w} />
    case 'storageCluster':
      return <Layers size={s} strokeWidth={w} />
    case 'resourceQuota':
      return <Gauge size={s} strokeWidth={w} />
    case 'limitRange':
      return <Scale size={s} strokeWidth={w} />
    case 'networkPolicy':
      return <Shield size={s} strokeWidth={w} />
    case 'serviceAccount':
      return <UserCircle size={s} strokeWidth={w} />
    default:
      return <Calendar size={s} strokeWidth={w} />
  }
}

export default function KubeTree({
  root,
  selectedId,
  onSelect,
  defaultExpandedIds
}: Props): React.JSX.Element {
  const [expanded, setExpanded] = useState<Set<string>>(
    () => new Set(defaultExpandedIds ?? [root.id])
  )

  // Keep the selected id's ancestors expanded when it changes from outside (e.g. after refresh).
  useEffect(() => {
    if (!selectedId) return
    setExpanded((prev) => {
      const next = new Set(prev)
      next.add(selectedId)
      return next
    })
  }, [selectedId])

  const toggle = (id: string): void => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const renderNode = (n: TreeNode, depth: number): React.JSX.Element => {
    const indent = depth * 12
    const isOpen = expanded.has(n.id)
    const isSelected = n.id === selectedId
    const hasChildren = (n.children?.length ?? 0) > 0
    return (
      <div key={n.id}>
        <div
          className={`eks-tree-row ${isSelected ? 'selected' : ''}`}
          style={{ paddingLeft: 4 + indent }}
          title={n.name}
          onClick={() => {
            if (hasChildren) toggle(n.id)
            onSelect(n)
          }}
        >
          <span className="eks-tree-chevron">
            {hasChildren ? (
              isOpen ? (
                <ChevronDown size={12} strokeWidth={2} />
              ) : (
                <ChevronRight size={12} strokeWidth={2} />
              )
            ) : null}
          </span>
          <span className="eks-tree-icon">
            <KindIcon kind={n.kind} open={isOpen} />
          </span>
          <span className="eks-tree-name">{n.name}</span>
          {typeof n.count === 'number' && <span className="eks-tree-count">{n.count}</span>}
          {n.status && <span className={`eks-tree-status eks-tree-status-${n.status}`} />}
        </div>
        {isOpen && hasChildren && <div>{n.children!.map((c) => renderNode(c, depth + 1))}</div>}
      </div>
    )
  }

  return <div className="eks-tree">{renderNode(root, 0)}</div>
}
