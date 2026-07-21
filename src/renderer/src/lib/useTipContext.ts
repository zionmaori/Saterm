import { useEffect, useState } from 'react'
import { useApp } from '../store/app'
import type { TipContext } from './tips'

/* Assemble a lightweight TipContext from stores + platform.
 * Used by the tip-of-the-day dialog, the sidebar widget, and the titlebar
 * rotating hint. Cheap enough to recompute on every store change. */
export function useTipContext(): TipContext {
  const tabs = useApp((s) => s.tabs)
  const activeTabId = useApp((s) => s.activeTabId)
  const projects = useApp((s) => s.projects)
  const hosts = useApp((s) => s.hosts)
  const awsProfiles = useApp((s) => s.awsProfiles)

  const activeTab = tabs.find((t) => t.id === activeTabId) ?? null

  // Platform — read lazily; falls back to Mac-ish shortcut labels until known.
  const [isMac, setIsMac] = useState<boolean>(true)
  useEffect(() => {
    let cancelled = false
    void window.api.app.platform().then((p) => {
      if (!cancelled) setIsMac(p === 'darwin')
    })
    return () => {
      cancelled = true
    }
  }, [])

  // Not tracking git state here — the Git panel keeps its own store. Any
  // suggestion that depends on `hasUnstagedChanges` degrades to "generic"
  // when this is false, which is fine.
  return {
    activeKind: (activeTab?.kind as TipContext['activeKind']) ?? null,
    hasProjects: projects.length > 0,
    hasHosts: hosts.length > 0,
    hasAwsProfiles: awsProfiles.length > 0,
    hasUnstagedChanges: false,
    currentBranch: null,
    isMac
  }
}
