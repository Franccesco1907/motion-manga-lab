import type { AccountSession, AccountUser, RuntimeMode } from './contracts'
import { clearOwnerRecovery } from '../local-projects/draft-editing'

export interface PrivateSessionState { mode: RuntimeMode | 'unknown'; user: AccountUser | null; csrfToken: string | null; epoch: number; notice: string }
let state: PrivateSessionState = { mode: 'unknown', user: null, csrfToken: null, epoch: 0, notice: '' }
const listeners = new Set<() => void>()
export function getPrivateSession() { return state }
export function subscribePrivateSession(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener) } }
function update(next: Omit<PrivateSessionState, 'epoch'>) { state = { ...next, epoch: state.epoch + 1 }; for (const listener of listeners) listener() }
export function configurePrivateSession(mode: RuntimeMode, session?: AccountSession) {
  if (state.user && state.user.id !== session?.user?.id) { try { clearOwnerRecovery(state.user.id) } catch { /* Other owners cannot recover this namespace. */ } }
  update({ mode, user: session?.user ?? null, csrfToken: session?.csrfToken ?? null, notice: '' })
}
export function resetPrivateSession() { update({ mode: 'unknown', user: null, csrfToken: null, notice: '' }) }
export function expirePrivateSession(notice = 'Your session expired. Sign in again to reopen your private workspace.') {
  if (state.user) { try { clearOwnerRecovery(state.user.id) } catch { /* Owner namespaces still prevent another account from recovering it. */ } }
  update({ mode: 'accounts', user: null, csrfToken: null, notice })
}
export function privateHeaders(method = 'GET'): Record<string, string> {
  if (state.mode === 'unknown') throw new Error('Workspace runtime is not ready. Retry loading the service.')
  if (state.mode === 'accounts' && (!state.user || !state.csrfToken)) throw new Error('Sign in to access your private workspace.')
  return { 'X-Motion-Manga-Local': '1', ...(state.mode === 'accounts' && !['GET', 'HEAD'].includes(method.toUpperCase()) ? { 'X-Motion-Manga-CSRF': state.csrfToken! } : {}) }
}
