import { useEffect, useMemo, useRef, useState } from 'react'
import { Code2, Eye, FolderOpen, RefreshCw, Save } from 'lucide-react'
import type { Tab } from '../store/app'
import { CodeEditor, languageFor } from './Editor'

interface Props {
  tab: Tab
  visible: boolean
}

type HtmlMode = 'preview' | 'source'

export default function FileView({ tab, visible }: Props): React.JSX.Element {
  const filePath = tab.filePath ?? ''
  const isHtml = tab.fileContent === 'html'

  const [text, setText] = useState<string>('')
  const [originalText, setOriginalText] = useState<string>('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [htmlMode, setHtmlMode] = useState<HtmlMode>('preview')
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  // Track the current Blob URL so we can revoke it before making a new one.
  const previewUrlRef = useRef<string | null>(null)

  const language = useMemo(() => languageFor(filePath), [filePath])
  const dirty = text !== originalText

  const load = async (): Promise<void> => {
    if (!filePath) return
    setLoading(true)
    setError(null)
    try {
      if (isHtml) {
        // Read binary for the iframe (Blob URL preserves relative-asset
        // resolution against the file's own origin). Also decode a UTF-8
        // text view for the source toggle + potential editing.
        const bytes = await window.api.fs.readBinary(filePath)
        // Copy into a fresh ArrayBuffer to satisfy Blob's BlobPart type
        // regardless of the runtime SharedArrayBuffer flavor.
        const buf = new ArrayBuffer(bytes.byteLength)
        new Uint8Array(buf).set(bytes)
        const blob = new Blob([buf], { type: 'text/html' })
        const url = URL.createObjectURL(blob)
        if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current)
        previewUrlRef.current = url
        setPreviewUrl(url)
        const decoded = new TextDecoder('utf-8').decode(bytes)
        setText(decoded)
        setOriginalText(decoded)
      } else {
        const s = await window.api.fs.readText(filePath)
        setText(s)
        setOriginalText(s)
      }
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
    return () => {
      if (previewUrlRef.current) {
        URL.revokeObjectURL(previewUrlRef.current)
        previewUrlRef.current = null
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filePath])

  const save = async (): Promise<void> => {
    if (!filePath || !dirty) return
    setSaving(true)
    try {
      await window.api.fs.writeText(filePath, text)
      setOriginalText(text)
      // For HTML files we also need to refresh the preview Blob URL so the
      // iframe re-renders the edited contents.
      if (isHtml && htmlMode === 'preview') {
        const bytes = new TextEncoder().encode(text)
        const buf = new ArrayBuffer(bytes.byteLength)
        new Uint8Array(buf).set(bytes)
        const blob = new Blob([buf], { type: 'text/html' })
        const url = URL.createObjectURL(blob)
        if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current)
        previewUrlRef.current = url
        setPreviewUrl(url)
      }
    } catch (e) {
      alert(`Save failed: ${(e as Error).message}`)
    } finally {
      setSaving(false)
    }
  }

  // Cmd/Ctrl+S when this tab is active.
  useEffect(() => {
    if (!visible) return
    const handler = (e: KeyboardEvent): void => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
        e.preventDefault()
        void save()
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, text, originalText, filePath, htmlMode])

  const reveal = (): void => {
    if (filePath) void window.api.shell.showItem(filePath)
  }

  return (
    <div className="file-view" style={{ display: visible ? 'flex' : 'none' }}>
      <div className="file-view-toolbar">
        <div className="file-view-title" title={filePath}>
          <span className="file-view-name">{tab.title}</span>
          <span className="file-view-path">{filePath}</span>
        </div>
        <div className="file-view-actions">
          {isHtml && (
            <div className="file-view-mode" role="tablist">
              <button
                className={htmlMode === 'preview' ? 'active' : ''}
                onClick={() => setHtmlMode('preview')}
                title="Rendered preview"
                role="tab"
                aria-selected={htmlMode === 'preview'}
              >
                <Eye size={12} strokeWidth={2} /> Preview
              </button>
              <button
                className={htmlMode === 'source' ? 'active' : ''}
                onClick={() => setHtmlMode('source')}
                title="HTML source"
                role="tab"
                aria-selected={htmlMode === 'source'}
              >
                <Code2 size={12} strokeWidth={2} /> Source
              </button>
            </div>
          )}
          <button onClick={() => void load()} title="Reload from disk">
            <RefreshCw size={12} strokeWidth={2} /> Reload
          </button>
          <button onClick={reveal} title="Reveal in file manager">
            <FolderOpen size={12} strokeWidth={2} /> Reveal
          </button>
          <button
            onClick={() => void save()}
            disabled={!dirty || saving}
            title="Save (⌘S)"
            className={dirty ? 'primary' : ''}
          >
            <Save size={12} strokeWidth={2} /> {dirty ? 'Save*' : 'Saved'}
          </button>
        </div>
      </div>
      <div className="file-view-body">
        {loading && <div className="file-view-status">Loading…</div>}
        {error && <div className="file-view-status error">Error: {error}</div>}
        {!loading && !error && isHtml && htmlMode === 'preview' && previewUrl && (
          <iframe
            className="file-view-preview"
            src={previewUrl}
            sandbox="allow-same-origin"
            title={tab.title}
          />
        )}
        {!loading && !error && (!isHtml || htmlMode === 'source') && (
          <CodeEditor
            value={text}
            onChange={setText}
            language={language ?? (isHtml ? 'html' : undefined)}
          />
        )}
      </div>
    </div>
  )
}
