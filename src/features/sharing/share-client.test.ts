import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { shareClient, guestClient } from './share-client'
import { configurePrivateSession, resetPrivateSession } from '../accounts/private-session'
import type { LocalSnapshot } from '../local-projects/contracts'

const token = 'a'.repeat(43)
const snapshot: LocalSnapshot = { id: '35bfe329-e084-4635-8a28-bd6db6b7e0cc', chapterId: '3f43dcac-463f-4d71-866a-6e242a0753bc', name: 'Chapter', revision: 2, createdAt: '2026-10-05T00:00:00Z', pages: [] }
beforeEach(() => configurePrivateSession('accounts', { user: { id: 'owner-a', username: 'alice' }, csrfToken: 'csrf-a' }))
afterEach(() => { vi.unstubAllGlobals(); resetPrivateSession() })

it('shares only an explicitly reviewed snapshot through authenticated CSRF mutation', async () => {
  const fetch = vi.fn().mockResolvedValue(Response.json({ share: { id: 'share', snapshotId: snapshot.id, snapshotRevision: 2, name: 'Chapter', revision: 0, createdAt: snapshot.createdAt, rightsConfirmed: true, rightsConfirmedAt: snapshot.createdAt, attribution: 'Artist credit' }, token, path: `/read/${token}` }))
  vi.stubGlobal('fetch', fetch)
  const result = await shareClient.create(snapshot, { rightsConfirmed: true, attribution: 'Artist credit' })
  expect(result.path).toBe(`/read/${token}`)
  const options = fetch.mock.calls[0][1]
  expect(options.headers['X-Motion-Manga-CSRF']).toBe('csrf-a')
  expect(JSON.parse(options.body)).toEqual({ snapshotId: snapshot.id, expectedSnapshotRevision: 2, reviewed: true, rightsConfirmed: true, attribution: 'Artist credit' })
})

it('fetches guest reading anonymously without private headers or arbitrary media paths', async () => {
  const fetch = vi.fn().mockResolvedValue(Response.json({ name: 'Shared chapter', attribution: 'Artist credit', revision: 0, pages: [{ index: 0, name: 'Page', width: 2, height: 2, duration: 1, fps: 4, videoMime: 'video/webm', posterPath: `/api/read/${token}/pages/0/poster`, videoPath: `/api/read/${token}/pages/0/video` }] }))
  vi.stubGlobal('fetch', fetch)
  expect((await guestClient.manifest(token)).name).toBe('Shared chapter')
  expect(fetch.mock.calls[0][1].credentials).toBe('omit')
  expect(fetch.mock.calls[0][1].headers).toBeUndefined()
  fetch.mockResolvedValue(Response.json({ name: 'bad', revision: 0, pages: [{ index: 0, name: 'Page', width: 2, height: 2, duration: 1, fps: 4, videoMime: 'video/webm', posterPath: '/api/local-projects/private/original', videoPath: 'https://example.com/video' }] }))
  await expect(guestClient.manifest(token)).rejects.toThrow('Invalid shared')
})

it('makes revoked links unavailable without falling back to a private workspace', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ error: { code: 'not_found', message: 'Not found.' } }, { status: 404 })))
  await expect(guestClient.manifest(token)).rejects.toThrow('withdrawn')
})
