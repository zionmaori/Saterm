import { create } from 'zustand'
import { v4 as uuid } from 'uuid'
import type {
  AiContext,
  AiDeltaEvent,
  AiDoneEvent,
  AiErrorEvent,
  AiKind,
  AiMessage,
  AiStartEvent,
  AiStatus,
  AiTier,
  AiToolUseEvent,
  AiUsage
} from '../../../shared/types'

export interface AiSessionState {
  history: AiMessage[]
  /** id of an in-flight stream, if any */
  streamId: string | null
  /** accumulated text of the assistant turn currently streaming */
  streamingText: string
  /** tool_use blocks emitted during the current stream */
  streamingTools: { id: string; name: string; input: unknown }[]
  totalUsage: AiUsage
  error: { kind: string; message: string } | null
}

interface AiState {
  status: AiStatus | null
  sessions: Record<string, AiSessionState>
  /** Per-session tier choice. Falls back to the server default when unset. */
  tierByKey: Record<string, AiTier>
  refreshStatus: () => Promise<void>
  ensureSession: (key: string) => AiSessionState
  setTier: (key: string, tier: AiTier) => void
  send: (key: string, kind: AiKind, context: AiContext, text: string) => Promise<void>
  cancel: (key: string) => Promise<void>
  reset: (key: string) => void
  /** Listener installer — call once at app boot. */
  installListeners: () => void
}

const blankSession = (): AiSessionState => ({
  history: [],
  streamId: null,
  streamingText: '',
  streamingTools: [],
  totalUsage: {
    inputTokens: 0,
    outputTokens: 0,
    cacheReadInputTokens: 0,
    cacheCreationInputTokens: 0
  },
  error: null
})

/**
 * `key` uniquely identifies a chat thread. The Terminal copilot uses the
 * terminal tab id; the Editor copilot uses the absolute file path. Switching
 * key forks a clean conversation but the system prompt cache (server-side) is
 * reused since the preamble is byte-identical across keys of the same kind.
 */
export const useAi = create<AiState>((set, get) => ({
  status: null,
  sessions: {},
  tierByKey: {},

  refreshStatus: async () => {
    const status = await window.api.ai.status()
    set({ status })
  },

  setTier: (key, tier) =>
    set((state) => ({ tierByKey: { ...state.tierByKey, [key]: tier } })),

  ensureSession: (key) => {
    let s = get().sessions[key]
    if (!s) {
      s = blankSession()
      set((state) => ({ sessions: { ...state.sessions, [key]: s! } }))
    }
    return s
  },

  send: async (key, kind, context, text) => {
    const sess = get().ensureSession(key)
    if (sess.streamId) return // already streaming

    const userMsg: AiMessage = { role: 'user', text }
    const history = [...sess.history, userMsg]
    const streamId = uuid()

    set((state) => ({
      sessions: {
        ...state.sessions,
        [key]: {
          ...sess,
          history,
          streamId,
          streamingText: '',
          streamingTools: [],
          error: null
        }
      }
    }))

    // Tag the stream with the session key so the listener routes it correctly.
    streamKeys.set(streamId, key)

    try {
      await window.api.ai.stream({
        streamId,
        kind,
        context,
        history: sess.history, // do NOT include the new userMsg — context+text are sent server-side
        userText: text,
        tier: get().tierByKey[key]
      })
    } catch (err) {
      // ipc-level failure (very rare)
      set((state) => {
        const cur = state.sessions[key]
        if (!cur) return state
        return {
          sessions: {
            ...state.sessions,
            [key]: {
              ...cur,
              streamId: null,
              error: { kind: 'other', message: (err as Error).message }
            }
          }
        }
      })
    }
  },

  cancel: async (key) => {
    const sess = get().sessions[key]
    if (!sess?.streamId) return
    await window.api.ai.cancel(sess.streamId)
  },

  reset: (key) => {
    set((state) => ({
      sessions: { ...state.sessions, [key]: blankSession() }
    }))
  },

  installListeners: () => {
    window.api.ai.onStart((evt) => apply(evt, onStart))
    window.api.ai.onDelta((evt) => apply(evt, onDelta))
    window.api.ai.onToolUse((evt) => apply(evt, onToolUse))
    window.api.ai.onDone((evt) => apply(evt, onDone))
    window.api.ai.onError((evt) => apply(evt, onError))
  }
}))

// streamId -> session key map (lives outside zustand state to keep it simple)
const streamKeys = new Map<string, string>()

type Apply<E> = (key: string, sess: AiSessionState, evt: E) => Partial<AiSessionState>

function apply<E extends { streamId: string }>(evt: E, fn: Apply<E>): void {
  const key = streamKeys.get(evt.streamId)
  if (!key) return
  useAi.setState((state) => {
    const sess = state.sessions[key]
    if (!sess) return state
    const patch = fn(key, sess, evt)
    return { sessions: { ...state.sessions, [key]: { ...sess, ...patch } } }
  })
}

const onStart: Apply<AiStartEvent> = (_k, _s) => ({ error: null })

const onDelta: Apply<AiDeltaEvent> = (_k, sess, evt) => ({
  streamingText: sess.streamingText + evt.text
})

const onToolUse: Apply<AiToolUseEvent> = (_k, sess, evt) => ({
  streamingTools: [
    ...sess.streamingTools,
    { id: evt.id, name: evt.name, input: evt.input }
  ]
})

const onDone: Apply<AiDoneEvent> = (_k, sess, evt) => {
  streamKeys.delete(evt.streamId)
  if (evt.stopReason === 'cancelled') {
    return { streamId: null, streamingText: '', streamingTools: [] }
  }
  const assistant: AiMessage = {
    role: 'assistant',
    blocks: [
      ...(sess.streamingText ? [{ type: 'text' as const, text: sess.streamingText }] : []),
      ...sess.streamingTools.map((t) => ({
        type: 'tool_use' as const,
        id: t.id,
        name: t.name,
        input: t.input
      }))
    ]
  }
  return {
    streamId: null,
    streamingText: '',
    streamingTools: [],
    history: [...sess.history, assistant],
    totalUsage: {
      inputTokens: sess.totalUsage.inputTokens + evt.usage.inputTokens,
      outputTokens: sess.totalUsage.outputTokens + evt.usage.outputTokens,
      cacheReadInputTokens:
        sess.totalUsage.cacheReadInputTokens + evt.usage.cacheReadInputTokens,
      cacheCreationInputTokens:
        sess.totalUsage.cacheCreationInputTokens + evt.usage.cacheCreationInputTokens
    }
  }
}

const onError: Apply<AiErrorEvent> = (_k, sess, evt) => {
  streamKeys.delete(evt.streamId)
  // drop the user message we just added since the turn failed — restore prior history
  const history =
    sess.history.length > 0 && sess.history[sess.history.length - 1].role === 'user'
      ? sess.history.slice(0, -1)
      : sess.history
  return {
    streamId: null,
    streamingText: '',
    streamingTools: [],
    history,
    error: { kind: evt.kind, message: evt.message }
  }
}
