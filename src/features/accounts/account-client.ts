import type { AccountSession, RuntimeInfo } from './contracts'

function object(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null }
async function request(path: string, signal?: AbortSignal, body?: unknown, csrfToken?: string): Promise<unknown> {
  const response = await fetch(`/api/${path}`, { signal, credentials: 'same-origin', redirect: 'error', cache: 'no-store',
    headers: { 'X-Motion-Manga-Local': '1', ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...(csrfToken ? { 'X-Motion-Manga-CSRF': csrfToken } : {}) },
    ...(body === undefined ? {} : { method: 'POST', body: JSON.stringify(body) }) })
  if (!response.headers.get('content-type')?.includes('application/json')) throw new Error('Application service unavailable. Start the configured local or accounts server, then retry.')
  const value: unknown = await response.json()
  if (!response.ok) {
    if (object(value) && object(value.error) && typeof value.error.message === 'string') throw new Error(value.error.message.slice(0, 500))
    throw new Error('Account request failed. Retry explicitly.')
  }
  return value
}
function session(value: unknown): AccountSession {
  if (object(value) && value.user === null && value.csrfToken === null) return { user: null, csrfToken: null }
  if (!object(value) || !object(value.user) || typeof value.user.id !== 'string' || !value.user.id || typeof value.user.username !== 'string' || typeof value.csrfToken !== 'string' || !value.csrfToken) throw new Error('Invalid account session response.')
  return { user: { id: value.user.id, username: value.user.username }, csrfToken: value.csrfToken }
}
export const accountClient = {
  async runtime(signal?: AbortSignal): Promise<RuntimeInfo> {
    const value = await request('runtime', signal)
    if (!object(value) || !['local', 'accounts'].includes(String(value.mode))) throw new Error('Invalid application runtime. Private editing is unavailable until the service is verified.')
    return { mode: value.mode as RuntimeInfo['mode'] }
  },
  async session(signal?: AbortSignal) { return session(await request('auth/session', signal)) },
  async login(username: string, password: string) { return session(await request('auth/login', undefined, { username, password })) },
  async logout(csrfToken: string) { await request('auth/logout', undefined, {}, csrfToken) },
}
export type AccountClient = typeof accountClient
