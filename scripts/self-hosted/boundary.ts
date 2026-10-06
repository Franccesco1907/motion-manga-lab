import type { IncomingMessage } from 'node:http'
import { LocalProjectError } from '../local-projects/store.ts'
import type { LocalBoundary } from '../local-projects/http.ts'
export interface ServiceBoundary { origin: string; secure: boolean; cookieName: string }
export function serviceBoundary(origin: string): ServiceBoundary {
  const url = new URL(origin)
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.pathname !== '/' || url.search || url.hash ||
    (url.protocol === 'http:' && !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname))) throw new Error('PUBLIC_ORIGIN must be a canonical loopback HTTP or trusted HTTPS origin.')
  if (url.origin !== origin) throw new Error('PUBLIC_ORIGIN must not contain a path or trailing slash.')
  return { origin, secure: url.protocol === 'https:', cookieName: url.protocol === 'https:' ? '__Host-mml_session' : 'mml_session' }
}
export function assertTransport(req: IncomingMessage, boundary: ServiceBoundary, mutation = false) {
  const expected = new URL(boundary.origin)
  if (req.headers.host !== expected.host || !['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress ?? '') ||
    req.headers.forwarded !== undefined || req.headers['x-forwarded-host'] !== undefined || req.headers['x-forwarded-proto'] !== undefined || req.headers['x-forwarded-for'] !== undefined ||
    (req.headers.origin !== undefined && req.headers.origin !== boundary.origin) ||
    (mutation && req.headers.origin !== boundary.origin) || (mutation && req.headers['sec-fetch-site'] === 'cross-site')) {
    throw new LocalProjectError('same_origin_required', 'Use the configured same-origin service.', 403)
  }
}
export function localPolicy(boundary: ServiceBoundary) {
  return (value: LocalBoundary) => {
    if (value.host !== new URL(boundary.origin).host || value.marker !== '1' || value.method === 'OPTIONS' ||
      (value.origin !== undefined && value.origin !== boundary.origin)) throw new LocalProjectError('same_origin_required', 'Use the configured private service.', 403)
  }
}
export function cookieToken(req: IncomingMessage, name: string): string {
  const values = (req.headers.cookie ?? '').split(';').map(item => item.trim()).filter(item => item.startsWith(`${name}=`))
  if (values.length !== 1) return ''
  return values[0].slice(name.length + 1)
}
export function sessionCookie(token: string, boundary: ServiceBoundary, clear = false) {
  return `${boundary.cookieName}=${clear ? '' : token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${clear ? 0 : 43200}${boundary.secure ? '; Secure' : ''}`
}
