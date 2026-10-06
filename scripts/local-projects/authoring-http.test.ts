// @vitest-environment node
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { mkdtemp, rm } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import sharp from 'sharp'
import { expect, it } from 'vitest'
import type { LocalAssistanceJob, LocalChapter, LocalDraft, LocalRenderArtifact, LocalRenderJob, LocalSnapshot } from '../../src/features/local-projects/contracts.ts'
import { LocalProjectStore } from './store.ts'
import { EditingStore } from './editing-store.ts'
import { createLocalProjectsHandler } from './http.ts'

it('native HTTP saves incomplete drafts, orders pages, requires current renders, captures/replaces/unpublishes privately', async () => {
  const temporary = await mkdtemp(join(tmpdir(), 'motion-manga-authoring-http-'))
  const originals = new LocalProjectStore(join(temporary, 'private')), editing = new EditingStore(originals)
  const bytes = await sharp({ create: { width: 8, height: 6, channels: 3, background: '#345678' } }).png().toBuffer()
  const artifacts = new Map<string, LocalRenderArtifact>(), jobs = new Map<string, LocalRenderJob>()
  const renderer = {
    async start(projectId: string, draft: LocalDraft) {
      const id = randomUUID(), artifact: LocalRenderArtifact = { id, projectId, sourceVersion: draft.sourceVersion, draftRevision: draft.revision,
        normalizationVersion: 'working-image-v1', width: 8, height: 6, duration: 6, fps: 24, createdAt: new Date().toISOString(), videoMime: 'video/webm' }
      artifacts.set(projectId, artifact)
      const job: LocalRenderJob = { id, projectId, sourceVersion: draft.sourceVersion, draftRevision: draft.revision, status: 'completed', artifact }
      jobs.set(id, job); return job
    },
    async get(_projectId: string, id: string) { return jobs.get(id)! },
    async cancel(_projectId: string, id: string) { return jobs.get(id)! },
    async latestCompleted(projectId: string) { return artifacts.get(projectId) },
    async readAsset(_projectId: string, id: string, kind: 'poster' | 'video') { return { bytes: kind === 'video' ? Buffer.from(id) : bytes, mimeType: kind === 'video' ? 'video/webm' : 'image/png' } },
  }
  const assistanceJobs = new Map<string, LocalAssistanceJob>()
  const assistance = {
    async capabilities() { return { suggestRegions: { available: true, reason: 'Synthetic test adapter' }, refineRegion: { available: true, reason: 'Synthetic test adapter' } } },
    async start(projectId: string, draft: LocalDraft, _original: Buffer, mode: 'suggest' | 'refine') {
      const job: LocalAssistanceJob = { id: randomUUID(), projectId, sourceVersion: draft.sourceVersion, draftRevision: draft.revision, mode, status: 'completed', reviewRequired: true, regions: [] }
      assistanceJobs.set(job.id, job); return job
    },
    async get(_projectId: string, id: string) { return assistanceJobs.get(id)! },
    async cancel(_projectId: string, id: string) { return assistanceJobs.get(id)! },
    async readMask() { return { bytes, pixels: new Uint8Array(48), width: 8, height: 6 } },
  }
  const handler = createLocalProjectsHandler(originals, { editing, renderer, assistance })
  const server = createServer((req, res) => { void handler(req, res) })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/local-projects`
  async function api<T = unknown>(path: string, payload?: unknown, method = payload ? 'POST' : 'GET') {
    const response = await fetch(base + path, { method, headers: { 'X-Motion-Manga-Local': '1', 'Content-Type': 'application/json' }, ...(payload ? { body: JSON.stringify(payload) } : {}) })
    return { status: response.status, value: await response.json() as T }
  }
  try {
    const first = await originals.import(bytes, 'first'), second = await originals.import(bytes, 'second')
    const initial = await api<{ draft: LocalDraft }>(`/${first.id}/draft`)
    expect(initial.status).toBe(200)
    expect((await api(`/${first.id}/assistance/capabilities`)).status).toBe(200)
    const proposed = await api<{ job: LocalAssistanceJob }>(`/${first.id}/assistance`, { expectedRevision: 0, mode: 'suggest' })
    expect(proposed.status).toBe(202)
    expect(proposed.value.job.reviewRequired).toBe(true)
    expect((await api<{ job: LocalAssistanceJob }>(`/${first.id}/assistance/${proposed.value.job.id}`)).value.job).toEqual(proposed.value.job)
    expect((await api(`/${first.id}/assistance`, { expectedRevision: 0, mode: '/private/model' })).status).toBe(422)
    const saved = await api<{ draft: LocalDraft }>(`/${first.id}/draft`, { expectedRevision: 0, draft: { ...initial.value.draft, duration: '' } }, 'PUT')
    expect(saved.value.draft.duration).toBe('')
    expect((await api<{ draft: LocalDraft }>(`/${first.id}/draft`)).value.draft).toEqual(saved.value.draft)
    expect((await api(`/${first.id}/draft`, { expectedRevision: 0, draft: initial.value.draft }, 'PUT')).status).toBe(409)
    const created = await api<{ chapter: LocalChapter }>('/chapters', { name: 'Chapter', pageIds: [second.id, first.id] })
    expect(created.status).toBe(201)
    const chapter = created.value.chapter
    expect((await api<{ chapters: LocalChapter[] }>('/chapters')).value.chapters[0].pageIds).toEqual([second.id, first.id])
    expect((await api('/snapshots', { chapterId: chapter.id, expectedChapterRevision: 0, reviewed: false })).status).toBe(422)
    expect((await api('/snapshots', { chapterId: chapter.id, expectedChapterRevision: 0, reviewed: true })).status).toBe(409)
    for (const id of chapter.pageIds) expect((await api(`/${id}/render`, { expectedRevision: (await editing.getDraft(id)).revision })).status).toBe(202)
    const captured = await api<{ snapshot: LocalSnapshot }>('/snapshots', { chapterId: chapter.id, expectedChapterRevision: 0, reviewed: true })
    expect(captured.status).toBe(201)
    const snapshot = captured.value.snapshot
    expect(snapshot.pages.map((page: { projectId: string }) => page.projectId)).toEqual([second.id, first.id])
    expect(JSON.stringify(snapshot)).not.toContain('regions')
    await api(`/${first.id}/draft`, { expectedRevision: 1, draft: { ...saved.value.draft, duration: '2' } }, 'PUT')
    expect((await api<{ snapshot: LocalSnapshot }>(`/snapshots/${snapshot.id}`)).value.snapshot).toEqual(snapshot)
    expect((await api(`/snapshots/${snapshot.id}`, { expectedRevision: 0, chapterId: chapter.id, expectedChapterRevision: 0, reviewed: true }, 'PUT')).status).toBe(409)
    expect((await api(`/${first.id}/render`, { expectedRevision: 1 })).status).toBe(409)
    await api(`/${first.id}/render`, { expectedRevision: 2 })
    expect((await api<{ snapshot: LocalSnapshot }>(`/snapshots/${snapshot.id}`, { expectedRevision: 0, chapterId: chapter.id, expectedChapterRevision: 0, reviewed: true }, 'PUT')).value.snapshot.revision).toBe(1)
    const oldPage = snapshot.pages.find((page: { projectId: string }) => page.projectId === first.id)
    if (!oldPage) throw new Error('The captured snapshot must contain the requested page')
    const oldArtifact = oldPage.artifact.id
    const pinned = await fetch(`${base}/snapshots/${snapshot.id}/pages/${first.id}/video?revision=0`, { headers: { 'X-Motion-Manga-Local': '1' } })
    expect(await pinned.text()).toBe(oldArtifact)
    const latest = await fetch(`${base}/snapshots/${snapshot.id}/pages/${first.id}/video?revision=1`, { headers: { 'X-Motion-Manga-Local': '1' } })
    expect(await latest.text()).toBe(artifacts.get(first.id)!.id)
    for (const revision of ['-1', '1.5', 'NaN', '01', '9007199254740992', '../original']) {
      expect((await fetch(`${base}/snapshots/${snapshot.id}/pages/${first.id}/video?revision=${revision}`, { headers: { 'X-Motion-Manga-Local': '1' } })).status).toBe(400)
    }
    expect((await fetch(`${base}/snapshots/${snapshot.id}/pages/${first.id}/video?revision=2`, { headers: { 'X-Motion-Manga-Local': '1' } })).status).toBe(404)
    expect((await fetch(`${base}/snapshots/${snapshot.id}/pages/${first.id}/poster`)).status).toBe(403)
    expect((await api(`/snapshots/${snapshot.id}`, { expectedRevision: 1 }, 'DELETE')).status).toBe(200)
    expect((await api(`/snapshots/${snapshot.id}`)).status).toBe(404)
    expect((await fetch(`${base}/snapshots/${snapshot.id}/pages/${first.id}/poster`, { headers: { 'X-Motion-Manga-Local': '1' } })).status).toBe(404)
    expect((await fetch(`${base}/snapshots/${snapshot.id}/pages/${first.id}/video?revision=0`, { headers: { 'X-Motion-Manga-Local': '1' } })).status).toBe(404)
    expect((await api<{ snapshots: LocalSnapshot[] }>('/snapshots')).value.snapshots).toEqual([])
    expect((await originals.original(first.id)).bytes).toEqual(bytes)
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()))
    await rm(temporary, { recursive: true, force: true })
  }
})
