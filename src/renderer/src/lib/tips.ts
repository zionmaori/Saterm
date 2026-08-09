/* Tips + suggestions engine.
 *
 * Each tip has a category (used for filtering and iconography), a short title,
 * and a body. Some tips are context-aware — they carry a `when` predicate that
 * receives a lightweight context snapshot and returns whether the tip is
 * currently relevant. The dispatcher prefers context-relevant tips over the
 * generic pool when picking. */

export type TipCategory = 'terminal' | 'git' | 'k8s' | 'terraform' | 'editor' | 'general'

export interface TipContext {
  activeKind: 'ssh' | 'local' | 'project' | 'eks' | null
  hasProjects: boolean
  hasHosts: boolean
  hasAwsProfiles: boolean
  hasUnstagedChanges: boolean
  currentBranch: string | null
  isMac: boolean
}

export interface Tip {
  id: string
  category: TipCategory
  title: string
  body: string
  when?: (ctx: TipContext) => boolean
}

const mod = (isMac: boolean): string => (isMac ? '⌘' : 'Ctrl')

/* Base tips — workflow-focused. Context predicates gate a subset. */
export const TIPS: Tip[] = [
  {
    id: 'palette',
    category: 'general',
    title: 'Warp to anywhere',
    body: 'Press ⌘K to open the command palette. Fuzzy-search hosts, projects, and clusters — no more sidebar hunting.'
  },
  {
    id: 'quick-open',
    category: 'editor',
    title: 'Instant file jump',
    body: 'Inside a project, ⌘P opens files by name. Type fragments — src/App matches src/renderer/src/App.tsx.',
    when: (c) => c.activeKind === 'project'
  },
  {
    id: 'grep',
    category: 'editor',
    title: 'Grep across the repo',
    body: '⌘⇧F opens a full-project grep. Use ripgrep-style patterns for speed.',
    when: (c) => c.activeKind === 'project'
  },
  {
    id: 'copilot',
    category: 'terminal',
    title: 'AI in your terminal',
    body: 'Press ⌘J to open the Terminal Copilot on the active tab. Ask questions, generate commands, review output.'
  },
  {
    id: 'toggle-sidebar',
    category: 'general',
    title: 'Full-screen focus',
    body: '⌘B collapses the sidebar. Great for demos or when you just want the terminal.'
  },
  {
    id: 'pin-host',
    category: 'terminal',
    title: 'Pin your fleet',
    body: 'Click the star on any host in the sidebar — pinned hosts float to the top and survive across sessions.',
    when: (c) => c.hasHosts
  },
  {
    id: 'tags',
    category: 'terminal',
    title: 'Tag hosts, filter fast',
    body: 'Tag hosts (#prod, #db, #staging) then click chips in the sidebar to filter. ⌘-click to combine.',
    when: (c) => c.hasHosts
  },
  {
    id: 'import-ssh',
    category: 'terminal',
    title: 'Import your ssh config',
    body: 'Click the gear icon in the Hosts section to import ~/.ssh/config in one shot.',
    when: (c) => !c.hasHosts
  },
  {
    id: 'snippets',
    category: 'terminal',
    title: 'Reusable snippets',
    body: 'Save common commands as Snippets in the sidebar. Confirm-before-run makes destructive ones safe.'
  },
  {
    id: 'multi-cols',
    category: 'terminal',
    title: 'Split terminals',
    body: 'Drag a terminal tab beside another to open a second column — great for tailing logs alongside a shell.'
  },
  {
    id: 'git-panel',
    category: 'git',
    title: 'Stage and commit in place',
    body: 'The Git panel on the right of every project shows changes, lets you stage lines, and commit — no context switch.',
    when: (c) => c.activeKind === 'project'
  },
  {
    id: 'git-branches',
    category: 'git',
    title: 'Switch branches fast',
    body: 'Use the branch dropdown at the top of the Git panel. Uncommitted changes carry over safely.',
    when: (c) => c.activeKind === 'project' && c.currentBranch !== null
  },
  {
    id: 'git-uncommitted',
    category: 'git',
    title: 'You have uncommitted work',
    body: 'The Git panel shows your dirty files. Stage what you want, write a message, commit — all right there.',
    when: (c) => c.activeKind === 'project' && c.hasUnstagedChanges
  },
  {
    id: 'k8s-dashboard',
    category: 'k8s',
    title: 'Cluster overview at a glance',
    body: 'Click an EKS cluster in the sidebar to open the dashboard: pods, services, config maps, live logs.',
    when: (c) => c.hasAwsProfiles
  },
  {
    id: 'k8s-terminal',
    category: 'k8s',
    title: 'kubectl for that cluster',
    body: 'The terminal icon next to a cluster spawns a shell with the right KUBECONFIG and context pre-set.',
    when: (c) => c.hasAwsProfiles
  },
  {
    id: 'k8s-region',
    category: 'k8s',
    title: 'Multi-region clusters',
    body: 'Change the region dropdown on any AWS profile in the sidebar to browse clusters in another region.',
    when: (c) => c.hasAwsProfiles
  },
  {
    id: 'terraform-drift',
    category: 'terraform',
    title: 'Plan without leaving your editor',
    body: 'The Terraform tab beside Git runs plan/apply in-place and surfaces diagnostics inline.',
    when: (c) => c.activeKind === 'project'
  },
  {
    id: 'notes',
    category: 'editor',
    title: 'Notes are one click away',
    body: 'Open the Notes popup from the titlebar. Toggle between Global notes and This project — plain markdown, autosaved.',
    when: (c) => c.hasProjects
  },
  {
    id: 'tasks',
    category: 'editor',
    title: 'Track work per project',
    body: 'The Tasks panel is scoped per project or global. Filter by state, priority, or due date.'
  },
  {
    id: 'editor-tabs',
    category: 'editor',
    title: 'Tab through open files',
    body: 'Ctrl+Tab cycles editor tabs inside a project. Middle-click closes.'
  },
  {
    id: 'help',
    category: 'general',
    title: 'The full manual',
    body: 'Click the ? icon in the titlebar for the complete keyboard and workflow guide.'
  },
  {
    id: 'auto-reconnect',
    category: 'terminal',
    title: 'Reconnects survive naps',
    body: 'Close the lid, walk away — Saterm re-establishes SSH sessions in the background when the network returns.'
  },
  {
    id: 'search-in-file',
    category: 'editor',
    title: 'Find in the current file',
    body: 'Standard find works in the editor. ⌘G / ⌘⇧G steps through matches.',
    when: (c) => c.activeKind === 'project'
  },
  {
    id: 'reveal',
    category: 'editor',
    title: 'Right-click for context',
    body: 'Right-click any file in the tree — rename, reveal in Finder, run in terminal, and more.',
    when: (c) => c.activeKind === 'project'
  }
]

