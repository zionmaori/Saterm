import type { ITheme } from '@xterm/xterm'

// Manual color customization — lets the user override individual tokens from
// tokens.css (the "Interface" palette) and individual xterm ANSI colors (the
// "Terminal" palette) on top of whichever base theme (dark/light) is active.
// Overrides are stored per resolved mode so switching dark/light/system still
// makes sense while colors are customized.

export type Mode = 'dark' | 'light'

export const UI_GROUPS: { label: string; keys: { key: UiColorKey; label: string }[] }[] = [
  {
    label: 'Surfaces',
    keys: [
      { key: 'bg', label: 'Background' },
      { key: 'bg-1', label: 'Background 1' },
      { key: 'bg-2', label: 'Background 2' },
      { key: 'bg-3', label: 'Background 3' },
      { key: 'bg-elevated', label: 'Elevated' }
    ]
  },
  {
    label: 'Borders',
    keys: [
      { key: 'border', label: 'Border' },
      { key: 'border-2', label: 'Border 2' },
      { key: 'border-strong', label: 'Border (strong)' }
    ]
  },
  {
    label: 'Text',
    keys: [
      { key: 'text', label: 'Text' },
      { key: 'text-dim', label: 'Text (dim)' },
      { key: 'text-dimer', label: 'Text (dimmer)' }
    ]
  },
  {
    label: 'Accents',
    keys: [
      { key: 'accent', label: 'Accent' },
      { key: 'accent-2', label: 'Accent 2' }
    ]
  },
  {
    label: 'Semantic',
    keys: [
      { key: 'danger', label: 'Danger' },
      { key: 'green', label: 'Success' },
      { key: 'yellow', label: 'Warning' },
      { key: 'magenta', label: 'Magenta' }
    ]
  }
]

export type UiColorKey =
  | 'bg'
  | 'bg-1'
  | 'bg-2'
  | 'bg-3'
  | 'bg-elevated'
  | 'border'
  | 'border-2'
  | 'border-strong'
  | 'text'
  | 'text-dim'
  | 'text-dimer'
  | 'accent'
  | 'accent-2'
  | 'danger'
  | 'green'
  | 'yellow'
  | 'magenta'

export const UI_KEYS: UiColorKey[] = UI_GROUPS.flatMap((g) => g.keys.map((k) => k.key))

export const DEFAULT_UI: Record<Mode, Record<UiColorKey, string>> = {
  dark: {
    bg: '#06070d',
    'bg-1': '#0b0e1a',
    'bg-2': '#10152a',
    'bg-3': '#1a2144',
    'bg-elevated': '#1c2450',
    border: '#212a4d',
    'border-2': '#2c3663',
    'border-strong': '#46527d',
    text: '#e8ecff',
    'text-dim': '#9aa3d1',
    'text-dimer': '#6d75a4',
    accent: '#6dd0ff',
    'accent-2': '#ffb066',
    danger: '#ff6b7a',
    green: '#7ee2b8',
    yellow: '#f0c674',
    magenta: '#c39aff'
  },
  light: {
    bg: '#eef3fb',
    'bg-1': '#e3ebf7',
    'bg-2': '#d7e0f0',
    'bg-3': '#c3cee2',
    'bg-elevated': '#dfe6f4',
    border: '#b5c1d9',
    'border-2': '#97a5c3',
    'border-strong': '#7986a5',
    text: '#1a2140',
    'text-dim': '#4a5578',
    'text-dimer': '#6f7a9a',
    accent: '#0a75d1',
    'accent-2': '#c26208',
    danger: '#c62d3c',
    green: '#1a7f37',
    yellow: '#9a6700',
    magenta: '#7a4bc9'
  }
}

export const TERM_GROUPS: { label: string; keys: { key: TermColorKey; label: string }[] }[] = [
  {
    label: 'General',
    keys: [
      { key: 'background', label: 'Background' },
      { key: 'foreground', label: 'Foreground' },
      { key: 'cursor', label: 'Cursor' },
      { key: 'cursorAccent', label: 'Cursor accent' },
      { key: 'selectionBackground', label: 'Selection' }
    ]
  },
  {
    label: 'ANSI',
    keys: [
      { key: 'black', label: 'Black' },
      { key: 'red', label: 'Red' },
      { key: 'green', label: 'Green' },
      { key: 'yellow', label: 'Yellow' },
      { key: 'blue', label: 'Blue' },
      { key: 'magenta', label: 'Magenta' },
      { key: 'cyan', label: 'Cyan' },
      { key: 'white', label: 'White' }
    ]
  },
  {
    label: 'Bright ANSI',
    keys: [
      { key: 'brightBlack', label: 'Bright black' },
      { key: 'brightRed', label: 'Bright red' },
      { key: 'brightGreen', label: 'Bright green' },
      { key: 'brightYellow', label: 'Bright yellow' },
      { key: 'brightBlue', label: 'Bright blue' },
      { key: 'brightMagenta', label: 'Bright magenta' },
      { key: 'brightCyan', label: 'Bright cyan' },
      { key: 'brightWhite', label: 'Bright white' }
    ]
  }
]

