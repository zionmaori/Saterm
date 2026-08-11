import { Client } from 'ssh2'
import { getHost } from './hosts'
import { dialHost } from './ssh'
import type { Host, HostId } from '../shared/types'

interface Connection {
  client: Client
  jumpClient?: Client
  sftp: import('ssh2').SFTPWrapper
}

// One lazily-opened, reused connection per host — remote-file tabs are
// short-lived and infrequent enough that we don't need per-tab ref-counting;
// connections are torn down on quit (closeAllSftp) or if the socket drops.
const connections = new Map<HostId, Promise<Connection>>()

async function openConnection(host: Host): Promise<Connection> {
  const sessionId = `sftp:${host.id}`
  const { client, jumpClient } = await dialHost(host, sessionId)
  const sftp = await new Promise<import('ssh2').SFTPWrapper>((resolve, reject) => {
    client.sftp((err, wrapper) => (err ? reject(err) : resolve(wrapper)))
  })
  client.on('close', () => connections.delete(host.id))
  return { client, jumpClient, sftp }
}

function getConnection(hostId: HostId): Promise<Connection> {
  const existing = connections.get(hostId)
  if (existing) return existing
  const host = getHost(hostId)
  if (!host) return Promise.reject(new Error(`Unknown host id ${hostId}`))
  const pending = openConnection(host).catch((err) => {
    connections.delete(hostId)
    throw err
  })
  connections.set(hostId, pending)
  return pending
}

export async function readRemoteFile(hostId: HostId, path: string): Promise<string> {
  const { sftp } = await getConnection(hostId)
  return new Promise<string>((resolve, reject) => {
    const chunks: Buffer[] = []
    const stream = sftp.createReadStream(path)
    stream.on('data', (chunk: Buffer) => chunks.push(chunk))
    stream.on('error', reject)
    stream.on('close', () => resolve(Buffer.concat(chunks).toString('utf8')))
  })
}

export async function writeRemoteFile(
  hostId: HostId,
  path: string,
  content: string
): Promise<void> {
  const { sftp } = await getConnection(hostId)
  return new Promise<void>((resolve, reject) => {
    const stream = sftp.createWriteStream(path)
    stream.on('error', reject)
    stream.on('close', () => resolve())
    stream.end(Buffer.from(content, 'utf8'))
  })
}

export function closeAllSftp(): void {
  for (const [hostId, pending] of Array.from(connections.entries())) {
    connections.delete(hostId)
    pending
      .then(({ client, jumpClient }) => {
        try {
          client.end()
        } catch {
          /* noop */
        }
        try {
          jumpClient?.end()
        } catch {
          /* noop */
        }
      })
      .catch(() => {
        /* connection never opened — nothing to close */
      })
  }
}
