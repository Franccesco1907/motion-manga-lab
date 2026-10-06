import type { OwnerShare, ShareCreation, SharedReading } from './contracts'
import type { LocalSnapshot } from '../local-projects/contracts'
import { localJson, localRequest } from '../local-projects/local-project-client'

function object(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null }
function resourceId(id: string) { if (!/^[0-9a-f-]{36}$/.test(id)) throw new Error('Invalid shared resource ID.'); return encodeURIComponent(id) }
function tokenPath(token: string) { if (!/^[A-Za-z0-9_-]{32,128}$/.test(token)) throw new Error('Shared reading unavailable. The link is invalid or withdrawn.'); return `/api/read/${encodeURIComponent(token)}` }
function ownerShare(value: unknown): value is OwnerShare {
  return object(value) && typeof value.id === 'string' && typeof value.snapshotId === 'string' && typeof value.name === 'string'
    && Number.isSafeInteger(value.revision) && Number.isSafeInteger(value.snapshotRevision) && typeof value.createdAt === 'string'
    && value.rightsConfirmed === true && typeof value.rightsConfirmedAt === 'string' && typeof value.attribution === 'string'
}
interface SharePermission { rightsConfirmed: boolean; attribution: string }
async function mutation(snapshot: LocalSnapshot, permission: SharePermission, previous?: OwnerShare): Promise<ShareCreation> {
  const body = await localJson(await localRequest(`/api/shares${previous ? '/' + resourceId(previous.id) : ''}`, {
    method: previous ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ snapshotId: snapshot.id, expectedSnapshotRevision: snapshot.revision, reviewed: true, rightsConfirmed: permission.rightsConfirmed, attribution: permission.attribution, ...(previous ? { expectedRevision: previous.revision } : {}) }),
  }))
  if (!object(body) || !ownerShare(body.share) || body.share.snapshotId !== snapshot.id || body.share.snapshotRevision !== snapshot.revision
    || typeof body.token !== 'string' || !/^[A-Za-z0-9_-]{32,128}$/.test(body.token) || body.path !== `/read/${body.token}`) throw new Error('Invalid created link response. Reload the share list before retrying.')
  return { share: body.share, token: body.token, path: body.path }
}
export const shareClient = {
  async list(signal?: AbortSignal): Promise<OwnerShare[]> {
    const body = await localJson(await localRequest('/api/shares', { signal }))
    if (!object(body) || !Array.isArray(body.shares) || !body.shares.every(ownerShare)) throw new Error('Invalid guest link list. Retry loading links.')
    return body.shares
  },
  create: (snapshot: LocalSnapshot, permission: SharePermission) => mutation(snapshot, permission),
  replace: (snapshot: LocalSnapshot, previous: OwnerShare, permission: SharePermission) => mutation(snapshot, permission, previous),
  async withdraw(share: OwnerShare) {
    await localRequest(`/api/shares/${resourceId(share.id)}`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ expectedRevision: share.revision }) })
  },
}
export type ShareClient = typeof shareClient

async function guestRequest(path: string, signal?: AbortSignal) {
  const response = await fetch(path, { signal, credentials: 'omit', redirect: 'error', cache: 'no-store' })
  if (!response.ok) throw new Error('Shared reading unavailable. The link may be invalid or withdrawn.')
  return response
}
async function media(token: string, index: number, kind: 'poster' | 'video', signal?: AbortSignal) {
  if (!Number.isSafeInteger(index) || index < 0) throw new Error('Invalid shared page.')
  const response = await guestRequest(`${tokenPath(token)}/pages/${index}/${kind}`, signal)
  const mime = response.headers.get('content-type')?.split(';')[0]
  if (kind === 'poster' ? mime !== 'image/png' : !['video/webm', 'video/mp4'].includes(mime ?? '')) throw new Error('Shared media unavailable. Retry reading explicitly.')
  return response.blob()
}
export const guestClient = {
  async manifest(token: string, signal?: AbortSignal): Promise<SharedReading> {
    const base = tokenPath(token)
    const response = await guestRequest(base, signal)
    if (!response.headers.get('content-type')?.includes('application/json')) throw new Error('Shared reading service unavailable. Retry explicitly.')
    const value: unknown = await response.json()
    if (!object(value) || typeof value.name !== 'string' || typeof value.attribution !== 'string' || !Number.isSafeInteger(value.revision) || !Array.isArray(value.pages)
      || !value.pages.every((page, index) => object(page) && page.index === index && typeof page.name === 'string'
        && [page.width, page.height, page.duration, page.fps].every(n => typeof n === 'number' && Number.isFinite(n) && n > 0)
        && page.posterPath === `${base}/pages/${index}/poster` && page.videoPath === `${base}/pages/${index}/video`
        && ['video/webm', 'video/mp4'].includes(String(page.videoMime)))) throw new Error('Invalid shared reading manifest. No private workspace will be opened.')
    return value as unknown as SharedReading
  },
  poster: (token: string, index: number, signal?: AbortSignal) => media(token, index, 'poster', signal),
  video: (token: string, index: number, signal?: AbortSignal) => media(token, index, 'video', signal),
}
export type GuestClient = typeof guestClient
