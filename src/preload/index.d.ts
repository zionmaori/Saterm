import type { TermionAPI } from './index'

declare global {
  interface Window {
    api: TermionAPI
  }
}
