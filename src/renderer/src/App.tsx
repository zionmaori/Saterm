import { useEffect, useState } from 'react'
import { useApp } from './store/app'
import { useAi } from './store/ai'
import Sidebar from './components/Sidebar'
import TabBar from './components/TabBar'
import TerminalPane from './components/TerminalPane'
import LocalTerminalView from './components/LocalTerminalView'
import ProjectView from './components/ProjectView'
import EksDashboard from './components/EksDashboard'
import AuthPrompt from './components/AuthPrompt'
import CommandPalette from './components/CommandPalette'
import TerminalCopilot from './components/TerminalCopilot'
import Titlebar, { type Theme } from './components/Titlebar'
import HelpModal from './components/HelpModal'
import OnboardingWizard from './components/OnboardingWizard'
import type { AuthPromptEvent, OnboardingStatus } from '../../shared/types'

function readLS<T extends string>(key: string, fallback: T): T {
  try {
    return (localStorage.getItem(key) as T) ?? fallback
  } catch {
    return fallback
  }
}

export default function App(): React.JSX.Element {
  const ready = useApp((s) => s.ready)
  const tabs = useApp((s) => s.tabs)
  const activeTabId = useApp((s) => s.activeTabId)
  const projects = useApp((s) => s.projects)
  const restoreLayout = useApp((s) => s.restoreLayout)
  const refreshProjects = useApp((s) => s.refreshProjects)
  const refreshHosts = useApp((s) => s.refreshHosts)
  const refreshAwsProfiles = useApp((s) => s.refreshAwsProfiles)

  const [authQueue, setAuthQueue] = useState<AuthPromptEvent[]>([])
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [quickOpenOpen, setQuickOpenOpen] = useState(false)
  const [terminalCopilotOpen, setTerminalCopilotOpen] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(
    () => readLS<string>('sidebarOpen', 'true') !== 'false'
  )
  const [theme, setTheme] = useState<Theme>(() => readLS<Theme>('theme', 'dark'))
  const [helpOpen, setHelpOpen] = useState(false)
  const [onboardingStatus, setOnboardingStatus] = useState<OnboardingStatus | null>(null)

  const installAiListeners = useAi((s) => s.installListeners)
  const refreshAiStatus = useAi((s) => s.refreshStatus)

  // Apply theme class to <html>
  useEffect(() => {
    const html = document.documentElement
    html.classList.remove('theme-light', 'theme-system')
    if (theme === 'light') html.classList.add('theme-light')
    else if (theme === 'system') html.classList.add('theme-system')
    localStorage.setItem('theme', theme)
  }, [theme])

  useEffect(() => {
    localStorage.setItem('sidebarOpen', String(sidebarOpen))
  }, [sidebarOpen])

  useEffect(() => {
    void restoreLayout()
  }, [restoreLayout])

  // Onboarding: check status once the app is ready. If not completed, show
  // the wizard as a top-level overlay.
  useEffect(() => {
    if (!ready) return
    let cancelled = false
    void window.api.onboarding.status().then((s) => {
      if (!cancelled && !s.completed) setOnboardingStatus(s)
    })
    return () => {
      cancelled = true
    }
  }, [ready])

  useEffect(() => {
    installAiListeners()
    void refreshAiStatus()
  }, [installAiListeners, refreshAiStatus])

  useEffect(() => {
    const off = window.api.ssh.onAuthPrompt((e) => setAuthQueue((q) => [...q, e]))
    return off
  }, [])

  useEffect(() => {
    const handler = (e: KeyboardEvent): void => {
      const meta = e.metaKey || e.ctrlKey
      if (meta && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setPaletteOpen(true)
      } else if (meta && e.key.toLowerCase() === 'p' && !e.shiftKey) {
        e.preventDefault()
        setQuickOpenOpen(true)
      } else if (meta && e.key.toLowerCase() === 'j') {
        e.preventDefault()
        setTerminalCopilotOpen((v) => !v)
      } else if (meta && e.key.toLowerCase() === 'b') {
        e.preventDefault()
        setSidebarOpen((v) => !v)
      } else if (e.key === 'Escape') {
        setPaletteOpen(false)
        setQuickOpenOpen(false)
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [])

  const activeTab = tabs.find((t) => t.id === activeTabId) ?? null
  const activeProjectTab = activeTab?.kind === 'project' ? activeTab : null
  const activeProject = activeProjectTab
    ? (projects.find((p) => p.id === activeProjectTab.projectId) ?? null)
    : null

  const onAuthReply = (secret: string | null, remember: boolean): void => {
    const current = authQueue[0]
    if (current) void window.api.ssh.authReply(current.sessionId, secret, remember)
    setAuthQueue((q) => q.slice(1))
  }

  if (!ready) return <div className="empty">Loading…</div>

  return (
    <div className="app">
      <Titlebar
        onOpenPalette={() => setPaletteOpen(true)}
        sidebarOpen={sidebarOpen}
        onToggleSidebar={() => setSidebarOpen((v) => !v)}
        theme={theme}
        onTheme={setTheme}
        onHelp={() => setHelpOpen(true)}
      />
      <div className={`main${sidebarOpen ? '' : ' sidebar-hidden'}`}>
        <Sidebar />
        <div className="content">
          <TabBar />
          <div className="pane">
            {tabs.length === 0 && (
              <div className="welcome">
                <h1>Termion</h1>
                <div>Pick a host or project from the sidebar, or press ⌘K.</div>
              </div>
            )}
            {tabs.map((t) => {
              const visible = t.id === activeTabId
              if (t.kind === 'project') return <ProjectView key={t.id} tab={t} visible={visible} />
              if (t.kind === 'eks') return <EksDashboard key={t.id} tab={t} visible={visible} />
              if (t.kind === 'local')
                return <LocalTerminalView key={t.id} tab={t} visible={visible} />
              return <TerminalPane key={t.id} tab={t} visible={visible} />
            })}
          </div>
        </div>
      </div>

      {terminalCopilotOpen &&
        activeTab &&
        (() => {
          const target =
            activeTab.kind === 'project'
              ? ((
                  window as Window & {
                    __termionProjectTerm?: Map<string, import('./store/app').Tab>
                  }
                ).__termionProjectTerm?.get(activeTab.id) ?? null)
              : activeTab
          if (!target) return null
          return (
            <div className="copilot-drawer">
              <TerminalCopilot tab={target} onClose={() => setTerminalCopilotOpen(false)} />
            </div>
          )
        })()}

      {helpOpen && <HelpModal onClose={() => setHelpOpen(false)} />}
      {onboardingStatus && (
        <OnboardingWizard
          status={onboardingStatus}
          onFinish={() => {
            setOnboardingStatus(null)
            void refreshProjects()
            void refreshHosts()
            void refreshAwsProfiles()
          }}
        />
      )}
      {authQueue[0] && <AuthPrompt event={authQueue[0]} onReply={onAuthReply} />}

      <CommandPalette open={paletteOpen} mode="palette" onClose={() => setPaletteOpen(false)} />
      <CommandPalette
        open={quickOpenOpen}
        mode="quickopen"
        onClose={() => setQuickOpenOpen(false)}
        projectRoot={activeProject?.path}
        onOpenFile={(path) => {
          document.dispatchEvent(new CustomEvent('termion:open-file', { detail: { path } }))
        }}
      />
    </div>
  )
}
