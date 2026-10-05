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
  dump: 'sql',
  dockerfile: 'dockerfile'
}

export function languageFor(path: string): string | undefined {
  const lower = path.toLowerCase()
  if (lower.endsWith('/dockerfile') || lower.endsWith('\\dockerfile')) return 'dockerfile'
  const ext = lower.split('.').pop()
  if (!ext) return undefined
  return EXT_LANG[ext]
}
