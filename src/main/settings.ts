import { homedir } from 'os'
import { join } from 'path'
import { kvGet, kvSet } from './db'

const PREFIX = 'settings.'

export function getSetting(key: string): string | null {
  return kvGet(PREFIX + key)
}

export function setSetting(key: string, value: string): void {
  kvSet(PREFIX + key, value)
}

export function getProjectsRoot(): string {
  return getSetting('projectsRoot') ?? join(homedir(), 'Projects')
}

export function setProjectsRoot(path: string): void {
  setSetting('projectsRoot', path)
}
