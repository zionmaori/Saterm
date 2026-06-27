import { Client, type ConnectConfig, type ClientChannel } from 'ssh2'
import { readFile } from 'fs/promises'
import { existsSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'
import { BrowserWindow } from 'electron'
import { getHost } from './hosts'
import { getSshSecret, setSshSecret } from './keychain'
import type {
  AuthPromptEvent,
  SessionId,
  SshConnectArgs,
  TermDataEvent,
  TermExitEvent
} from '../shared/types'

interface Session {
  client: Client
  channel: ClientChannel
  hostId: number
}

const sessions = new Map<SessionId, Session>()
const pendingPrompts = new Map<SessionId, (reply: { secret: string | null; remember: boolean }) => void>()

const send = (event: string, payload: unknown): void => {
  for (const win of BrowserWindow.getAllWindows()) win.webContents.send(event, payload)
}

const emitData = (sessionId: SessionId, data: string): void =>
  send('term:data', { sessionId, data } satisfies TermDataEvent)
const emitExit = (e: TermExitEvent): void => send('term:exit', e)

/** Default SSH keys we'll auto-try when the host has no identity_file. Mirrors
 *  what OpenSSH does — ssh2 won't do this itself. */
const DEFAULT_KEY_NAMES = [
  'id_ed25519',
  'id_ed25519_sk',
  'id_ecdsa',
  'id_ecdsa_sk',
  'id_rsa',
  'id_dsa'
]

function existingDefaultKeys(): string[] {
  const dir = join(homedir(), '.ssh')
  return DEFAULT_KEY_NAMES.map((n) => join(dir, n)).filter((p) => existsSync(p))
}

async function readIdentity(path: string | null): Promise<Buffer | undefined> {
  if (!path) return undefined
  try {
    return await readFile(path)
  } catch {
    return undefined
  }
}

async function loadIdentities(path: string | null): Promise<Buffer[]> {
  const tried = new Set<string>()
  const out: Buffer[] = []
  const add = async (p: string): Promise<void> => {
    if (tried.has(p)) return
    tried.add(p)
    const buf = await readIdentity(p)
    if (buf) out.push(buf)
  }
  if (path) await add(path)
  for (const p of existingDefaultKeys()) await add(p)
  return out
}

function askSecret(
  sessionId: SessionId,
  hostId: number,
  kind: 'password' | 'passphrase',
  message: string
): Promise<{ secret: string | null; remember: boolean }> {
  return new Promise((resolve) => {
    pendingPrompts.set(sessionId, (reply) => {
      pendingPrompts.delete(sessionId)
      resolve(reply)
    })
    send('ssh:auth-prompt', { sessionId, hostId, kind, message } satisfies AuthPromptEvent)
  })
}

export function resolveAuthPrompt(sessionId: SessionId, secret: string | null, remember: boolean): void {
  const r = pendingPrompts.get(sessionId)
  if (r) r({ secret, remember })
}

async function dialDirect(
  cfg: ConnectConfig,
  via?: { sock: NodeJS.ReadableStream & NodeJS.WritableStream }
): Promise<Client> {
  return new Promise((resolve, reject) => {
    const client = new Client()
    client.once('ready', () => resolve(client))
    client.once('error', reject)
    client.connect({ ...cfg, sock: via?.sock as never })
  })
}

async function openJumpChannel(
  jumpHost: { hostname: string; port: number; user: string; identityFile: string | null },
  target: { hostname: string; port: number }
): Promise<{ sock: ClientChannel; client: Client }> {
  const jumpIds = await loadIdentities(jumpHost.identityFile)
  const agent = process.env.SSH_AUTH_SOCK || undefined
  const jumpClient = await dialDirect({
    host: jumpHost.hostname,
    port: jumpHost.port,
    username: jumpHost.user,
    privateKey: jumpIds[0],
    agent,
    tryKeyboard: true
  })
  const sock = await new Promise<ClientChannel>((resolve, reject) => {
    jumpClient.forwardOut('127.0.0.1', 0, target.hostname, target.port, (err, stream) => {
      if (err) return reject(err)
      resolve(stream)
    })
  })
  return { sock, client: jumpClient }
}

export async function connectSsh(args: SshConnectArgs): Promise<void> {
  const host = getHost(args.hostId)
  if (!host) throw new Error(`Unknown host id ${args.hostId}`)
  const sessionId = args.sessionId

  let savedPassword = await getSshSecret(host.id, 'password')
  let savedPassphrase = await getSshSecret(host.id, 'passphrase')
  const identities = await loadIdentities(host.identityFile)
  const agent = process.env.SSH_AUTH_SOCK || undefined

  let jumpClient: Client | undefined
  let proxySock: ClientChannel | undefined
  if (host.proxyJump) {
    // host.proxyJump may be "user@host:port" or just a saved host name.
    const jh = parseJumpSpec(host.proxyJump)
    proxySock = (
      await openJumpChannel(
        { hostname: jh.hostname, port: jh.port, user: jh.user, identityFile: host.identityFile },
        { hostname: host.hostname, port: host.port }
      )
    ).sock
  }

  const client = new Client()

  const onPassword = async (): Promise<string | undefined> => {
    if (savedPassword) {
      const s = savedPassword
      savedPassword = null
      return s
    }
    const r = await askSecret(sessionId, host.id, 'password', `Password for ${host.user}@${host.name}`)
    if (r.secret && r.remember) await setSshSecret(host.id, 'password', r.secret)
    return r.secret ?? undefined
  }

  const onPassphrase = async (): Promise<string | undefined> => {
    if (savedPassphrase) {
      const s = savedPassphrase
      savedPassphrase = null
      return s
    }
    const r = await askSecret(
      sessionId,
      host.id,
      'passphrase',
      `Passphrase for ${host.identityFile ?? 'identity key'}`
    )
    if (r.secret && r.remember) await setSshSecret(host.id, 'passphrase', r.secret)
    return r.secret ?? undefined
  }

  // ssh2 supports a single `privateKey` (one Buffer) or an array via undocumented
  // `privateKeyEntries` on some builds, but the portable approach is to use
  // `agent` for the multi-key case and `privateKey` for a single explicit key.
  // We use both: agent picks up `ssh-add`'d keys; privateKey covers the case
  // where the user has a file on disk but no agent.
  const baseConfig: ConnectConfig = {
    host: host.hostname,
    port: host.port,
    username: host.user,
    privateKey: identities[0],
    passphrase: savedPassphrase ?? undefined,
    agent,
    agentForward: false,
    tryKeyboard: true,
    keepaliveInterval: 30_000,
    sock: proxySock as never
  }

  client.on('keyboard-interactive', (_n, _i, _l, prompts, finish) => {
    Promise.all(
      prompts.map(async (p) => {
        if (/passphrase/i.test(p.prompt)) return (await onPassphrase()) ?? ''
        return (await onPassword()) ?? ''
      })
    ).then((answers) => finish(answers))
  })

  // Try key/agent first. On client-authentication failure (server didn't accept
  // the key, no keyboard-interactive fallback) prompt for a password and reconnect
  // a fresh Client. The session is registered AFTER a Client is ready and its
  // shell is attached — never half-state.
  const activeClient = await new Promise<Client>((resolve, reject) => {
    const onReady = (): void => {
      client.removeListener('error', onError)
      resolve(client)
    }
    const onError = async (err: Error & { level?: string }): Promise<void> => {
      client.removeListener('ready', onReady)
      // Only auth-stage failures are password-retryable. Anything else (DNS,
      // connection-refused, handshake) bubbles up unchanged.
      if (err.level !== 'client-authentication') {
        try {
          client.destroy()
        } catch { /* noop */ }
        reject(err)
        return
      }
      try {
        client.destroy()
      } catch { /* noop */ }

      let pwd: string | undefined
      try {
        pwd = await onPassword()
      } catch (pe) {
        reject(pe as Error)
        return
      }
      if (!pwd) {
        reject(new Error('Authentication failed: key rejected and no password provided.'))
        return
      }

      const retry = new Client()
      retry.once('ready', () => resolve(retry))
      retry.once('error', (rerr: Error & { level?: string }) => {
        try {
          retry.destroy()
        } catch { /* noop */ }
        const msg =
          rerr.level === 'client-authentication'
            ? 'Authentication failed: wrong password.'
            : rerr.message || String(rerr)
        reject(new Error(msg))
      })
      retry.connect({ ...baseConfig, password: pwd })
    }
    client.once('ready', onReady)
    client.once('error', onError)
    client.connect(baseConfig)
  })

  await attachShell(activeClient, args, sessionId, jumpClient)
}

async function attachShell(
  client: Client,
  args: SshConnectArgs,
  sessionId: SessionId,
  jumpClient?: Client
): Promise<void> {
  const channel: ClientChannel = await new Promise((resolve, reject) => {
    client.shell(
      { term: 'xterm-256color', cols: args.cols, rows: args.rows },
      (err, stream) => (err ? reject(err) : resolve(stream))
    )
  })
  sessions.set(sessionId, { client, channel, hostId: args.hostId })
  channel.on('data', (chunk: Buffer) => emitData(sessionId, chunk.toString('utf8')))
  channel.stderr.on('data', (chunk: Buffer) => emitData(sessionId, chunk.toString('utf8')))
  channel.on('close', () => {
    sessions.delete(sessionId)
    emitExit({ sessionId, code: null, signal: null })
    try {
      client.end()
    } catch { /* noop */ }
    if (jumpClient) {
      try {
        jumpClient.end()
      } catch { /* noop */ }
    }
  })
  client.on('error', (err) => emitData(sessionId, `\r\n[ssh error] ${err.message}\r\n`))
}

export function writeSsh(sessionId: SessionId, data: string): void {
  const s = sessions.get(sessionId)
  if (!s) return
  s.channel.write(data)
}

export function resizeSsh(sessionId: SessionId, cols: number, rows: number): void {
  const s = sessions.get(sessionId)
  if (!s) return
  s.channel.setWindow(rows, cols, 0, 0)
}

export function closeSsh(sessionId: SessionId): void {
  const s = sessions.get(sessionId)
  if (!s) return
  try {
    s.channel.close()
  } catch { /* noop */ }
  try {
    s.client.end()
  } catch { /* noop */ }
  sessions.delete(sessionId)
}

export function isSshSession(sessionId: SessionId): boolean {
  return sessions.has(sessionId)
}

function parseJumpSpec(spec: string): { hostname: string; port: number; user: string } {
  // "user@host:port"
  let user = process.env.USER ?? 'root'
  let host = spec
  if (host.includes('@')) {
    const [u, rest] = host.split('@')
    user = u
    host = rest
  }
  let port = 22
  if (host.includes(':')) {
    const [h, p] = host.split(':')
    host = h
    port = Number(p) || 22
  }
  return { hostname: host, port, user }
}
