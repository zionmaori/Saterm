import { useEffect, useMemo, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { useAi } from '../store/ai'
import type { AiContext, AiKind, AiMessage, AiTier } from '../../../shared/types'

const TIER_LABEL: Record<AiTier, string> = {
  opus: 'Opus',
  sonnet: 'Sonnet',
  haiku: 'Haiku'
}
const TIER_ORDER: AiTier[] = ['opus', 'sonnet', 'haiku']
import {
  classifyCommand,
  DANGEROUS_CONFIRM_PHRASE,
  SAFETY_LABELS,
  type SafetyVerdict
} from '../lib/commandSafety'

interface ProposedCommand {
  command: string
  why: string
}

interface ProposedEdit {
  unified_diff: string
  summary: string
}

export interface ChatPanelProps {
  /** A stable key identifying this conversation (tab id, file path, etc.) */
  sessionKey: string
  kind: AiKind
  /** Header label e.g. "Terminal copilot" */
  title: string
  /** Sub-label, e.g. host name or file path */
  subtitle?: string
  /** Build the context object sent with every message. Recomputed at send-time. */
  buildContext: () => AiContext
  /** Called when the user clicks "Insert" on a propose_command card. */
  onInsertCommand?: (command: string) => void
  /** Called when the user clicks "Review" on a propose_edit card. */
  onReviewEdit?: (edit: ProposedEdit) => void
  /** When true, hide the chat content (used to collapse without unmounting). */
  hidden?: boolean
  /** Called when the user clicks the X to close the panel. */
  onClose?: () => void
}

export default function ChatPanel({
  sessionKey,
  kind,
  title,
  subtitle,
  buildContext,
  onInsertCommand,
  onReviewEdit,
  hidden,
  onClose
}: ChatPanelProps): React.JSX.Element {
  const status = useAi((s) => s.status)
  const session = useAi((s) => s.sessions[sessionKey])
  const tier = useAi((s) => s.tierByKey[sessionKey])
  const send = useAi((s) => s.send)
  const cancel = useAi((s) => s.cancel)
  const reset = useAi((s) => s.reset)
  const ensure = useAi((s) => s.ensureSession)
  const setTier = useAi((s) => s.setTier)

  const availableTiers: AiTier[] = TIER_ORDER.filter((t) => status?.models?.[t])

  const [input, setInput] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    ensure(sessionKey)
  }, [sessionKey, ensure])

  // auto-scroll to bottom on new content
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight })
  }, [session?.history.length, session?.streamingText, session?.streamingTools.length])

  const submit = async (): Promise<void> => {
    if (!input.trim() || !status?.available) return
    const text = input
    setInput('')
    const ctx = buildContext()
    await send(sessionKey, kind, ctx, text)
  }

  const onKey = (e: React.KeyboardEvent<HTMLTextAreaElement>): void => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault()
      void submit()
    }
  }

  if (hidden) return <></>

  return (
    <div className="chat-panel">
      <div className="chat-header">
        <div style={{ minWidth: 0 }}>
          <div className="chat-title">{title}</div>
          {subtitle && <div className="chat-subtitle">{subtitle}</div>}
        </div>
        <div className="row">
          {availableTiers.length > 1 && (
            <select
              className="model-select"
              value={tier ?? availableTiers[0]}
              onChange={(e) => setTier(sessionKey, e.target.value as AiTier)}
              disabled={!!session?.streamId}
              title={status?.models?.[tier ?? availableTiers[0]] ?? ''}
            >
              {availableTiers.map((t) => (
                <option key={t} value={t}>
                  {TIER_LABEL[t]}
                </option>
              ))}
            </select>
          )}
          {session && session.history.length > 0 && (
            <button
              title="New conversation"
              onClick={() => reset(sessionKey)}
              style={{ padding: '2px 8px' }}
            >
              New
            </button>
          )}
          {onClose && (
            <button onClick={onClose} title="Close" style={{ padding: '2px 8px' }}>
              ×
            </button>
          )}
        </div>
      </div>

      {!status?.available && (
        <div className="chat-banner danger">
          {status?.reason ?? 'AI unavailable.'}
        </div>
      )}

      <div className="chat-scroll" ref={scrollRef}>
        {session?.history.map((m, i) => (
          <ChatMessage
            key={i}
            message={m}
            onInsertCommand={onInsertCommand}
            onReviewEdit={onReviewEdit}
          />
        ))}
        {session?.streamId && (
          <StreamingAssistant
            text={session.streamingText}
            tools={session.streamingTools}
          />
        )}
        {session?.error && (
          <div className="chat-banner danger">
            <strong>{errorLabel(session.error.kind)}:</strong> {session.error.message}
          </div>
        )}
      </div>

      <div className="chat-input">
        <textarea
          placeholder={
            status?.available
              ? kind === 'terminal'
                ? 'Ask about output, request a command… (⌘↵)'
                : 'Ask about this file, request an edit… (⌘↵)'
              : 'Set ANTHROPIC_API_KEY and relaunch to enable.'
          }
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKey}
          rows={2}
          disabled={!status?.available}
        />
        <div className="chat-input-actions">
          <div className="chat-usage" title={status?.models?.[tier ?? availableTiers[0]] ?? status?.model ?? ''}>
            {session && (session.totalUsage.inputTokens + session.totalUsage.outputTokens > 0) && (
              <>
                in {fmt(session.totalUsage.inputTokens)} ·{' '}
                out {fmt(session.totalUsage.outputTokens)}
                {session.totalUsage.cacheReadInputTokens > 0 && (
                  <> · cache {fmt(session.totalUsage.cacheReadInputTokens)}</>
                )}
              </>
            )}
          </div>
          {session?.streamId ? (
            <button onClick={() => void cancel(sessionKey)} className="danger">
              Stop
            </button>
          ) : (
            <button
              onClick={() => void submit()}
              className="primary"
              disabled={!input.trim() || !status?.available}
            >
              Send
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function fmt(n: number): string {
  if (n < 1000) return String(n)
  if (n < 1_000_000) return `${(n / 1000).toFixed(1)}k`
  return `${(n / 1_000_000).toFixed(2)}M`
}

function errorLabel(kind: string): string {
  switch (kind) {
    case 'auth':
      return 'Auth error'
    case 'rate_limit':
      return 'Rate limited'
    case 'overloaded':
      return 'Overloaded'
    case 'network':
      return 'Network error'
    case 'config':
      return 'Not configured'
    default:
      return 'Error'
  }
}

// --- one message ---

function ChatMessage({
  message,
  onInsertCommand,
  onReviewEdit
}: {
  message: AiMessage
  onInsertCommand?: (cmd: string) => void
  onReviewEdit?: (edit: ProposedEdit) => void
}): React.JSX.Element {
  if (message.role === 'user') {
    return (
      <div className="msg user">
        <div className="msg-body">{message.text}</div>
      </div>
    )
  }
  return (
    <div className="msg assistant">
      {message.blocks.map((b, i) => {
        if (b.type === 'text') return <Markdown key={i} text={b.text} />
        if (b.name === 'propose_command') {
          const input = b.input as ProposedCommand
          return (
            <CommandCard
              key={i}
              command={input.command}
              why={input.why}
              onInsert={onInsertCommand}
            />
          )
        }
        if (b.name === 'propose_edit') {
          const input = b.input as ProposedEdit
          return (
            <EditCard key={i} edit={input} onReview={onReviewEdit} />
          )
        }
        return <code key={i}>{JSON.stringify(b.input)}</code>
      })}
    </div>
  )
}

function StreamingAssistant({
  text,
  tools
}: {
  text: string
  tools: { id: string; name: string; input: unknown }[]
}): React.JSX.Element {
  return (
    <div className="msg assistant streaming">
      {text && <Markdown text={text} />}
      {tools.map((t, i) => (
        <div key={i} className="tool-pending">
          <span className="spinner" /> Preparing {t.name.replace(/_/g, ' ')}…
        </div>
      ))}
      {!text && tools.length === 0 && <span className="cursor" />}
    </div>
  )
}

function Markdown({ text }: { text: string }): React.JSX.Element {
  return (
    <div className="md">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>
    </div>
  )
}

// --- propose_command card ---

function CommandCard({
  command,
  why,
  onInsert
}: {
  command: string
  why: string
  onInsert?: (cmd: string) => void
}): React.JSX.Element {
  const verdict = useMemo<SafetyVerdict>(() => classifyCommand(command), [command])
  const [confirmText, setConfirmText] = useState('')
  const [confirming, setConfirming] = useState(false)

  const insert = (): void => {
    if (verdict.severity === 'dangerous') {
      if (confirmText.trim() !== DANGEROUS_CONFIRM_PHRASE) return
    }
    onInsert?.(command)
    setConfirmText('')
    setConfirming(false)
  }

  return (
    <div className={`cmd-card sev-${verdict.severity}`}>
      <div className="cmd-card-header">
        <span className={`sev-badge sev-${verdict.severity}`}>
          {SAFETY_LABELS[verdict.severity]}
        </span>
        <span className="cmd-card-why">{why}</span>
      </div>
      <pre className="cmd-card-body">{command}</pre>
      {verdict.severity !== 'safe' && (
        <ul className="cmd-card-reasons">
          {verdict.reasons.map((r, i) => (
            <li key={i}>{r}</li>
          ))}
        </ul>
      )}
      <div className="cmd-card-actions">
        {verdict.severity === 'dangerous' ? (
          confirming ? (
            <>
              <input
                placeholder={`Type ${DANGEROUS_CONFIRM_PHRASE} to confirm`}
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                style={{ flex: 1 }}
                autoFocus
              />
              <button onClick={() => setConfirming(false)}>Cancel</button>
              <button
                className="danger"
                onClick={insert}
                disabled={confirmText.trim() !== DANGEROUS_CONFIRM_PHRASE}
              >
                Insert anyway
              </button>
            </>
          ) : (
            <>
              <button onClick={() => navigator.clipboard.writeText(command)}>
                Copy
              </button>
              <button className="danger" onClick={() => setConfirming(true)}>
                Insert (requires confirmation)
              </button>
            </>
          )
        ) : (
          <>
            <button onClick={() => navigator.clipboard.writeText(command)}>Copy</button>
            <button className="primary" onClick={insert}>
              Insert
            </button>
          </>
        )}
      </div>
    </div>
  )
}

function EditCard({
  edit,
  onReview
}: {
  edit: ProposedEdit
  onReview?: (edit: ProposedEdit) => void
}): React.JSX.Element {
  return (
    <div className="cmd-card sev-safe">
      <div className="cmd-card-header">
        <span className="sev-badge sev-safe">Diff</span>
        <span className="cmd-card-why">{edit.summary}</span>
      </div>
      <pre className="cmd-card-body" style={{ maxHeight: 220, overflow: 'auto' }}>
        {edit.unified_diff}
      </pre>
      <div className="cmd-card-actions">
        <button onClick={() => navigator.clipboard.writeText(edit.unified_diff)}>
          Copy diff
        </button>
        <button className="primary" onClick={() => onReview?.(edit)}>
          Review in editor
        </button>
      </div>
    </div>
  )
}
