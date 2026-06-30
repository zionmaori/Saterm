// Shared TS types between main, preload, and renderer.
// Keep this file dependency-free.

export type HostId = number
export type ProjectId = number
export type SessionId = string // uuid-ish, generated in renderer

export type HostRole = 'app' | 'admin' | 'couchbase' | 'misc'
export type HostEnv = 'dev' | 'test' | 'prod' | 'other'

export interface Host {
  id: HostId
  name: string
  hostname: string
  port: number
  user: string
  identityFile: string | null
  proxyJump: string | null
  group: string | null
  role: HostRole
  env: HostEnv
  tags: string[]
  pinnedAt: number | null
  lastUsedAt: number | null
  createdAt: number
}

export interface TagCount {
  tag: string
  count: number
}

export interface GroupCount {
  group: string
  count: number
}

export type HostInput = Omit<
  Host,
  'id' | 'createdAt' | 'role' | 'env' | 'tags' | 'pinnedAt' | 'lastUsedAt'
> & {
  role?: HostRole
  env?: HostEnv
  tags?: string[]
}

export interface Snippet {
  id: number
  title: string
  body: string
  hostFilter: string | null
  confirmBeforeRun: boolean
}

export type SnippetInput = Omit<Snippet, 'id'>

export interface BugTabContext {
  kind: TabKind | null
  title: string | null
  hostName: string | null
  projectPath: string | null
  appVersion: string
  platform: NodeJS.Platform
}

export interface BugReportInput {
  title: string
  description: string
  context: BugTabContext | null
}

export interface BugReport {
  reportedAt: string
  title: string
  description: string
  context: BugTabContext | null
}

export type VcsKind = 'git' | 'svn' | 'none'

export interface Project {
  id: ProjectId
  name: string
  path: string
  vcs: VcsKind
  lastOpenedAt: number
}

export type TabKind = 'ssh' | 'local' | 'project'

export interface PersistedTab {
  id: SessionId
  kind: TabKind
  title: string
  hostId?: HostId
  projectId?: ProjectId
  cwd?: string
}

export interface PersistedLayout {
  tabs: PersistedTab[]
  activeTabId: SessionId | null
}

export interface SshConnectArgs {
  sessionId: SessionId
  hostId: HostId
  cols: number
  rows: number
}

export interface PtySpawnArgs {
  sessionId: SessionId
  cwd?: string
  cols: number
  rows: number
  shell?: string
  env?: Record<string, string>
  title?: string
}

export interface AwsProfile {
  name: string
  region: string | null
  isSso: boolean
  source: 'config' | 'credentials' | 'both'
}

export interface EksCluster {
  name: string
  profile: string
  region: string
}

export interface EksOpenArgs {
  profile: string
  region: string
  cluster: string
}

export interface EksOpenResult {
  kubeconfigPath: string
}

export interface TfFile {
  path: string
  relPath: string
}

export type TfSeverity = 'error' | 'warning'

export interface TfDiagnostic {
  severity: TfSeverity
  summary: string
  detail: string
  file?: string
  line?: number
}

export interface TfValidateResult {
  ok: boolean
  diagnostics: TfDiagnostic[]
  stderr: string
  /** Set when the CLI itself was missing or unusable. */
  cliMissing?: boolean
}

export interface TfBundle {
  files: TfFile[]
  concatenated: string
  truncated: boolean
}

export interface ShellOption {
  label: string
  path: string
}

export interface TermResizeArgs {
  sessionId: SessionId
  cols: number
  rows: number
}

export interface TermInputArgs {
  sessionId: SessionId
  data: string
}

export interface TermDataEvent {
  sessionId: SessionId
  data: string
}

export interface TermExitEvent {
  sessionId: SessionId
  code: number | null
  signal: string | null
  message?: string
}

export interface AuthPromptEvent {
  sessionId: SessionId
  hostId: HostId
  kind: 'password' | 'passphrase'
  message: string
}

export interface AuthPromptReply {
  sessionId: SessionId
  secret: string | null
  remember: boolean
}

export interface ImportSshConfigResult {
  added: number
  skipped: number
  total: number
}

// ---- AI -------------------------------------------------------------------

export type AiProvider = 'anthropic' | 'openai' | 'gemini'

export type AiKind = 'terminal' | 'editor'

export interface AiTerminalContext {
  kind: 'terminal'
  /** SSH host display name (for SSH tabs) or null for local. */
  hostName: string | null
  /** Current working directory if known (local terminals only). */
  cwd: string | null
  /** Last N lines from the xterm buffer. */
  scrollback: string
}

export interface AiEditorContext {
  kind: 'editor'
  /** Project root path. */
  projectRoot: string
  /** File being edited (absolute path). */
  filePath: string
  /** Detected language id, e.g. "typescript". */
  language: string | null
  /** Entire file contents at the time of the message. */
  fileContent: string
  /** Optional selection (line/col are 1-based, inclusive). */
  selection: {
    text: string
    startLine: number
    startCol: number
    endLine: number
    endCol: number
  } | null
}

export type AiContext = AiTerminalContext | AiEditorContext

export interface AiUserMessage {
  role: 'user'
  text: string
}

export interface AiAssistantMessage {
  role: 'assistant'
  /** Text plus tool-call cards in order. */
  blocks: Array<
    | { type: 'text'; text: string }
    | { type: 'tool_use'; id: string; name: string; input: unknown }
  >
}

export type AiMessage = AiUserMessage | AiAssistantMessage

export type AiTier = 'opus' | 'sonnet' | 'haiku'

export interface AiStreamArgs {
  streamId: string
  kind: AiKind
  context: AiContext
  history: AiMessage[]
  userText: string
  /** Optional tier override; main resolves to the actual model id. */
  tier?: AiTier
}

export interface AiUsage {
  inputTokens: number
  outputTokens: number
  cacheReadInputTokens: number
  cacheCreationInputTokens: number
}

export interface AiStartEvent {
  streamId: string
  model: string
}
export interface AiDeltaEvent {
  streamId: string
  text: string
}
export interface AiToolUseEvent {
  streamId: string
  id: string
  name: string
  input: unknown
}
export interface AiDoneEvent {
  streamId: string
  stopReason: string | null
  usage: AiUsage
}
export type AiErrorKind = 'auth' | 'rate_limit' | 'overloaded' | 'network' | 'config' | 'other'
export interface AiErrorEvent {
  streamId: string
  kind: AiErrorKind
  message: string
}

export interface AiStatus {
  available: boolean
  reason?: string
  provider: AiProvider
  /** Active default model (the one used when no tier is requested). */
  model: string
  /** Map of tier → resolved model id, for tiers the user has configured. */
  models: Partial<Record<AiTier, string>>
  /** Which providers currently have stored credentials. */
  configured: AiProvider[]
}