const CATEGORY_LABEL: Record<TipCategory, string> = {
  terminal: 'Terminal',
  git: 'Git',
  k8s: 'Kubernetes',
  terraform: 'Terraform',
  editor: 'Editor',
  general: 'General'
}

export function categoryLabel(c: TipCategory): string {
  return CATEGORY_LABEL[c]
}

/* Deterministic day-of-year index so the "tip of the day" is stable. */
function dayIndex(): number {
  const now = new Date()
  const start = new Date(now.getFullYear(), 0, 0)
  const diff = now.getTime() - start.getTime()
  return Math.floor(diff / 86_400_000)
}

/* Substitute {mod} shortcuts based on OS. */
function renderTip(tip: Tip, ctx: TipContext): Tip {
  const swap = (s: string): string => s.replace(/⌘/g, mod(ctx.isMac))
  return { ...tip, title: swap(tip.title), body: swap(tip.body) }
}

export function tipOfTheDay(ctx: TipContext): Tip {
  const relevant = TIPS.filter((t) => !t.when || t.when(ctx))
  const pool = relevant.length > 0 ? relevant : TIPS
  return renderTip(pool[dayIndex() % pool.length], ctx)
}

export function contextualTip(ctx: TipContext, seed: number): Tip {
  // Prefer tips whose predicate matches; fall back to general tips.
  const scoped = TIPS.filter((t) => t.when && t.when(ctx))
  if (scoped.length > 0) return renderTip(scoped[seed % scoped.length], ctx)
  const generic = TIPS.filter((t) => !t.when)
  return renderTip(generic[seed % generic.length], ctx)
}

export function shortHint(ctx: TipContext, seed: number): string {
  const tip = contextualTip(ctx, seed)
  return tip.title
}
