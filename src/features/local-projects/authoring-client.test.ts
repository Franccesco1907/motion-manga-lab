import { afterEach, expect, it, vi } from 'vitest'
import { authoringClient } from './authoring-client'
import { newRegion } from './draft-editing'
import type { LocalDraft } from './contracts'

const projectId = 'f3a8c842-a5f8-4ee4-89ec-15230555eca7'
const snapshotId = '35bfe329-e084-4635-8a28-bd6db6b7e0cc'
afterEach(() => vi.unstubAllGlobals())

it('pins snapshot media to its reviewed revision instead of silently following replacement', async () => {
  const fetch = vi.fn().mockResolvedValueOnce(new Response('poster', { headers: { 'content-type': 'image/png' } }))
    .mockResolvedValueOnce(new Response('video', { headers: { 'content-type': 'video/webm' } }))
  vi.stubGlobal('fetch', fetch)
  await authoringClient.snapshotPoster(snapshotId, projectId, undefined, 0)
  await authoringClient.snapshotVideo(snapshotId, projectId, undefined, 0)
  expect(fetch.mock.calls.map(call => call[0])).toEqual([
    `/api/local-projects/snapshots/${snapshotId}/pages/${projectId}/poster?revision=0`,
    `/api/local-projects/snapshots/${snapshotId}/pages/${projectId}/video?revision=0`,
  ])
  expect(fetch.mock.calls[0][1].headers).toEqual({ 'X-Motion-Manga-Local': '1' })
})

it('persists incomplete raw fields without client-side numeric coercion', async () => {
  const draft: LocalDraft = { schemaVersion: 1, projectId, sourceVersion: 'source', normalizationVersion: 'working-image-v1', revision: 2, duration: '', fps: '24', regions: [newRegion('region')] }
  draft.regions[0].motion.dx = '-'
  const fetch = vi.fn().mockResolvedValue(Response.json({ draft: { ...draft, revision: 3 } }))
  vi.stubGlobal('fetch', fetch)
  await authoringClient.saveDraft(draft)
  const body = JSON.parse(fetch.mock.calls[0][1].body)
  expect(body.expectedRevision).toBe(2)
  expect(body.draft.duration).toBe('')
  expect(body.draft.regions[0].motion.dx).toBe('-')
})
