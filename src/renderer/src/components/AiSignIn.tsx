import { useState } from 'react'
import { ExternalLink, KeyRound } from 'lucide-react'
import { useAi } from '../store/ai'

const KEYS_URL = 'https://console.anthropic.com/settings/keys'

interface Props {
  reason?: string
}

/**
 * Sign-in pane shown inside the chat panel when AI is unavailable.
 * Browser login is intentionally a "go get a key, paste it back" flow — there
 * is no public OAuth API for third-party apps to authenticate against
 * Anthropic, so this is the supported path (same as Cursor, Zed, etc.).
 *
 * The pasted key is validated with a tiny count_tokens call before it lands
 * in macOS Keychain, so a bad paste fails loudly instead of breaking later.
 */
export default function AiSignIn({ reason }: Props): React.JSX.Element {
  const refreshStatus = useAi((s) => s.refreshStatus)
  const [apiKey, setApiKey] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const openKeysPage = (): void => {
    // setWindowOpenHandler in main routes target=_blank to shell.openExternal,
    // which opens in the user's default browser instead of an Electron window.
    window.open(KEYS_URL, '_blank')
  }

  const submit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault()
    if (!apiKey.trim() || busy) return
    setBusy(true)
    setError(null)
    try {
      const status = await window.api.ai.signIn(apiKey.trim())
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
      <p className="ai-signin-blurb">
        Termion calls Claude through the Anthropic API. Use an API key from your
        personal Anthropic account — your local shell&apos;s env vars take priority
        if you set them.
      </p>

      {reason && reason !== 'AI not initialized' && (
        <div className="ai-signin-hint">{reason}</div>
      )}

      <button
        type="button"
        className="ai-signin-cta"
        onClick={openKeysPage}
      >
        Open console.anthropic.com <ExternalLink size={12} strokeWidth={2} />
      </button>

      <form onSubmit={submit} className="ai-signin-form">
        <label htmlFor="ai-key">Paste API key</label>
        <input
          id="ai-key"
          type="password"
          autoComplete="off"
          spellCheck={false}
          placeholder="sk-ant-..."
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          disabled={busy}
        />
        <button
          type="submit"
          className="primary"
          disabled={busy || !apiKey.trim()}
        >
          {busy ? 'Validating…' : 'Sign in'}
        </button>
      </form>

      {error && <div className="ai-signin-error">{error}</div>}

      <p className="ai-signin-foot">
        The key is stored in your OS keychain under <code>Termion / anthropic:apiKey</code>.
        You can sign out from the chat header any time.
      </p>
    </div>
  )
}
