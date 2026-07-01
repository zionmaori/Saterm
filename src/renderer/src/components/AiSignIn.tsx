import { useState } from 'react'
import { ExternalLink, KeyRound, Terminal } from 'lucide-react'
import { useAi } from '../store/ai'
import type { AiProvider } from '../../../shared/types'

const PROVIDER_LABELS: Record<AiProvider, string> = {
  anthropic: 'Claude',
  openai: 'OpenAI',
  gemini: 'Gemini'
}

const PROVIDER_CONSOLE_URL: Record<AiProvider, string> = {
  anthropic: 'https://console.anthropic.com/settings/keys',
  openai: 'https://platform.openai.com/api-keys',
  gemini: 'https://aistudio.google.com/app/apikey'
}

const PROVIDER_KEY_PLACEHOLDER: Record<AiProvider, string> = {
  anthropic: 'sk-ant-...',
  openai: 'sk-...',
  gemini: 'AIza...'
}

const PROVIDER_CONSOLE_LABEL: Record<AiProvider, string> = {
  anthropic: 'console.anthropic.com',
  openai: 'platform.openai.com',
  gemini: 'aistudio.google.com'
}

const PROVIDERS: AiProvider[] = ['anthropic', 'openai', 'gemini']

interface Props {
  reason?: string
  currentProvider?: AiProvider
}

export default function AiSignIn({ reason, currentProvider }: Props): React.JSX.Element {
  const refreshStatus = useAi((s) => s.refreshStatus)
  const [tab, setTab] = useState<AiProvider>(currentProvider ?? 'anthropic')
  const [apiKey, setApiKey] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const clearError = (): void => setError(null)

  const switchTab = (p: AiProvider): void => {
    setTab(p)
    setApiKey('')
    clearError()
  }

  const signInWithClaudeCode = async (): Promise<void> => {
    if (busy) return
    setBusy(true)
    clearError()
    try {
      const status = await window.api.ai.signInWithClaudeCode()
      if (!status.available) {
        setError(status.reason ?? 'Sign-in failed.')
        return
      }
      await refreshStatus()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const submit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault()
    if (!apiKey.trim() || busy) return
    setBusy(true)
    clearError()
    try {
      const status = await window.api.ai.signInWithProvider(tab, apiKey.trim())
      if (!status.available) {
        setError(status.reason ?? 'Sign-in failed.')
        return
      }
      setApiKey('')
      await refreshStatus()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="ai-signin">
      <div className="ai-signin-icon">
        <KeyRound size={20} strokeWidth={1.8} />
      </div>
      <h2>Sign in to use AI</h2>

      {reason && reason !== 'AI not initialized' && !reason.startsWith('No credentials') && (
        <div className="ai-signin-hint">{reason}</div>
      )}

      {/* Provider tabs */}
      <div className="ai-provider-tabs">
        {PROVIDERS.map((p) => (
          <button
            key={p}
            type="button"
            className={`ai-provider-tab${tab === p ? ' active' : ''}`}
            onClick={() => switchTab(p)}
          >
            {PROVIDER_LABELS[p]}
          </button>
        ))}
      </div>

      {/* Claude tab */}
      {tab === 'anthropic' && (
        <>
          <button
            type="button"
            className="ai-signin-cta primary"
            onClick={signInWithClaudeCode}
            disabled={busy}
          >
            <Terminal size={14} strokeWidth={2} />
            {busy ? 'Connecting…' : 'Continue with Claude Code'}
          </button>
          <p className="ai-signin-blurb">
            Uses your existing Claude Code subscription — no API credits needed.
          </p>
          <div className="ai-signin-divider">
            <span>or use an API key</span>
          </div>
        </>
      )}

      {/* Console link */}
      <button
        type="button"
        className="ai-signin-cta"
        onClick={() => window.open(PROVIDER_CONSOLE_URL[tab], '_blank')}
      >
        Open {PROVIDER_CONSOLE_LABEL[tab]} <ExternalLink size={12} strokeWidth={2} />
      </button>

      <form onSubmit={submit} className="ai-signin-form">
        <label htmlFor="ai-key">Paste API key</label>
        <input
          id="ai-key"
          type="password"
          autoComplete="off"
          spellCheck={false}
          placeholder={PROVIDER_KEY_PLACEHOLDER[tab]}
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          disabled={busy}
        />
        <button type="submit" className="primary" disabled={busy || !apiKey.trim()}>
          {busy ? 'Signing in…' : `Sign in with ${PROVIDER_LABELS[tab]}`}
        </button>
      </form>

      {error && <div className="ai-signin-error">{error}</div>}

      <p className="ai-signin-foot">
        Keys are stored in your OS keychain. Sign out from the chat header any time.
      </p>
    </div>
  )
}
