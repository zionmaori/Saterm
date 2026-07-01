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
  | 'unscheduledPodsFolder'
  | 'eventsFolder'

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
}

export interface EksClusterCtx {
  profile: string
  region: string
  cluster: string
}
