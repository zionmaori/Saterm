export type ChipIntent = 'neutral' | 'success' | 'warning' | 'danger' | 'info' | 'magenta'

/** Pick a color intent based on a tag string. `prod` → danger-tinted,
 *  `dev`/`test` → info, `couchbase`/`db` → magenta, otherwise neutral. */
export function intentForTag(tag: string): ChipIntent {
  const t = tag.toLowerCase()
  if (t === 'prod' || t === 'production') return 'danger'
  if (t === 'test' || t === 'staging') return 'warning'
  if (t === 'dev' || t === 'development') return 'info'
  if (t === 'couchbase' || t === 'db' || t === 'database') return 'magenta'
  if (t === 'app' || t === 'admin') return 'success'
  return 'neutral'
}
