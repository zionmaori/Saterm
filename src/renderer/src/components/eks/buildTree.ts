import type { KubeBundle, KubeItem, StatusKind, TreeNode } from './kubeTypes'
import { podPhase } from './utils'

export interface BuildOpts {
  namespaceFilter: string // 'all' or specific ns name
  search: string
}

function nodeStatus(n: KubeItem): StatusKind {
  const conds =
    (n.status as { conditions?: Array<{ type?: string; status?: string }> } | undefined)
      ?.conditions ?? []
  return conds.find((c) => c.type === 'Ready')?.status === 'True' ? 'ok' : 'err'
}

function deploymentStatus(d: KubeItem): StatusKind {
  const st = (d.status as { readyReplicas?: number; replicas?: number } | undefined) ?? {}
  const r = st.readyReplicas ?? 0
  const total = st.replicas ?? 0
  if (total === 0) return 'err'
  if (r === total) return 'ok'
  if (r === 0) return 'err'
  return 'warn'
}

function replicasetStatus(rs: KubeItem): StatusKind {
  const st = (rs.status as { readyReplicas?: number; replicas?: number } | undefined) ?? {}
  const r = st.readyReplicas ?? 0
  const total = st.replicas ?? 0
  if (total === 0) return 'warn'
  if (r === total) return 'ok'
  if (r === 0) return 'err'
  return 'warn'
}

function podStatus(p: KubeItem): StatusKind {
  const phase = podPhase(p)
  if (phase === 'Running' || phase === 'Succeeded') return 'ok'
  if (phase === 'Pending' || phase === 'ContainerCreating') return 'warn'
  return 'err'
}

/** Ancestor-preserving text filter over the tree. */
function pruneBySearch(node: TreeNode, q: string): TreeNode | null {
  if (!q.trim()) return node
  const needle = q.toLowerCase()
  const selfMatch = node.name.toLowerCase().includes(needle)
  const kids = (node.children ?? [])
    .map((c) => pruneBySearch(c, q))
    .filter((c): c is TreeNode => c !== null)
  if (selfMatch || kids.length > 0) {
    return { ...node, children: kids.length ? kids : node.children ? [] : undefined }
  }
  return null
}

type OwnerRef = NonNullable<NonNullable<KubeItem['metadata']>['ownerReferences']>[number]

function findControllerRef(refs: OwnerRef[] | undefined): OwnerRef | undefined {
  if (!refs || !refs.length) return undefined
  for (const r of refs) {
    if (r?.controller) return r
  }
  return refs[0]
}

