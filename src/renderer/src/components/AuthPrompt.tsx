import { useEffect, useState } from 'react'
import type { AuthPromptEvent } from '../../../shared/types'

interface Props {
  event: AuthPromptEvent
  onReply: (secret: string | null, remember: boolean) => void
}

export default function AuthPrompt({ event, onReply }: Props): React.JSX.Element {
  const [secret, setSecret] = useState('')
  const [remember, setRemember] = useState(true)

  useEffect(() => {
    setSecret('')
  }, [event.sessionId])

  return (
    <div className="dialog-backdrop">
      <form
        className="dialog"
        onSubmit={(e) => {
          e.preventDefault()
          onReply(secret, remember)
        }}
      >
        <h2>{event.message}</h2>
        <div className="col">
          <label>{event.kind === 'passphrase' ? 'Passphrase' : 'Password'}</label>
          <input
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
          <button type="button" onClick={() => onReply(null, false)}>
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
