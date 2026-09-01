import { useState } from 'react'
import { RotateCcw, X } from 'lucide-react'
import Modal from './Modal'
import {
  DEFAULT_TERM,
  DEFAULT_UI,
  TERM_GROUPS,
  UI_GROUPS,
  getResolvedMode,
  loadCustomColors,
  saveCustomColors,
  type CustomColors,
  type Mode,
  type TermColorKey,
  type UiColorKey
} from '../lib/theme'

interface Props {
  onClose: () => void
}

type Tab = 'ui' | 'terminal'

const HEX_RE = /^#[0-9a-fA-F]{6}$/

function HexInput({
  value,
  onCommit
}: {
  value: string
  onCommit: (v: string) => void
}): React.JSX.Element {
  const [draft, setDraft] = useState(value)
  const [syncedValue, setSyncedValue] = useState(value)
  // Sync local draft when the committed value changes externally (mode
  // switch, reset, or the paired color swatch) — done during render, per
  // React's "adjusting state on prop change" pattern, rather than in an
  // effect, so it doesn't cost an extra render pass.
  if (value !== syncedValue) {
    setSyncedValue(value)
    setDraft(value)
  }
  return (
    <input
      type="text"
      className="theme-field-hex"
      value={draft}
      spellCheck={false}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        if (HEX_RE.test(draft)) onCommit(draft)
        else setDraft(value)
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
        else if (e.key === 'Escape') setDraft(value)
      }}
    />
  )
}

function ColorField({
  label,
  value,
  overridden,
  onChange,
  onReset
}: {
  label: string
  value: string
  overridden: boolean
  onChange: (v: string) => void
  onReset: () => void
}): React.JSX.Element {
  return (
    <div className="theme-field">
      <input
        type="color"
        className="theme-field-swatch"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        title={label}
      />
      <span className="theme-field-label">{label}</span>
      <HexInput value={value} onCommit={onChange} />
      <button
        type="button"
        className="theme-field-reset"
        onClick={onReset}
        disabled={!overridden}
        title={overridden ? 'Reset to default' : 'Using default'}
      >
        <RotateCcw size={11} strokeWidth={2} />
      </button>
    </div>
  )
}

export default function ThemeEditor({ onClose }: Props): React.JSX.Element {
  const [colors, setColors] = useState<CustomColors>(() => loadCustomColors())
  const [mode, setMode] = useState<Mode>(() => getResolvedMode())
  const [tab, setTab] = useState<Tab>('ui')

  const setUi = (key: UiColorKey, value: string | null): void => {
    setColors((prev) => {
      const ui = { ...prev[mode].ui }
      if (value) ui[key] = value
      else delete ui[key]
      const next: CustomColors = { ...prev, [mode]: { ...prev[mode], ui } }
      saveCustomColors(next)
      return next
    })
  }

  const setTerm = (key: TermColorKey, value: string | null): void => {
    setColors((prev) => {
      const term = { ...prev[mode].term }
      if (value) term[key] = value
      else delete term[key]
      const next: CustomColors = { ...prev, [mode]: { ...prev[mode], term } }
      saveCustomColors(next)
      return next
    })
  }

  const resetPalette = (): void => {
    setColors((prev) => {
      const next: CustomColors = { ...prev, [mode]: { ui: {}, term: {} } }
      saveCustomColors(next)
      return next
    })
  }

  const modeHasOverrides =
    Object.keys(colors[mode].ui).length > 0 || Object.keys(colors[mode].term).length > 0

  return (
    <Modal onClose={onClose}>
      <div
        className="theme-editor"
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="theme-editor-header">
          <div className="notes-modal-title">Customize colors</div>
          <div className="theme-editor-header-controls">
            <div className="notes-mode-toggle">
              <button
                type="button"
                className={`notes-scope-btn ${mode === 'dark' ? 'active' : ''}`}
                onClick={() => setMode('dark')}
              >
                Dark
              </button>
              <button
                type="button"
                className={`notes-scope-btn ${mode === 'light' ? 'active' : ''}`}
                onClick={() => setMode('light')}
              >
                Light
              </button>
            </div>
            <div className="notes-mode-toggle">
              <button
                type="button"
                className={`notes-scope-btn ${tab === 'ui' ? 'active' : ''}`}
                onClick={() => setTab('ui')}
              >
                Interface
              </button>
              <button
                type="button"
                className={`notes-scope-btn ${tab === 'terminal' ? 'active' : ''}`}
                onClick={() => setTab('terminal')}
              >
                Terminal
              </button>
            </div>
            <button
              type="button"
              className="notes-modal-close"
              onClick={onClose}
              title="Close (Esc)"
            >
              <X size={14} strokeWidth={2} />
            </button>
          </div>
        </div>

        <div className="theme-editor-body">
          {tab === 'ui'
            ? UI_GROUPS.map((group) => (
                <div className="theme-group" key={group.label}>
                  <div className="theme-group-label">{group.label}</div>
                  <div className="theme-group-fields">
                    {group.keys.map(({ key, label }) => (
                      <ColorField
                        key={key}
                        label={label}
                        value={colors[mode].ui[key] ?? DEFAULT_UI[mode][key]}
                        overridden={key in colors[mode].ui}
                        onChange={(v) => setUi(key, v)}
                        onReset={() => setUi(key, null)}
                      />
                    ))}
                  </div>
                </div>
              ))
            : TERM_GROUPS.map((group) => (
                <div className="theme-group" key={group.label}>
                  <div className="theme-group-label">{group.label}</div>
                  <div className="theme-group-fields">
                    {group.keys.map(({ key, label }) => (
                      <ColorField
                        key={key}
                        label={label}
                        value={colors[mode].term[key] ?? (DEFAULT_TERM[mode][key] as string)}
                        overridden={key in colors[mode].term}
                        onChange={(v) => setTerm(key, v)}
                        onReset={() => setTerm(key, null)}
                      />
                    ))}
                  </div>
                </div>
              ))}
        </div>

        <div className="notes-modal-footer">
          <span className="notes-modal-hint">
            Editing the {mode} palette · changes apply live to matching windows
          </span>
          <button
            type="button"
            className="ghost"
            disabled={!modeHasOverrides}
            onClick={resetPalette}
          >
            Reset {mode} palette
          </button>
        </div>
      </div>
    </Modal>
  )
}