export function buildNamespaceTree(
  bundle: KubeBundle,
  cluster: { cluster: string },
  opts: BuildOpts
): TreeNode {
  const { namespaceFilter, search } = opts

  const nsList = bundle.namespaces
    .map((n) => n.metadata?.name ?? '')
    .filter(Boolean)
    .filter((n) => namespaceFilter === 'all' || n === namespaceFilter)
    .sort()

  const podsByOwnerUid = new Map<string, KubeItem[]>()
  const orphanPodsByNs = new Map<string, KubeItem[]>()
  for (const p of bundle.pods) {
    const ownerRefs = p.metadata?.ownerReferences ?? []
    const ctrl = findControllerRef(ownerRefs)
    if (ctrl?.uid) {
      const arr = podsByOwnerUid.get(ctrl.uid) ?? []
      arr.push(p)
      podsByOwnerUid.set(ctrl.uid, arr)
    } else {
      const ns = p.metadata?.namespace ?? ''
      const arr = orphanPodsByNs.get(ns) ?? []
      arr.push(p)
      orphanPodsByNs.set(ns, arr)
    }
  }

  const nsRoots: TreeNode[] = nsList.map((ns) => {
    const nsDeploys = bundle.deployments.filter((d) => d.metadata?.namespace === ns)
    const nsSvcs = bundle.services.filter((s) => s.metadata?.namespace === ns)
    const nsIngresses = bundle.ingresses.filter((i) => i.metadata?.namespace === ns)
    const nsConfigMaps = bundle.configmaps.filter((c) => c.metadata?.namespace === ns)
    const nsSecrets = bundle.secrets.filter((s) => s.metadata?.namespace === ns)
    const orphans = orphanPodsByNs.get(ns) ?? []

    const deploymentNodes: TreeNode[] = nsDeploys.map((d) => {
      const dUid = d.metadata?.uid ?? ''
      const dName = d.metadata?.name ?? ''
      // Find RS that own this deployment.
      const ownedRs = bundle.replicasets.filter((rs) => {
        const refs = rs.metadata?.ownerReferences ?? []
        return refs.some((r) => r?.uid === dUid)
      })
      const rsNodes: TreeNode[] = ownedRs.map((rs) => {
        const rsUid = rs.metadata?.uid ?? ''
        const pods = podsByOwnerUid.get(rsUid) ?? []
        return {
          id: `ns/${ns}/dep/${dName}/rs/${rs.metadata?.name ?? ''}`,
          kind: 'replicaset',
          name: rs.metadata?.name ?? '',
          namespace: ns,
          count: pods.length,
          status: replicasetStatus(rs),
          item: rs,
          children: pods.map((p) => ({
            id: `ns/${ns}/dep/${dName}/rs/${rs.metadata?.name ?? ''}/pod/${p.metadata?.name ?? ''}`,
            kind: 'pod',
            name: p.metadata?.name ?? '',
            namespace: ns,
            status: podStatus(p),
            item: p
          }))
        }
      })
      // Only include RS with replicas > 0 OR pods present, plus historical ones collapsed.
      const activeRs = rsNodes.filter((rn) => (rn.count ?? 0) > 0)
      const displayRs = activeRs.length ? activeRs : rsNodes.slice(0, 1)
      return {
        id: `ns/${ns}/dep/${dName}`,
        kind: 'deployment',
        name: dName,
        namespace: ns,
        count: displayRs.reduce((a, r) => a + (r.count ?? 0), 0),
        status: deploymentStatus(d),
        item: d,
        children: displayRs
      }
    })

    const workloadsNode: TreeNode = {
      id: `ns/${ns}/workloads`,
      kind: 'workloadsFolder',
      name: 'workloads',
      namespace: ns,
      count: deploymentNodes.length,
      children: [
        {
          id: `ns/${ns}/deployments`,
          kind: 'deploymentsFolder',
          name: 'deployments',
          namespace: ns,
          count: deploymentNodes.length,
          children: deploymentNodes
        }
      ]
    }

    if (orphans.length) {
      workloadsNode.children!.push({
        id: `ns/${ns}/orphanPods`,
        kind: 'orphanPodsFolder',
        name: 'orphan pods',
        namespace: ns,
        count: orphans.length,
        children: orphans.map((p) => ({
          id: `ns/${ns}/orphanPods/${p.metadata?.name ?? ''}`,
          kind: 'pod',
          name: p.metadata?.name ?? '',
          namespace: ns,
          status: podStatus(p),
          item: p
        }))
      })
    }

    const servicesNode: TreeNode = {
      id: `ns/${ns}/services`,
      kind: 'servicesFolder',
      name: 'services',
      namespace: ns,
      count: nsSvcs.length,
      children: nsSvcs.map((s) => ({
        id: `ns/${ns}/svc/${s.metadata?.name ?? ''}`,
        kind: 'service',
        name: s.metadata?.name ?? '',
        namespace: ns,
        item: s
      }))
    }

    const ingressesNode: TreeNode = {
      id: `ns/${ns}/ingresses`,
      kind: 'ingressesFolder',
      name: 'ingresses',
      namespace: ns,
      count: nsIngresses.length,
      children: nsIngresses.map((i) => ({
        id: `ns/${ns}/ing/${i.metadata?.name ?? ''}`,
        kind: 'ingress',
        name: i.metadata?.name ?? '',
        namespace: ns,
        item: i
      }))
    }

    const configMapsNode: TreeNode = {
      id: `ns/${ns}/configmaps`,
      kind: 'configmapsFolder',
      name: 'configmaps',
      namespace: ns,
      count: nsConfigMaps.length,
      children: nsConfigMaps.map((c) => ({
        id: `ns/${ns}/cm/${c.metadata?.name ?? ''}`,
        kind: 'configmap',
        name: c.metadata?.name ?? '',
        namespace: ns,
        item: c
      }))
    }

    const secretsNode: TreeNode = {
      id: `ns/${ns}/secrets`,
      kind: 'secretsFolder',
      name: 'secrets',
      namespace: ns,
      count: nsSecrets.length,
      children: nsSecrets.map((s) => ({
        id: `ns/${ns}/sec/${s.metadata?.name ?? ''}`,
        kind: 'secret',
        name: s.metadata?.name ?? '',
        namespace: ns,
        item: s
      }))
    }

    const totalPods = bundle.pods.filter((p) => p.metadata?.namespace === ns).length

    return {
      id: `ns/${ns}`,
      kind: 'namespace',
      name: ns,
      namespace: ns,
      count: totalPods,
      children: [workloadsNode, servicesNode, ingressesNode, configMapsNode, secretsNode]
    }
  })

  const nodesFolder: TreeNode = {
    id: 'nodes',
    kind: 'nodesFolder',
    name: 'nodes',
    count: bundle.nodes.length,
    children: bundle.nodes.map((n) => ({
      id: `nodes/${n.metadata?.name ?? ''}`,
      kind: 'node',
      name: n.metadata?.name ?? '',
      status: nodeStatus(n),
      item: n
    }))
  }

  const namespacesFolder: TreeNode = {
    id: 'namespaces',
    kind: 'namespacesFolder',
    name: 'namespaces',
    count: nsRoots.length,
    children: nsRoots
  }

  const eventsNode: TreeNode = {
    id: 'events',
    kind: 'eventsFolder',
    name: 'events',
    children: []
  }

  const root: TreeNode = {
    id: 'cluster',
    kind: 'cluster',
    name: cluster.cluster,
    children: [nodesFolder, namespacesFolder, eventsNode]
  }

  return pruneBySearch(root, search) ?? root
}

