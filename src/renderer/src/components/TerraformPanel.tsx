import { useEffect, useMemo, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  RefreshCw,
  XCircle
} from 'lucide-react'
import { useApp } from '../store/app'
import { useAi } from '../store/ai'
import type { TfDiagnostic } from '../../../shared/types'

interface Props {
  projectId: number
  repoPath: string
  visible: boolean
}

export default function TerraformPanel({ projectId, repoPath, visible }: Props): React.JSX.Element {
  const run = useApp((s) => s.terraformRuns[projectId])
  const analyze = useApp((s) => s.analyzeTerraform)
  const aiStatus = useAi((s) => s.status)
  const refreshStatus = useAi((s) => s.refreshStatus)
  const session = useAi((s) => s.sessions[`tf:${projectId}`])

  const [diagnosticsOpen, setDiagnosticsOpen] = useState(true)

  // Auto-run once on first focus when AI is available.
  useEffect(() => {
    if (!visible) return
    if (!aiStatus) {
      void refreshStatus()
      return
    }
    if (!aiStatus.available) return
    if (run && run.status !== 'idle') return
    void analyze(projectId, repoPath)
  }, [visible, projectId, repoPath, run, aiStatus, refreshStatus, analyze])

  const isStreaming = !!session?.streamId
  const liveText = session?.streamingText ?? ''
  const completedText = useMemo(() => {
    if (!session?.history?.length) return ''
    const last = session.history[session.history.length - 1]
    if (last?.role !== 'assistant') return ''
    return last.blocks
      .filter((b) => b.type === 'text')
      .map((b) => (b as { type: 'text'; text: string }).text)
      .join('')
  }, [session?.history])
  const markdown = liveText || completedText
  const aiError = session?.error ?? null

  const validate = run?.validate ?? null
  const errors = validate?.diagnostics.filter((d) => d.severity === 'error') ?? []
  const warnings = validate?.diagnostics.filter((d) => d.severity === 'warning') ?? []

  return (
    <div className="tf-panel">
      <div className="tf-header">
        <StatusPill run={run} isStreaming={isStreaming} />
        <span style={{ flex: 1 }}>
          {run?.filesIncluded ? (
            <span className="tf-meta">
              {run.filesIncluded} file{run.filesIncluded === 1 ? '' : 's'}
              {run.truncated && ' · truncated'}
            </span>
          ) : null}
        </span>
        <button
          className="sidebar2-icon"
          title="Re-run validate and analysis"
          disabled={run?.status === 'running' || isStreaming}
          onClick={() => {
            void analyze(projectId, repoPath)
          }}
        >
          <RefreshCw size={13} />
        </button>
      </div>

      {!aiStatus?.available && (
        <div className="tf-note">
          AI is not configured. Sign in via the AI sidebar to enable analysis. Validate output still
          works.
        </div>
      )}

      {run?.error && <div className="tf-error">{run.error}</div>}

      {validate && (
        <div className="tf-section">
          <button className="tf-section-header" onClick={() => setDiagnosticsOpen((v) => !v)}>
            {diagnosticsOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
            <span>Validate</span>
            {validate.cliMissing ? (
              <span className="tf-pill tf-pill-warn">CLI missing</span>
            ) : errors.length > 0 ? (
              <span className="tf-pill tf-pill-err">
                {errors.length} error{errors.length === 1 ? '' : 's'}
              </span>
            ) : warnings.length > 0 ? (
              <span className="tf-pill tf-pill-warn">
                {warnings.length} warning{warnings.length === 1 ? '' : 's'}
              </span>
            ) : (
              <span className="tf-pill tf-pill-ok">valid</span>
            )}
          </button>
          {diagnosticsOpen && (
            <div className="tf-section-body">
              {validate.cliMissing && (
                <div className="tf-diag tf-diag-warn">
                  <AlertTriangle size={12} />
                  <div className="tf-diag-body">
                    <div className="tf-diag-summary">
                      {validate.stderr || 'Terraform CLI not found.'}
                    </div>
                  </div>
                </div>
              )}
              {!validate.cliMissing && validate.diagnostics.length === 0 && !validate.stderr && (
                <div className="tf-diag tf-diag-ok">
                  <CheckCircle2 size={12} />
                  <div className="tf-diag-body">
                    <div className="tf-diag-summary">No issues from `terraform validate`.</div>
                  </div>
                </div>
              )}
              {!validate.cliMissing && validate.stderr && validate.diagnostics.length === 0 && (
                <div className="tf-diag tf-diag-warn">
                  <AlertTriangle size={12} />
                  <div className="tf-diag-body">
                    <div className="tf-diag-summary">terraform validate could not run</div>
                    <pre className="tf-diag-detail">{validate.stderr}</pre>
                  </div>
                </div>
              )}
              {validate.diagnostics.map((d, i) => (
                <DiagnosticRow key={i} d={d} />
              ))}
            </div>
          )}
        </div>
      )}

      <div
        className="tf-section"
        style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}
      >
        <div className="tf-section-header tf-static">
          <span>AI analysis</span>
          {isStreaming && <span className="tf-pill tf-pill-stream">streaming…</span>}
        </div>
        <div className="tf-section-body tf-markdown">
          {aiError && <div className="tf-error">{aiError.message}</div>}
          {!markdown && !aiError && (
            <div className="tf-empty">
              {!aiStatus?.available
                ? 'Configure AI to see the analysis.'
                : run?.status === 'running'
                  ? 'Waiting for AI…'
                  : 'No analysis yet. Click refresh to run.'}
            </div>
          )}
          {markdown && (
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {markdown + (isStreaming ? ' ▍' : '')}
            </ReactMarkdown>
          )}
        </div>
      </div>
    </div>
  )
}

function StatusPill({
  run,
  isStreaming
}: {
  run: ReturnType<typeof useApp.getState>['terraformRuns'][number] | undefined
  isStreaming: boolean
}): React.JSX.Element {
  if (!run || run.status === 'idle') return <span className="tf-status">idle</span>
  if (run.status === 'running' || isStreaming)
    return <span className="tf-status tf-status-run">running</span>
  if (run.status === 'error') return <span className="tf-status tf-status-err">error</span>
  return <span className="tf-status tf-status-ok">done</span>
}

function DiagnosticRow({ d }: { d: TfDiagnostic }): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const klass = d.severity === 'error' ? 'tf-diag tf-diag-err' : 'tf-diag tf-diag-warn'
  return (
    <div className={klass}>
      {d.severity === 'error' ? <XCircle size={12} /> : <AlertTriangle size={12} />}
      <div className="tf-diag-body">
        <div
          className="tf-diag-summary"
          onClick={() => d.detail && setOpen((v) => !v)}
          style={{ cursor: d.detail ? 'pointer' : 'default' }}
        >
          {d.file && (
            <span className="tf-diag-loc">
              {d.file}
              {d.line ? `:${d.line}` : ''}
            </span>
          )}
          <span>{d.summary}</span>
        </div>
        {open && d.detail && <pre className="tf-diag-detail">{d.detail}</pre>}
      </div>
    </div>
  )
}
