// @vitest-environment node
import { createServer } from 'node:http'
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { spawnSync } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import sharp from 'sharp'
import { expect, it } from 'vitest'
import type { LocalChapter, LocalDraft, LocalProject, LocalRenderJob, LocalSnapshot, RawRegion } from '../../src/features/local-projects/contracts.ts'
import { LocalProjectStore } from './store.ts'
import { LocalRenderService } from './render-service.ts'
import { createWorkingSource } from './working-source.ts'
import { createLocalProjectsHandler } from './http.ts'

it('real native HTTP and encoder complete upload/draft/reopen/render/order/snapshot/replace/unpublish without private fixtures', async () => {
  const temporary = await mkdtemp(join(tmpdir(), 'motion-manga-full-local-')), root = join(temporary, 'private')
  let server: Server | undefined, renderer = new LocalRenderService(root), base = ''
  const headers = { 'X-Motion-Manga-Local': '1' }
  async function open() {
    const handler = createLocalProjectsHandler(new LocalProjectStore(root), { renderer, workingSource: createWorkingSource })
    server = createServer((req, res) => { void handler(req, res) })
    await new Promise<void>(resolve => server!.listen(0, '127.0.0.1', resolve))
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/local-projects`
  }
  async function close() {
    if (server) await new Promise<void>(resolve => server!.close(() => resolve()))
    server = undefined; await renderer.shutdown()
  }
  async function api<T = unknown>(path: string, value?: unknown, method = value ? 'POST' : 'GET') {
    const response = await fetch(base + path, { method, headers: { ...headers, 'Content-Type': 'application/json' }, ...(value ? { body: JSON.stringify(value) } : {}) })
    return { status: response.status, value: await response.json() as T }
  }
  const pixels = Buffer.alloc(16 * 16 * 3, 90)
  for (let y = 4; y < 8; y++) for (let x = 4; x < 8; x++) pixels[(y * 16 + x) * 3] = 240
  const original = await sharp(pixels, { raw: { width: 16, height: 16, channels: 3 } }).png().toBuffer()
  try {
    await open()
    const projects: LocalProject[] = []
    for (const name of ['first.png', 'second.png']) {
      const response = await fetch(base, { method: 'POST', headers: { ...headers, 'Content-Type': 'application/octet-stream', 'X-File-Name': name }, body: original })
      expect(response.status).toBe(201)
      projects.push((await response.json() as { project: LocalProject }).project)
    }
    const projectId = projects[0].id
    const initial = (await api<{ draft: LocalDraft }>(`/${projectId}/draft`)).value.draft
    const actor: RawRegion = { id: 'actor', label: 'Manual rectangle', role: 'actor', selection: { x: '0.25', y: '0.25', width: '0.25', height: '0.25', strokes: [{ mode: 'erase', radius: '0.01', points: [{ x: .25, y: .25 }] }] },
      motion: { type: 'translate', anchorX: '0.5', anchorY: '0.5', dx: '', dy: '0.25', angle: '0', start: '0', duration: '0.25', cycles: '1', period: '', pause: '', wristInfluence: '', endState: 'hold', easing: 'smooth' } }
    const incomplete = (await api<{ draft: LocalDraft }>(`/${projectId}/draft`, { expectedRevision: 0, draft: { ...initial, duration: '0.5', fps: '4', regions: [actor] } }, 'PUT')).value.draft
    expect(incomplete.regions[0].motion.dx).toBe('')
    expect((await api(`/${projectId}/render`, { expectedRevision: 1 })).status).toBe(422)
    await close(); renderer = new LocalRenderService(root); await open()
    expect((await api<{ draft: LocalDraft }>(`/${projectId}/draft`)).value.draft).toEqual(incomplete)
    expect(Buffer.from(await (await fetch(`${base}/${projectId}/original`, { headers })).arrayBuffer())).toEqual(original)
    const corrected = { ...incomplete, regions: [{ ...actor, motion: { ...actor.motion, dx: '0.25' } }] }
    const saved = (await api<{ draft: LocalDraft }>(`/${projectId}/draft`, { expectedRevision: 1, draft: corrected }, 'PUT')).value.draft
    const render = await api<{ job: LocalRenderJob }>(`/${projectId}/render`, { expectedRevision: saved.revision })
    expect(render.status).toBe(202)
    await renderer.wait(render.value.job.id)
    const finished = (await api<{ job: LocalRenderJob }>(`/${projectId}/jobs/${render.value.job.id}`)).value.job
    expect(finished.status).toBe('completed')
    const video = await fetch(`${base}/${projectId}/artifacts/${finished.id}/video`, { headers })
    expect(video.headers.get('content-type')).toBe('video/webm')
    const encoded = Buffer.from(await video.arrayBuffer())
    const decoded = spawnSync('/snap/bin/ffmpeg', ['-v', 'error', '-i', 'pipe:0', '-f', 'framemd5', '-'], { input: encoded, encoding: 'utf8' })
    expect(decoded.status).toBe(0)
    expect(decoded.stdout.split('\n').filter(line => /^0,/.test(line))).toHaveLength(2)
    const secondDraft = (await api<{ draft: LocalDraft }>(`/${projects[1].id}/draft`)).value.draft
    const secondSaved = (await api<{ draft: LocalDraft }>(`/${projects[1].id}/draft`, { expectedRevision: 0, draft: { ...secondDraft, duration: '0.5', fps: '4' } }, 'PUT')).value.draft
    const secondJob = (await api<{ job: LocalRenderJob }>(`/${projects[1].id}/render`, { expectedRevision: secondSaved.revision })).value.job
    await renderer.wait(secondJob.id)
    const chapter = (await api<{ chapter: LocalChapter }>('/chapters', { name: 'Synthetic chapter', pageIds: projects.map(project => project.id) })).value.chapter
    const reordered = (await api<{ chapter: LocalChapter }>(`/chapters/${chapter.id}`, { expectedRevision: 0, name: chapter.name, pageIds: [...chapter.pageIds].reverse() }, 'PUT')).value.chapter
    const snapshotResponse = await api<{ snapshot: LocalSnapshot }>('/snapshots', { chapterId: chapter.id, expectedChapterRevision: 1, reviewed: true })
    expect(snapshotResponse.status).toBe(201)
    const snapshot = snapshotResponse.value.snapshot
    expect(snapshot.pages.map(page => page.projectId)).toEqual(reordered.pageIds)
    const changed = (await api<{ draft: LocalDraft }>(`/${projectId}/draft`, { expectedRevision: saved.revision, draft: { ...saved, duration: '' } }, 'PUT')).value.draft
    expect((await api(`/${projectId}/render`, { expectedRevision: changed.revision })).status).toBe(422)
    expect((await api(`/snapshots/${snapshot.id}`, { expectedRevision: 0, chapterId: chapter.id, expectedChapterRevision: 1, reviewed: true }, 'PUT')).status).toBe(409)
    expect((await api<{ snapshot: LocalSnapshot }>(`/snapshots/${snapshot.id}`)).value.snapshot).toEqual(snapshot)
    const restored = (await api<{ draft: LocalDraft }>(`/${projectId}/draft`, { expectedRevision: changed.revision, draft: { ...changed, duration: '0.5' } }, 'PUT')).value.draft
    const replacement = (await api<{ job: LocalRenderJob }>(`/${projectId}/render`, { expectedRevision: restored.revision })).value.job
    await renderer.wait(replacement.id)
    expect((await api<{ snapshot: LocalSnapshot }>(`/snapshots/${snapshot.id}`, { expectedRevision: 0, chapterId: chapter.id, expectedChapterRevision: 1, reviewed: true }, 'PUT')).value.snapshot.revision).toBe(1)
    expect((await fetch(`${base}/snapshots/${snapshot.id}/pages/${projectId}/video`, { headers })).status).toBe(200)
    expect((await api(`/snapshots/${snapshot.id}`, { expectedRevision: 1 }, 'DELETE')).status).toBe(200)
    expect((await api(`/snapshots/${snapshot.id}`)).status).toBe(404)
    expect((await fetch(`${base}/snapshots/${snapshot.id}/pages/${projectId}/video`, { headers })).status).toBe(404)
    expect(Buffer.from(await (await fetch(`${base}/${projectId}/original`, { headers })).arrayBuffer())).toEqual(original)
  } finally { await close(); await rm(temporary, { recursive: true, force: true }) }
})
