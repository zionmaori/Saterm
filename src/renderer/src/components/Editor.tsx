import Editor, { DiffEditor } from '@monaco-editor/react'
import type { editor } from 'monaco-editor'

export interface Selection {
  text: string
  startLine: number
  startCol: number
  endLine: number
  endCol: number
}

interface Props {
  value: string
  language?: string
  onChange?: (v: string) => void
  readOnly?: boolean
  onSelectionChange?: (sel: Selection | null) => void
}

export function CodeEditor({
  value,
  language,
  onChange,
  readOnly,
  onSelectionChange
}: Props): React.JSX.Element {
  return (
    <Editor
      theme="vs-dark"
      value={value}
      language={language}
      onChange={(v) => onChange?.(v ?? '')}
      onMount={(ed) => {
        if (!onSelectionChange) return
        ed.onDidChangeCursorSelection((e) => {
          const sel = e.selection
          if (sel.isEmpty()) {
            onSelectionChange(null)
            return
          }
          const model = ed.getModel()
          const text = model ? model.getValueInRange(sel) : ''
          onSelectionChange({
            text,
            startLine: sel.startLineNumber,
            startCol: sel.startColumn,
            endLine: sel.endLineNumber,
            endCol: sel.endColumn
          })
        })
      }}
      options={
        {
          readOnly,
          fontFamily: 'ui-monospace, SFMono-Regular, "JetBrains Mono", Menlo, monospace',
          fontSize: 13,
          minimap: { enabled: false },
          scrollBeyondLastLine: true,
          automaticLayout: true,
          renderWhitespace: 'selection',
          tabSize: 2
        } as editor.IStandaloneEditorConstructionOptions
      }
    />
  )
}

interface DiffProps {
  original: string
  modified: string
  language?: string
}

export function DiffView({ original, modified, language }: DiffProps): React.JSX.Element {
  return (
    <DiffEditor
      theme="vs-dark"
      original={original}
      modified={modified}
      language={language}
      options={{
        readOnly: true,
        fontFamily: 'ui-monospace, SFMono-Regular, "JetBrains Mono", Menlo, monospace',
        fontSize: 13,
        minimap: { enabled: false },
        renderSideBySide: true,
        automaticLayout: true
      }}
    />
  )
}

const EXT_LANG: Record<string, string> = {
  ts: 'typescript',
  tsx: 'typescript',
  js: 'javascript',
  jsx: 'javascript',
  json: 'json',
  md: 'markdown',
  py: 'python',
  rb: 'ruby',
  go: 'go',
  rs: 'rust',
  java: 'java',
  c: 'c',
  h: 'c',
  cpp: 'cpp',
  hpp: 'cpp',
  cs: 'csharp',
  php: 'php',
  sh: 'shell',
  bash: 'shell',
  zsh: 'shell',
  yaml: 'yaml',
  yml: 'yaml',
  toml: 'ini',
  ini: 'ini',
  xml: 'xml',
  html: 'html',
  css: 'css',
  scss: 'scss',
  sql: 'sql',
  dockerfile: 'dockerfile'
}

export function languageFor(path: string): string | undefined {
  const lower = path.toLowerCase()
  if (lower.endsWith('/dockerfile') || lower.endsWith('\\dockerfile')) return 'dockerfile'
  const ext = lower.split('.').pop()
  if (!ext) return undefined
  return EXT_LANG[ext]
}
