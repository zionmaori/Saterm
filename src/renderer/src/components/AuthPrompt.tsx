import { useRef, useState } from 'react'
import type { AuthPromptEvent } from '../../../shared/types'

interface Props {
  event: AuthPromptEvent
  onReply: (secret: string | null, remember: boolean) => void
}

export default function AuthPrompt({ event, onReply }: Props): React.JSX.Element {
  const [secret, setSecret] = useState('')
  const [remember, setRemember] = useState(true)
  const secretRef = useRef<HTMLInputElement>(null)

  // Blur the password field before it (potentially) unmounts. Submitting via
  // Enter or Cancel removes this dialog in the same React commit, and on
  // macOS a focused password input that's yanked out of the DOM without a
  // clean blur can leave the OS's secure-event-input mode stuck on — which
  // then silently swallows Ctrl-key combos app-wide until restart.
  const reply = (s: string | null, r: boolean): void => {
    secretRef.current?.blur()
    onReply(s, r)
  }

  return (
    <div className="dialog-backdrop">
      <form
        className="dialog"
        onSubmit={(e) => {
          e.preventDefault()
          reply(secret, remember)
        }}
      >
        <h2>{event.message}</h2>
        <div className="col">
          <label>{event.kind === 'passphrase' ? 'Passphrase' : 'Password'}</label>
          <input
            ref={secretRef}
            type="password"
            value={secret}
            onChange={(e) => setSecret(e.target.value)}
            autoFocus
          />
        </div>
        <div className="row">
          <input
            id="remember"
            type="checkbox"
            checked={remember}
            onChange={(e) => setRemember(e.target.checked)}
            style={{ width: 'auto' }}
          />
          <label htmlFor="remember" style={{ marginLeft: 6 }}>
            Save in macOS Keychain
          </label>
        </div>
        <div className="row" style={{ justifyContent: 'flex-end', marginTop: 14 }}>
          <button type="button" onClick={() => reply(null, false)}>
            Cancel
          </button>
          <button type="submit" className="primary">
            Connect
          </button>
        </div>
      </form>
    </div>
  )
}
