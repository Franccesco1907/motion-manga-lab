// @vitest-environment node
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { createServer } from 'node:http'
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import sharp from 'sharp'
import { expect, it } from 'vitest'
import type { LocalDraft } from '../../src/features/local-projects/contracts.ts'
import { LocalProjectStore } from './store.ts'
import { EditingStore } from './editing-store.ts'
import { LocalRenderService } from './render-service.ts'
import { region } from './render-fixtures.ts'
import { createLocalProjectsHandler } from './http.ts'

it('encodes a finite schema2 affine artifact with explicit versions and keeps old records on legacy dispatch', async () => {
  const temporary = await mkdtemp(join(tmpdir(), 'manga-affine-codec-')), root = join(temporary, 'private')
  const service = new LocalRenderService(root)
  let server: Server | undefined
  try {
    const rgb = Buffer.alloc(32 * 24 * 3, 90)
    for (let y = 6; y < 12; y++) for (let x = 8; x < 16; x++) rgb[(y * 32 + x) * 3] = 240
    const bytes = await sharp(rgb, { raw: { width: 32, height: 24, channels: 3 } }).png().toBuffer()
    const originals = new LocalProjectStore(root), editing = new EditingStore(originals), project = await originals.import(bytes, 'synthetic.png')
    const old = await editing.getDraft(project.id)
    const selected = region({ id: 'affine-part' })
    const draft: LocalDraft = { ...old, schemaVersion: 2, duration: '1', fps: '4', regions: [{ ...selected, motion: { ...selected.motion, type: 'stretch', scaleX: '1.25', scaleY: '.75', anchorX: '0.25', anchorY: '0.25' } }] }
    const handler = createLocalProjectsHandler(originals, { renderer: service })
    server = createServer((req, res) => { void handler(req, res) })
    await new Promise<void>(resolve => server!.listen(0, '127.0.0.1', resolve))
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/local-projects/${project.id}`
    const headers = { 'X-Motion-Manga-Local': '1', 'Content-Type': 'application/json' }
    const savedResponse = await fetch(`${base}/draft`, { method: 'PUT', headers, body: JSON.stringify({ expectedRevision: 0, draft }) })
    expect(savedResponse.status).toBe(200)
    const saved = (await savedResponse.json() as { draft: LocalDraft }).draft
    const jobResponse = await fetch(`${base}/render`, { method: 'POST', headers, body: JSON.stringify({ expectedRevision: saved.revision }) })
    expect(jobResponse.status).toBe(202)
    const job = (await jobResponse.json() as { job: Awaited<ReturnType<LocalRenderService['start']>> }).job
    expect(job).toMatchObject({ rendererVersion: 'affine-a-v2', draftSchemaVersion: 2 })
    await service.wait(job.id)
    const completed = await service.get(project.id, job.id)
    expect(completed.status).toBe('completed')
    expect(completed.artifact).toMatchObject({ rendererVersion: 'affine-a-v2', draftSchemaVersion: 2, duration: 1, fps: 4 })
    const video = await service.readAsset(project.id, job.id, 'video')
    const decoded = spawnSync('/snap/bin/ffmpeg', ['-v', 'error', '-i', 'pipe:0', '-f', 'framemd5', '-'], { input: video.bytes, encoding: 'utf8' })
    expect(decoded.status).toBe(0)
    expect(decoded.stdout.split('\n').filter(line => /^0,/.test(line))).toHaveLength(4)
    const chapter = await editing.createChapter('Affine chapter', [project.id])
    const wrongVersion = { latestCompleted: async () => ({ ...completed.artifact!, rendererVersion: 'legacy-a-v1' as const, draftSchemaVersion: 1 as const }), readAsset: service.readAsset.bind(service) }
    await expect(editing.createSnapshot(chapter.id, 0, true, wrongVersion)).rejects.toMatchObject({ code: 'matching_render_required' })
    expect((await editing.createSnapshot(chapter.id, 0, true, service)).pages[0].artifact).toMatchObject({ rendererVersion: 'affine-a-v2', draftSchemaVersion: 2 })
    const legacyJob = await service.start(project.id, old, bytes)
    await service.wait(legacyJob.id)
    const legacyRecord = await service.get(project.id, legacyJob.id)
    expect(legacyRecord).toMatchObject({ rendererVersion: 'legacy-a-v1', draftSchemaVersion: 1 })
    const withoutVersions = { ...legacyRecord }
    delete withoutVersions.rendererVersion; delete withoutVersions.draftSchemaVersion
    if (withoutVersions.artifact) { delete withoutVersions.artifact.rendererVersion; delete withoutVersions.artifact.draftSchemaVersion }
    await writeFile(join(root, 'jobs', legacyJob.id, 'job.json'), JSON.stringify(withoutVersions))
    const reopened = await new LocalRenderService(root).get(project.id, legacyJob.id)
    expect(reopened).toMatchObject({ rendererVersion: 'legacy-a-v1', draftSchemaVersion: 1 })
    expect((await originals.original(project.id)).bytes).toEqual(bytes)
  } finally {
    if (server) await new Promise<void>(resolve => server!.close(() => resolve()))
    await service.shutdown(); await rm(temporary, { recursive: true, force: true })
  }
})
