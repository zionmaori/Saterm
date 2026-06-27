// Derive role (app/admin/misc) and env (dev/test/prod/other) from a hostname.
//
// Hostname conventions observed in this user's fleet:
//   - role is the alpha prefix before the first digit or dash: app01 → app
//   - env is a single-letter segment in the FQDN: .d. dev, .t. test, .p. prod
//   - bare IPs, names without env letters, and public hosts (github.com) fall
//     into env=other.

export type Role = 'app' | 'admin' | 'couchbase' | 'misc'
export type Env = 'dev' | 'test' | 'prod' | 'other'

const APP_PREFIXES = new Set([
  'app',
  'pyapp',
  'lapp',
  'leaderboard',
  'leadboardpoc',
  'leadtest',
  'seastarspoc'
])

const ADMIN_PREFIXES = new Set(['admin', 'authadmin', 'mgmt', 'opsmgmt'])

const COUCHBASE_PREFIXES = new Set(['cb', 'cbfloat'])

export function categorize(hostname: string): { role: Role; env: Env } {
  const lower = hostname.toLowerCase()

  // env: look for a single-letter env segment between dots
  const env: Env = /\.d\./.test(lower)
    ? 'dev'
    : /\.t\./.test(lower)
      ? 'test'
      : /\.p\./.test(lower)
        ? 'prod'
        : 'other'

  // role: take alpha prefix of the first label
  const head = lower.split('.')[0] ?? ''
  const prefix = head.replace(/[-0-9].*$/, '')
  const role: Role = APP_PREFIXES.has(prefix)
    ? 'app'
    : ADMIN_PREFIXES.has(prefix)
      ? 'admin'
      : COUCHBASE_PREFIXES.has(prefix)
        ? 'couchbase'
        : 'misc'

  return { role, env }
}
