import keytar from 'keytar'
import type { AiProvider } from '../shared/types'

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

// ----- AI secrets -----
// API key: service=Termion account=anthropic:apiKey
// Auth token (Claude Code OAuth): service=Termion account=anthropic:authToken

const AI_API_KEY_ACCOUNT = 'anthropic:apiKey'
const AI_AUTH_TOKEN_ACCOUNT = 'anthropic:authToken'

export async function getAiApiKey(): Promise<string | null> {
  return keytar.getPassword(SERVICE, AI_API_KEY_ACCOUNT)
}

export async function setAiApiKey(key: string): Promise<void> {
  await keytar.setPassword(SERVICE, AI_API_KEY_ACCOUNT, key)
}

export async function clearAiApiKey(): Promise<boolean> {
  return keytar.deletePassword(SERVICE, AI_API_KEY_ACCOUNT)
}

export async function getAiAuthToken(): Promise<string | null> {
  return keytar.getPassword(SERVICE, AI_AUTH_TOKEN_ACCOUNT)
}

export async function setAiAuthToken(token: string): Promise<void> {
  await keytar.setPassword(SERVICE, AI_AUTH_TOKEN_ACCOUNT, token)
}

export async function clearAiAuthToken(): Promise<boolean> {
  return keytar.deletePassword(SERVICE, AI_AUTH_TOKEN_ACCOUNT)
}

// ----- Per-provider API keys -----

export async function getProviderKey(provider: AiProvider): Promise<string | null> {
  return keytar.getPassword(SERVICE, `provider:${provider}:apiKey`)
}

export async function setProviderKey(provider: AiProvider, key: string): Promise<void> {
  await keytar.setPassword(SERVICE, `provider:${provider}:apiKey`, key)
}

export async function clearProviderKey(provider: AiProvider): Promise<boolean> {
  return keytar.deletePassword(SERVICE, `provider:${provider}:apiKey`)
}

// ----- Active provider preference -----

export async function getActiveProvider(): Promise<string | null> {
  return keytar.getPassword(SERVICE, 'ai:provider')
}

export async function saveActiveProvider(provider: AiProvider): Promise<void> {
  await keytar.setPassword(SERVICE, 'ai:provider', provider)
}