export type TermColorKey =
  | 'background'
  | 'foreground'
  | 'cursor'
  | 'cursorAccent'
  | 'selectionBackground'
  | 'black'
  | 'red'
  | 'green'
  | 'yellow'
  | 'blue'
  | 'magenta'
  | 'cyan'
  | 'white'
  | 'brightBlack'
  | 'brightRed'
  | 'brightGreen'
  | 'brightYellow'
  | 'brightBlue'
  | 'brightMagenta'
  | 'brightCyan'
  | 'brightWhite'

export const TERM_KEYS: TermColorKey[] = TERM_GROUPS.flatMap((g) => g.keys.map((k) => k.key))

export const DEFAULT_TERM: Record<Mode, ITheme> = {
  dark: {
    background: '#06070d',
    foreground: '#e8ecff',
    cursor: '#7ee2b8',
    cursorAccent: '#06070d',
    selectionBackground: '#264f78',
    black: '#484f58',
    red: '#ff7b72',
    green: '#3fb950',
    yellow: '#d29922',
    blue: '#58a6ff',
    magenta: '#bc8cff',
    cyan: '#39c5cf',
    white: '#b1bac4',
    brightBlack: '#6e7681',
    brightRed: '#ffa198',
    brightGreen: '#56d364',
    brightYellow: '#e3b341',
    brightBlue: '#79c0ff',
    brightMagenta: '#d2a8ff',
    brightCyan: '#56d4dd',
    brightWhite: '#f0f6fc'
  },
  light: {
    background: '#eef3fb',
    foreground: '#1a2140',
    cursor: '#0a75d1',
    cursorAccent: '#eef3fb',
    selectionBackground: '#cfe3fa',
    black: '#3a4363',
    red: '#c62d3c',
    green: '#1a7f37',
    yellow: '#9a6700',
    blue: '#0a75d1',
    magenta: '#7a4bc9',
    cyan: '#0a7ea3',
    white: '#4a5578',
    brightBlack: '#6f7a9a',
    brightRed: '#e0374a',
    brightGreen: '#2ea043',
    brightYellow: '#bf8700',
    brightBlue: '#3b8fe0',
    brightMagenta: '#9068d6',
    brightCyan: '#1596bd',
    brightWhite: '#1a2140'
  }
}

interface ModeOverrides {
  ui: Partial<Record<UiColorKey, string>>
  term: Partial<Record<TermColorKey, string>>
}

export interface CustomColors {
  dark: ModeOverrides
  light: ModeOverrides
}

function emptyOverrides(): CustomColors {
  return { dark: { ui: {}, term: {} }, light: { ui: {}, term: {} } }
}

const STORAGE_KEY = 'customColors'
export const COLORS_CHANGED_EVENT = 'termion:colors-changed'

export function loadCustomColors(): CustomColors {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return emptyOverrides()
    const parsed = JSON.parse(raw) as Partial<CustomColors>
    return {
      dark: { ui: parsed.dark?.ui ?? {}, term: parsed.dark?.term ?? {} },
      light: { ui: parsed.light?.ui ?? {}, term: parsed.light?.term ?? {} }
    }
  } catch {
    return emptyOverrides()
  }
}

export function saveCustomColors(colors: CustomColors): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(colors))
  applyUiColors()
  window.dispatchEvent(new Event(COLORS_CHANGED_EVENT))
}

export function hasCustomColors(): boolean {
  const c = loadCustomColors()
  return (
    Object.keys(c.dark.ui).length > 0 ||
    Object.keys(c.dark.term).length > 0 ||
    Object.keys(c.light.ui).length > 0 ||
    Object.keys(c.light.term).length > 0
  )
}

export function getResolvedMode(): Mode {
  const html = document.documentElement
  if (html.classList.contains('theme-light')) return 'light'
  if (html.classList.contains('theme-system')) {
    return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
  }
  return 'dark'
}

// Applies the current mode's UI overrides as inline custom properties on
// <html>. Inline style always wins over the class-selector rules in
// tokens.css, so this layers cleanly on top of dark/light/system.
export function applyUiColors(): void {
  const mode = getResolvedMode()
  const overrides = loadCustomColors()[mode].ui
  const root = document.documentElement.style
  for (const key of UI_KEYS) {
    const val = overrides[key]
    if (val) root.setProperty(`--${key}`, val)
    else root.removeProperty(`--${key}`)
  }
}

export function getTerminalTheme(): ITheme {
  const mode = getResolvedMode()
  return { ...DEFAULT_TERM[mode], ...loadCustomColors()[mode].term }
}
