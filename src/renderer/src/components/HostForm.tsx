import { useEffect, useState } from 'react'
import type { Host, HostEnv, HostInput, HostRole } from '../../../shared/types'

const ROLES: HostRole[] = ['app', 'admin', 'couchbase', 'misc']
const ENVS: HostEnv[] = ['dev', 'test', 'prod', 'other']

interface Props {
  initial?: Host | null
  onSave: (input: HostInput) => Promise<void>
  onCancel: () => void
  onDelete?: () => Promise<void>
}

export default function HostForm({ initial, onSave, onCancel, onDelete }: Props): React.JSX.Element {
  const [name, setName] = useState(initial?.name ?? '')
  const [hostname, setHostname] = useState(initial?.hostname ?? '')
  const [port, setPort] = useState(initial?.port ?? 22)
  const [user, setUser] = useState(initial?.user ?? '')
  const [identityFile, setIdentityFile] = useState(initial?.identityFile ?? '')
  const [proxyJump, setProxyJump] = useState(initial?.proxyJump ?? '')
  const [group, setGroup] = useState(initial?.group ?? '')
  const [role, setRole] = useState<HostRole>(initial?.role ?? 'misc')
  const [env, setEnv] = useState<HostEnv>(initial?.env ?? 'other')
  const [tags, setTags] = useState<string[]>(initial?.tags ?? [])
  const [tagInput, setTagInput] = useState('')
  const [knownTags, setKnownTags] = useState<string[]>([])
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    void window.api.hosts.listTags().then((rows) => setKnownTags(rows.map((r) => r.tag)))
  }, [])

  useEffect(() => {
    if (initial) {
      setName(initial.name)
      setHostname(initial.hostname)
      setPort(initial.port)
      setUser(initial.user)
      setIdentityFile(initial.identityFile ?? '')
      setProxyJump(initial.proxyJump ?? '')
      setGroup(initial.group ?? '')
      setRole(initial.role)
      setEnv(initial.env)
      setTags(initial.tags ?? [])
    }
  }, [initial])

  const addTag = (raw: string): void => {
    const t = raw.trim().toLowerCase().replace(/^#/, '').replace(/\s+/g, '-')
    if (!t) return
    setTags((cur) => (cur.includes(t) ? cur : [...cur, t]))
    setTagInput('')
  }
  const removeTag = (t: string): void => setTags((cur) => cur.filter((x) => x !== t))
  const tagSuggestions = tagInput.trim()
    ? knownTags
        .filter((t) => t.includes(tagInput.toLowerCase()) && !tags.includes(t))
        .slice(0, 6)
    : []

  const submit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault()
    if (!name || !hostname || !user) return
    setBusy(true)
    try {
      await onSave({
        name: name.trim(),
        hostname: hostname.trim(),
        port: Number(port) || 22,
        user: user.trim(),
        identityFile: identityFile.trim() || null,
        proxyJump: proxyJump.trim() || null,
        group: group.trim() || null,
        role,
        env,
        tags
      })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="dialog-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onCancel()}>
      <form className="dialog" onSubmit={submit}>
        <h2>{initial ? 'Edit host' : 'New host'}</h2>
        <div className="col">
          <label>Name</label>
          <input value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        </div>
        <div className="row">
          <div className="col" style={{ flex: 2 }}>
            <label>Hostname</label>
            <input value={hostname} onChange={(e) => setHostname(e.target.value)} />
          </div>
          <div className="col" style={{ flex: 1 }}>
            <label>Port</label>
            <input
              type="number"
              value={port}
              onChange={(e) => setPort(Number(e.target.value))}
            />
          </div>
        </div>
        <div className="col">
          <label>User</label>
          <input value={user} onChange={(e) => setUser(e.target.value)} />
        </div>
        <div className="col">
          <label>Identity file</label>
          <input
            value={identityFile}
            onChange={(e) => setIdentityFile(e.target.value)}
            placeholder="~/.ssh/id_ed25519"
          />
        </div>
        <div className="row">
          <div className="col" style={{ flex: 1 }}>
            <label>ProxyJump</label>
            <input
              value={proxyJump}
              onChange={(e) => setProxyJump(e.target.value)}
              placeholder="user@bastion:22"
            />
          </div>
          <div className="col" style={{ flex: 1 }}>
            <label>Group</label>
            <input value={group} onChange={(e) => setGroup(e.target.value)} />
          </div>
        </div>
        <div className="row">
          <div className="col" style={{ flex: 1 }}>
            <label>Role</label>
            <select value={role} onChange={(e) => setRole(e.target.value as HostRole)}>
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>
          <div className="col" style={{ flex: 1 }}>
            <label>Env</label>
            <select value={env} onChange={(e) => setEnv(e.target.value as HostEnv)}>
              {ENVS.map((e2) => (
                <option key={e2} value={e2}>
                  {e2}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="col">
          <label>Tags</label>
          <div className="tag-edit">
            {tags.map((t) => (
              <span key={t} className="chip chip-tag">
                #{t}
                <button
                  type="button"
                  className="chip-x"
                  onClick={() => removeTag(t)}
                  title="Remove tag"
                >
                  ×
                </button>
              </span>
            ))}
            <input
              className="tag-input"
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ',' || e.key === ' ') {
                  e.preventDefault()
                  addTag(tagInput)
                } else if (e.key === 'Backspace' && !tagInput && tags.length) {
                  removeTag(tags[tags.length - 1])
                }
              }}
              placeholder={tags.length ? 'Add tag…' : 'e.g. prod, vpn, couchbase'}
            />
          </div>
          {tagSuggestions.length > 0 && (
            <div className="tag-suggestions">
              {tagSuggestions.map((t) => (
                <button
                  type="button"
                  key={t}
                  className="chip chip-tag chip-suggestion"
                  onClick={() => addTag(t)}
                >
                  #{t}
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="row" style={{ justifyContent: 'flex-end', marginTop: 14 }}>
          {initial && onDelete && (
            <button
              type="button"
              className="danger"
              onClick={onDelete}
              style={{ marginRight: 'auto' }}
            >
              Delete
            </button>
          )}
          <button type="button" onClick={onCancel}>
            Cancel
          </button>
          <button type="submit" className="primary" disabled={busy}>
            Save
          </button>
        </div>
      </form>
    </div>
  )
}
