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
  onReady?: (editor: editor.IStandaloneCodeEditor) => void
}

export function CodeEditor({
  value,
  language,
  onChange,
  readOnly,
  onSelectionChange,
  onReady
}: Props): React.JSX.Element {
  return (
    <Editor
      theme="vs-dark"
      value={value}
      language={language}
      onChange={(v) => onChange?.(v ?? '')}
      onMount={(ed) => {
        if (onSelectionChange) {
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
        }
        onReady?.(ed)
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
