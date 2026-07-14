export interface KubeEnv {
  kubeconfigPath: string
  profile: string
  region: string
}

export interface KubeItem {
  kind?: string
  apiVersion?: string
  metadata?: {
    name?: string
    namespace?: string
    creationTimestamp?: string
    labels?: Record<string, string>
    uid?: string
    ownerReferences?: Array<{
      apiVersion?: string
      kind?: string
      name?: string
      uid?: string
      controller?: boolean
    }>
  }
  spec?: Record<string, unknown>
  status?: Record<string, unknown>
  data?: Record<string, unknown>
  type?: string
}

export interface ListPayload {
  items?: KubeItem[]
}

export type TreeKind =
  | 'cluster'
  | 'nodesFolder'
  | 'node'
  | 'namespacesFolder'
  | 'namespace'
  | 'workloadsFolder'
  | 'deploymentsFolder'
  | 'deployment'
  | 'replicaset'
  | 'pod'
  | 'podsFolder'
  | 'servicesFolder'
  | 'service'
  | 'ingressesFolder'
  | 'ingress'
  | 'configmapsFolder'
  | 'configmap'
  | 'secretsFolder'
  | 'secret'
  | 'nodePodsFolder'
  | 'orphanPodsFolder'
  | 'otherPodsFolder'
  | 'otherWorkload'
  | 'unscheduledPodsFolder'
  | 'eventsFolder'
  | 'storageFolder'
  | 'storageClassesFolder'
  | 'storageClass'
  | 'pvsFolder'
  | 'pv'
  | 'storageClustersFolder'
  | 'storageCluster'
  | 'pvcsFolder'
  | 'pvc'
  | 'resourceQuotasFolder'
  | 'resourceQuota'
  | 'limitRangesFolder'
  | 'limitRange'
  | 'networkPoliciesFolder'
  | 'networkPolicy'
  | 'serviceAccountsFolder'
  | 'serviceAccount'
  | 'gatewayClassesFolder'
  | 'gatewayClass'
  | 'gatewaysFolder'
  | 'gateway'
  | 'httpRoutesFolder'
  | 'httpRoute'
  | 'gatewayFolder'

export type StatusKind = 'ok' | 'warn' | 'err'

export interface TreeNode {
  id: string
  kind: TreeKind
  name: string
  namespace?: string
  count?: number
  status?: StatusKind
  item?: KubeItem
  children?: TreeNode[]
}

export interface KubeBundle {
  cluster: Record<string, unknown> | null
  nodes: KubeItem[]
  namespaces: KubeItem[]
  pods: KubeItem[]
  deployments: KubeItem[]
  replicasets: KubeItem[]
  services: KubeItem[]
  ingresses: KubeItem[]
  configmaps: KubeItem[]
  secrets: KubeItem[]
  storageClasses: KubeItem[]
  persistentVolumes: KubeItem[]
  persistentVolumeClaims: KubeItem[]
  storageClusters: KubeItem[]
  resourceQuotas: KubeItem[]
  limitRanges: KubeItem[]
  networkPolicies: KubeItem[]
  serviceAccounts: KubeItem[]
  gatewayClasses: KubeItem[]
  gateways: KubeItem[]
  httpRoutes: KubeItem[]
}

export interface EksClusterCtx {
  profile: string
  region: string
  cluster: string
}
