import { useState } from 'react'
import ChatPanel from './ChatPanel'
import { DiffView } from './Editor'
import { languageFor } from './languages'
import { applyUnifiedDiff } from '../lib/applyDiff'
import type { AiContext } from '../../../shared/types'

interface Props {
  projectRoot: string
  /** absolute file path; null if no file open */
  filePath: string | null
  /** current editor buffer */
  fileContent: string
  /** current selection, or null */
  selection: {
    text: string
    startLine: number
    startCol: number
    endLine: number
    endCol: number
  } | null
  /** Called after the user accepts a proposed edit — apply text to the editor. */
  onApply: (newContent: string) => Promise<void>
  onClose: () => void
}

interface PendingEdit {
  unified_diff: string
  summary: string
  appliedText: string | null // null if applyPatch failed
}

export default function EditorCopilot({
  projectRoot,
  filePath,
  fileContent,
  selection,
  onApply,
  onClose
}: Props): React.JSX.Element {
  const [pending, setPending] = useState<PendingEdit | null>(null)

  const buildContext = (): AiContext => ({
    kind: 'editor',
    projectRoot,
    filePath: filePath ?? '(no file)',
    language: filePath ? (languageFor(filePath) ?? null) : null,
    fileContent,
    selection
  })

  const onReviewEdit = (edit: { unified_diff: string; summary: string }): void => {
    const applied = applyUnifiedDiff(fileContent, edit.unified_diff)
    setPending({
      unified_diff: edit.unified_diff,
      summary: edit.summary,
      appliedText: applied
    })
  }

  const accept = async (): Promise<void> => {
    if (!pending?.appliedText) return
    await onApply(pending.appliedText)
    setPending(null)
  }

  if (!filePath) {
    return (
      <div className="chat-panel">
        <div className="chat-header">
          <div className="chat-title">Editor copilot</div>
          <button onClick={onClose} style={{ padding: '2px 8px' }}>
            ×
          </button>
        </div>
        <div className="empty">Open a file to chat about it.</div>
      </div>
    )
  }

  if (pending) {
    return (
      <div className="chat-panel">
        <div className="chat-header">
          <div>
            <div className="chat-title">Proposed edit</div>
            <div className="chat-subtitle">{pending.summary}</div>
          </div>
          <div className="row">
            <button onClick={() => setPending(null)}>Back</button>
            <button onClick={onClose} style={{ padding: '2px 8px' }}>
              ×
            </button>
          </div>
        </div>
        <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
          {pending.appliedText !== null ? (
            <DiffView
              original={fileContent}
              modified={pending.appliedText}
              language={languageFor(filePath)}
            />
          ) : (
            <div className="empty">
              The diff didn't apply cleanly. Raw patch shown — copy and apply manually if needed:
              <pre
                style={{
                  textAlign: 'left',
                  margin: '12px',
                  padding: '8px',
                  background: 'var(--bg-2)',
                  fontSize: 11,
                  maxHeight: 320,
                  overflow: 'auto'
                }}
              >
                {pending.unified_diff}
              </pre>
            </div>
          )}
        </div>
        <div className="chat-input-actions">
          <span className="chat-usage">{filePath.split('/').pop()}</span>
          <button onClick={() => setPending(null)}>Reject</button>
          <button className="primary" onClick={accept} disabled={pending.appliedText === null}>
            Apply
          </button>
        </div>
      </div>
    )
  }

  return (
    <ChatPanel
      sessionKey={`edit:${filePath}`}
      kind="editor"
      title="Editor copilot"
      subtitle={filePath.split('/').pop()}
      buildContext={buildContext}
      onReviewEdit={onReviewEdit}
      onClose={onClose}
    />
  )
}
