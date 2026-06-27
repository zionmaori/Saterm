import keytar from 'keytar'

const SERVICE = 'Termion'

const acct = (hostId: number, kind: 'password' | 'passphrase'): string => `ssh:${hostId}:${kind}`

export async function getSshSecret(
  hostId: number,
  kind: 'password' | 'passphrase'
): Promise<string | null> {
  return keytar.getPassword(SERVICE, acct(hostId, kind))
}

export async function setSshSecret(
  hostId: number,
  kind: 'password' | 'passphrase',
  secret: string
): Promise<void> {
  await keytar.setPassword(SERVICE, acct(hostId, kind), secret)
}

export async function deleteSshSecret(
  hostId: number,
  kind: 'password' | 'passphrase'
): Promise<boolean> {
  return keytar.deletePassword(SERVICE, acct(hostId, kind))
}

export async function clearHostSecrets(hostId: number): Promise<void> {
  await Promise.all([deleteSshSecret(hostId, 'password'), deleteSshSecret(hostId, 'passphrase')])
}