export function buildNodeTree(
  bundle: KubeBundle,
  cluster: { cluster: string },
  opts: BuildOpts
): TreeNode {
  const { namespaceFilter, search } = opts

  const podsByNode = new Map<string, KubeItem[]>()
  const unscheduled: KubeItem[] = []
  for (const p of bundle.pods) {
    if (namespaceFilter !== 'all' && p.metadata?.namespace !== namespaceFilter) continue
    const nn = (p.spec as { nodeName?: string } | undefined)?.nodeName
    if (!nn) {
      unscheduled.push(p)
      continue
    }
    const arr = podsByNode.get(nn) ?? []
    arr.push(p)
    podsByNode.set(nn, arr)
  }

  const nodeChildren: TreeNode[] = bundle.nodes.map((n) => {
    const name = n.metadata?.name ?? ''
    const pods = podsByNode.get(name) ?? []
    return {
      id: `node/${name}`,
      kind: 'node',
      name,
      count: pods.length,
      status: nodeStatus(n),
      item: n,
      children: [
        {
          id: `node/${name}/pods`,
          kind: 'nodePodsFolder',
          name: 'pods',
          count: pods.length,
          children: pods.map((p) => ({
            id: `node/${name}/pods/${p.metadata?.namespace}/${p.metadata?.name ?? ''}`,
            kind: 'pod',
            name: `${p.metadata?.namespace}/${p.metadata?.name ?? ''}`,
            namespace: p.metadata?.namespace,
            status: podStatus(p),
            item: p
          }))
        }
      ]
    }
  })

  if (unscheduled.length) {
    nodeChildren.push({
      id: 'node/__unscheduled',
      kind: 'unscheduledPodsFolder',
      name: 'unscheduled',
      count: unscheduled.length,
      children: unscheduled.map((p) => ({
        id: `node/__unscheduled/${p.metadata?.namespace}/${p.metadata?.name ?? ''}`,
        kind: 'pod',
        name: `${p.metadata?.namespace}/${p.metadata?.name ?? ''}`,
        namespace: p.metadata?.namespace,
        status: podStatus(p),
        item: p
      }))
    })
  }

  const root: TreeNode = {
    id: 'cluster',
    kind: 'cluster',
    name: cluster.cluster,
    children: nodeChildren
  }

  return pruneBySearch(root, search) ?? root
}

/** Collect the ancestor ids for a target node id (inclusive of self). */
export function ancestorsOf(root: TreeNode, targetId: string): string[] {
  const stack: string[] = []
  const path: string[] = []
  const visit = (n: TreeNode): boolean => {
    stack.push(n.id)
    if (n.id === targetId) {
      path.push(...stack)
      stack.pop()
      return true
    }
    for (const c of n.children ?? []) {
      if (visit(c)) {
        stack.pop()
        return true
      }
    }
    stack.pop()
    return false
  }
  visit(root)
  return path
}

/** Find a tree node by id. */
export function findNode(root: TreeNode, id: string): TreeNode | null {
  if (root.id === id) return root
  for (const c of root.children ?? []) {
    const f = findNode(c, id)
    if (f) return f
  }
  return null
}
