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

  // Track which pods we render under deployment→RS so we can surface anything
  // left over (StatefulSet/DaemonSet/Job/CronJob/bare-RS pods) under an
  // "other workloads" folder. Without this, ArgoCD-managed StatefulSet pods
  // etc. become invisible even though `kubectl get pods` returns them.
  const claimedPodUids = new Set<string>()

  const nsRoots: TreeNode[] = nsList.map((ns) => {
    const nsDeploys = bundle.deployments.filter((d) => d.metadata?.namespace === ns)
    const nsSvcs = bundle.services.filter((s) => s.metadata?.namespace === ns)
    const nsIngresses = bundle.ingresses.filter((i) => i.metadata?.namespace === ns)
    const nsConfigMaps = bundle.configmaps.filter((c) => c.metadata?.namespace === ns)
    const nsSecrets = bundle.secrets.filter((s) => s.metadata?.namespace === ns)
    const nsPvcs = bundle.persistentVolumeClaims.filter((p) => p.metadata?.namespace === ns)
    const nsQuotas = bundle.resourceQuotas.filter((q) => q.metadata?.namespace === ns)
    const nsLimits = bundle.limitRanges.filter((l) => l.metadata?.namespace === ns)
    const nsNetPols = bundle.networkPolicies.filter((n) => n.metadata?.namespace === ns)
    const nsSAs = bundle.serviceAccounts.filter((s) => s.metadata?.namespace === ns)
    const nsGws = bundle.gateways.filter((g) => g.metadata?.namespace === ns)
    const nsRoutes = bundle.httpRoutes.filter((r) => r.metadata?.namespace === ns)
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
        for (const p of pods) {
          if (p.metadata?.uid) claimedPodUids.add(p.metadata.uid)
        }
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
      for (const p of orphans) {
        if (p.metadata?.uid) claimedPodUids.add(p.metadata.uid)
      }
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

    // Pods managed by StatefulSet / DaemonSet / Job / CronJob / bare-RS end up
    // in podsByOwnerUid but aren't reachable via the deployment→RS walk above.
    // Group them by their controller kind+name so the tree still surfaces them.
    const otherPodsInNs = bundle.pods.filter(
      (p) => p.metadata?.namespace === ns && p.metadata?.uid && !claimedPodUids.has(p.metadata.uid)
    )
    if (otherPodsInNs.length) {
      const byCtrl = new Map<string, { kind: string; name: string; pods: KubeItem[] }>()
      for (const p of otherPodsInNs) {
        const ctrl = findControllerRef(p.metadata?.ownerReferences)
        const kind = ctrl?.kind ?? 'pod'
        const name = ctrl?.name ?? p.metadata?.name ?? ''
        const key = `${kind}/${name}`
        const bucket = byCtrl.get(key) ?? { kind, name, pods: [] }
        bucket.pods.push(p)
        byCtrl.set(key, bucket)
        if (p.metadata?.uid) claimedPodUids.add(p.metadata.uid)
      }
      const ctrlChildren: TreeNode[] = Array.from(byCtrl.values())
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((c) => ({
          id: `ns/${ns}/otherPods/${c.kind}/${c.name}`,
          kind: 'otherWorkload',
          name: `${c.name} · ${c.kind}`,
          namespace: ns,
          count: c.pods.length,
          children: c.pods.map((p) => ({
            id: `ns/${ns}/otherPods/${c.kind}/${c.name}/pod/${p.metadata?.name ?? ''}`,
            kind: 'pod',
            name: p.metadata?.name ?? '',
            namespace: ns,
            status: podStatus(p),
            item: p
          }))
        }))
      workloadsNode.children!.push({
        id: `ns/${ns}/otherPods`,
        kind: 'otherPodsFolder',
        name: 'other pods',
        namespace: ns,
        count: otherPodsInNs.length,
        children: ctrlChildren
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

    const pvcsNode: TreeNode = {
      id: `ns/${ns}/pvcs`,
      kind: 'pvcsFolder',
      name: 'persistent volume claims',
      namespace: ns,
      count: nsPvcs.length,
      children: nsPvcs.map((p) => ({
        id: `ns/${ns}/pvc/${p.metadata?.name ?? ''}`,
        kind: 'pvc',
        name: p.metadata?.name ?? '',
        namespace: ns,
        item: p
      }))
    }

    const quotasNode: TreeNode = {
      id: `ns/${ns}/quotas`,
      kind: 'resourceQuotasFolder',
      name: 'resource quotas',
      namespace: ns,
      count: nsQuotas.length,
      children: nsQuotas.map((q) => ({
        id: `ns/${ns}/quota/${q.metadata?.name ?? ''}`,
        kind: 'resourceQuota',
        name: q.metadata?.name ?? '',
        namespace: ns,
        item: q
      }))
    }

    const limitsNode: TreeNode = {
      id: `ns/${ns}/limits`,
      kind: 'limitRangesFolder',
      name: 'limit ranges',
      namespace: ns,
      count: nsLimits.length,
      children: nsLimits.map((l) => ({
        id: `ns/${ns}/limit/${l.metadata?.name ?? ''}`,
        kind: 'limitRange',
        name: l.metadata?.name ?? '',
        namespace: ns,
        item: l
      }))
    }

    const netPolsNode: TreeNode = {
      id: `ns/${ns}/netpols`,
      kind: 'networkPoliciesFolder',
      name: 'network policies',
      namespace: ns,
      count: nsNetPols.length,
      children: nsNetPols.map((n) => ({
        id: `ns/${ns}/netpol/${n.metadata?.name ?? ''}`,
        kind: 'networkPolicy',
        name: n.metadata?.name ?? '',
        namespace: ns,
        item: n
      }))
    }

    const sasNode: TreeNode = {
      id: `ns/${ns}/sas`,
      kind: 'serviceAccountsFolder',
      name: 'service accounts',
      namespace: ns,
      count: nsSAs.length,
      children: nsSAs.map((s) => ({
        id: `ns/${ns}/sa/${s.metadata?.name ?? ''}`,
        kind: 'serviceAccount',
        name: s.metadata?.name ?? '',
        namespace: ns,
        item: s
      }))
    }

    const gatewaysNode: TreeNode = {
      id: `ns/${ns}/gateways`,
      kind: 'gatewaysFolder',
      name: 'gateways',
      namespace: ns,
      count: nsGws.length,
      children: nsGws.map((g) => ({
        id: `ns/${ns}/gateway/${g.metadata?.name ?? ''}`,
        kind: 'gateway',
        name: g.metadata?.name ?? '',
        namespace: ns,
        item: g
      }))
    }

    const httpRoutesNode: TreeNode = {
      id: `ns/${ns}/httproutes`,
      kind: 'httpRoutesFolder',
      name: 'http routes',
      namespace: ns,
      count: nsRoutes.length,
      children: nsRoutes.map((r) => ({
        id: `ns/${ns}/httproute/${r.metadata?.name ?? ''}`,
        kind: 'httpRoute',
        name: r.metadata?.name ?? '',
        namespace: ns,
        item: r
      }))
    }

    const totalPods = bundle.pods.filter((p) => p.metadata?.namespace === ns).length

    return {
      id: `ns/${ns}`,
      kind: 'namespace',
      name: ns,
      namespace: ns,
      count: totalPods,
      children: [
        workloadsNode,
        servicesNode,
        ingressesNode,
        gatewaysNode,
        httpRoutesNode,
        configMapsNode,
        secretsNode,
        pvcsNode,
        quotasNode,
        limitsNode,
        netPolsNode,
        sasNode
      ]
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

  const allPods =
    namespaceFilter === 'all'
      ? bundle.pods
      : bundle.pods.filter((p) => p.metadata?.namespace === namespaceFilter)

  const podsFolder: TreeNode = {
    id: 'pods',
    kind: 'podsFolder',
    name: 'pods',
    count: allPods.length,
    children: allPods.map((p) => ({
      id: `pods/${p.metadata?.namespace}/${p.metadata?.name ?? ''}`,
      kind: 'pod',
      name: `${p.metadata?.namespace}/${p.metadata?.name ?? ''}`,
      namespace: p.metadata?.namespace,
      status: podStatus(p),
      item: p
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

  const storageClassesFolder: TreeNode = {
    id: 'storage/storageclasses',
    kind: 'storageClassesFolder',
    name: 'storage classes',
    count: bundle.storageClasses.length,
    children: bundle.storageClasses.map((s) => ({
      id: `storage/sc/${s.metadata?.name ?? ''}`,
      kind: 'storageClass',
      name: s.metadata?.name ?? '',
      item: s
    }))
  }

  const pvsFolder: TreeNode = {
    id: 'storage/pvs',
    kind: 'pvsFolder',
    name: 'persistent volumes',
    count: bundle.persistentVolumes.length,
    children: bundle.persistentVolumes.map((v) => ({
      id: `storage/pv/${v.metadata?.name ?? ''}`,
      kind: 'pv',
      name: v.metadata?.name ?? '',
      item: v
    }))
  }

  const storageChildren: TreeNode[] = [storageClassesFolder, pvsFolder]

  if (bundle.storageClusters.length > 0) {
    storageChildren.push({
      id: 'storage/storageclusters',
      kind: 'storageClustersFolder',
      name: 'storage clusters',
      count: bundle.storageClusters.length,
      children: bundle.storageClusters.map((s) => ({
        id: `storage/sccluster/${s.kind ?? ''}/${s.metadata?.name ?? ''}`,
        kind: 'storageCluster',
        name: s.metadata?.name ?? '',
        item: s
      }))
    })
  }

  const storageFolder: TreeNode = {
    id: 'storage',
    kind: 'storageFolder',
    name: 'storage',
    count: bundle.storageClasses.length + bundle.persistentVolumes.length,
    children: storageChildren
  }

  const scopedGateways =
    namespaceFilter === 'all'
      ? bundle.gateways
      : bundle.gateways.filter((g) => g.metadata?.namespace === namespaceFilter)
  const scopedRoutes =
    namespaceFilter === 'all'
      ? bundle.httpRoutes
      : bundle.httpRoutes.filter((r) => r.metadata?.namespace === namespaceFilter)

  const gatewayClassesFolder: TreeNode = {
    id: 'gateway/gatewayclasses',
    kind: 'gatewayClassesFolder',
    name: 'gateway classes',
    count: bundle.gatewayClasses.length,
    children: bundle.gatewayClasses.map((g) => ({
      id: `gateway/gwclass/${g.metadata?.name ?? ''}`,
      kind: 'gatewayClass',
      name: g.metadata?.name ?? '',
      item: g
    }))
  }

  const allGatewaysFolder: TreeNode = {
    id: 'gateway/gateways',
    kind: 'gatewaysFolder',
    name: 'gateways',
    count: scopedGateways.length,
    children: scopedGateways.map((g) => ({
      id: `gateway/gw/${g.metadata?.namespace}/${g.metadata?.name ?? ''}`,
      kind: 'gateway',
      name: `${g.metadata?.namespace}/${g.metadata?.name ?? ''}`,
      namespace: g.metadata?.namespace,
      item: g
    }))
  }

  const allRoutesFolder: TreeNode = {
    id: 'gateway/httproutes',
    kind: 'httpRoutesFolder',
    name: 'http routes',
    count: scopedRoutes.length,
    children: scopedRoutes.map((r) => ({
      id: `gateway/route/${r.metadata?.namespace}/${r.metadata?.name ?? ''}`,
      kind: 'httpRoute',
      name: `${r.metadata?.namespace}/${r.metadata?.name ?? ''}`,
      namespace: r.metadata?.namespace,
      item: r
    }))
  }

  const gatewayFolder: TreeNode = {
    id: 'gateway',
    kind: 'gatewayFolder',
    name: 'gateway api',
    count: bundle.gatewayClasses.length + bundle.gateways.length + bundle.httpRoutes.length,
    children: [gatewayClassesFolder, allGatewaysFolder, allRoutesFolder]
  }

  const root: TreeNode = {
    id: 'cluster',
    kind: 'cluster',
    name: cluster.cluster,
    children: [nodesFolder, podsFolder, namespacesFolder, storageFolder, gatewayFolder, eventsNode]
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
