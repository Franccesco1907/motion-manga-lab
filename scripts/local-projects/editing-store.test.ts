// @vitest-environment node
import { createHash, randomUUID } from 'node:crypto'
import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import sharp from 'sharp'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { LocalDraft, LocalRenderArtifact, RawRegion } from '../../src/features/local-projects/contracts.ts'
import { LocalProjectStore } from './store.ts'
import { EditingStore } from './editing-store.ts'

vi.mock('node:fs/promises', async importOriginal => {
  const actual = await importOriginal<typeof import('node:fs/promises')>()
  return { ...actual, writeFile: vi.fn(actual.writeFile) }
})

let root: string
let originals: LocalProjectStore
let editing: EditingStore
let bytes: Buffer
let projectId: string
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'motion-manga-editing-'))
  originals = new LocalProjectStore(join(root, 'private'))
  editing = new EditingStore(originals)
  bytes = await sharp({ create: { width: 8, height: 6, channels: 3, background: '#56789a' } }).png().toBuffer()
  projectId = (await originals.import(bytes, 'first')).id
})
afterEach(async () => { await rm(root, { recursive: true, force: true }) })

const region = (): RawRegion => ({
  id: 'part-1', label: 'Part', role: 'actor',
  selection: { x: '0.25', y: '0.25', width: '0.25', height: '0.25', strokes: [] },
  motion: { type: 'translate', anchorX: '0.5', anchorY: '0.5', dx: '', dy: '-', angle: 'not a number', start: '0', duration: '1', cycles: '1', period: '', pause: '', wristInfluence: '', endState: 'hold', easing: 'smooth' },
})
const completeArtifact = (draft: LocalDraft): LocalRenderArtifact => ({
  id: randomUUID(), projectId: draft.projectId, sourceVersion: draft.sourceVersion, draftRevision: draft.revision,
  normalizationVersion: 'working-image-v1', width: 8, height: 6, duration: 6, fps: 24, createdAt: new Date().toISOString(), videoMime: 'video/webm',
})
const provider = (artifacts: LocalRenderArtifact[]) => ({
  latestCompleted: async (id: string) => artifacts.find(artifact => artifact.projectId === id),
  readAsset: async () => ({ bytes, mimeType: 'image/png' }),
})

describe('coherent versioned local drafts', () => {
  it('saves and reopens incomplete raw inputs exactly without numeric coercion', async () => {
    const initial = await editing.getDraft(projectId)
    expect(initial).toMatchObject({ schemaVersion: 1, revision: 0, normalizationVersion: 'working-image-v1', sourceVersion: createHash('sha256').update(bytes).digest('hex') })
    const draft = { ...initial, duration: '', regions: [region(), { ...region(), id: 'part-2', label: '' }] }
    const saved = await editing.saveDraft(projectId, 0, draft)
    expect(saved).toEqual({ ...draft, revision: 1 })
    expect(await new EditingStore(new LocalProjectStore(originals.root)).getDraft(projectId)).toEqual(saved)
    expect((await originals.original(projectId)).bytes).toEqual(bytes)
  })

  it('rejects stale concurrent saves and wrong source/schema without changing a valid saved draft', async () => {
    const initial = await editing.getDraft(projectId)
    const results = await Promise.allSettled([editing.saveDraft(projectId, 0, initial), new EditingStore(originals).saveDraft(projectId, 0, initial)])
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1)
    expect(results.find(result => result.status === 'rejected')).toMatchObject({ reason: { code: 'stale_revision' } })
    const saved = await editing.getDraft(projectId)
    for (const mutation of [{ sourceVersion: '0'.repeat(64) }, { schemaVersion: 3 }, { projectId: randomUUID() }, { normalizationVersion: 'other' }]) {
      await expect(editing.saveDraft(projectId, 1, { ...saved, ...mutation })).rejects.toMatchObject({ code: 'invalid_draft' })
    }
    expect(await editing.getDraft(projectId)).toEqual(saved)
  })

  it('rejects unsafe references and oversized shapes but keeps bounded invalid numeric strings', async () => {
    const initial = await editing.getDraft(projectId)
    for (const draft of [{ ...initial, regions: [{ ...region(), id: '../escape' }] }, { ...initial, duration: 'x'.repeat(65) }, { ...initial, regions: Array.from({ length: 17 }, (_, i) => ({ ...region(), id: `part-${i}` })) }]) {
      await expect(editing.saveDraft(projectId, 0, draft)).rejects.toMatchObject({ code: 'invalid_draft' })
    }
    await expect(editing.getDraft('../escape')).rejects.toMatchObject({ code: 'not_found' })
    await rm(join(originals.root, projectId, 'original'))
    await expect(editing.getDraft(projectId)).rejects.toMatchObject({ code: 'not_found' })
  })

  it('retains previous coherent state and original after an atomic write failure', async () => {
    const initial = await editing.getDraft(projectId), saved = await editing.saveDraft(projectId, 0, initial)
    vi.mocked(writeFile).mockRejectedValueOnce(new Error('Synthetic full disk at private path'))
    await expect(editing.saveDraft(projectId, 1, { ...saved, duration: '2' })).rejects.toMatchObject({ code: 'storage_unavailable' })
    expect(await editing.getDraft(projectId)).toEqual(saved)
    expect((await originals.original(projectId)).bytes).toEqual(bytes)
    expect((await readdir(join(originals.root, '.editing-v1', 'drafts'))).some(name => name.endsWith('.tmp'))).toBe(false)
  })
})

describe('ordered local chapters and reviewed reading snapshots', () => {
  it('persists chapter order/rename with optimistic revisions and rejects missing pages', async () => {
    const second = (await originals.import(bytes, 'second')).id
    const chapter = await editing.createChapter('Chapter', [projectId, second])
    const reordered = await editing.saveChapter(chapter.id, 0, 'Renamed', [second, projectId])
    expect(await new EditingStore(originals).listChapters()).toEqual([reordered])
    await expect(editing.saveChapter(chapter.id, 0, 'old', [projectId])).rejects.toMatchObject({ code: 'stale_revision' })
    await expect(editing.createChapter('missing', [randomUUID()])).rejects.toMatchObject({ code: 'not_found' })
    expect(await editing.getChapter(chapter.id)).toEqual(reordered)
  })

  it('permits exactly one concurrent same-revision reorder across store instances', async () => {
    const second = (await originals.import(bytes, 'second')).id
    const chapter = await editing.createChapter('Chapter', [projectId, second])
    const results = await Promise.allSettled([
      editing.saveChapter(chapter.id, 0, 'First reorder', [second, projectId]),
      new EditingStore(originals).saveChapter(chapter.id, 0, 'Stale reorder', [projectId]),
    ])
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1)
    expect(results.find(result => result.status === 'rejected')).toMatchObject({ reason: { code: 'stale_revision' } })
    expect(await editing.getChapter(chapter.id)).toMatchObject({ revision: 1, name: 'First reorder', pageIds: [second, projectId] })
  })

  it('captures an immutable ordered snapshot, requires explicit review, and preserves it across later edits', async () => {
    const second = (await originals.import(bytes, 'second')).id
    const chapter = await editing.createChapter('Chapter', [second, projectId])
    const drafts = await Promise.all(chapter.pageIds.map(id => editing.getDraft(id)))
    const renderer = provider(drafts.map(completeArtifact))
    await expect(editing.createSnapshot(chapter.id, 0, false, renderer)).rejects.toMatchObject({ code: 'review_required' })
    const snapshot = await editing.createSnapshot(chapter.id, 0, true, renderer)
    expect(snapshot.pages.map(page => page.projectId)).toEqual([second, projectId])
    expect(JSON.stringify(snapshot)).not.toMatch(/regions|selection|originalPath|\/private\//)
    await editing.saveDraft(projectId, 0, { ...drafts[1], regions: [region()] })
    await editing.saveChapter(chapter.id, 0, 'Changed', [projectId])
    expect(await new EditingStore(originals).getSnapshot(snapshot.id)).toEqual(snapshot)
    expect((await editing.snapshotAsset(snapshot.id, projectId, 'poster', renderer)).bytes).toEqual(bytes)
    await expect(editing.snapshotAsset(snapshot.id, randomUUID(), 'poster', renderer)).rejects.toMatchObject({ code: 'not_found' })
  })

  it('refuses failed/stale render replacement without disturbing an existing snapshot', async () => {
    const chapter = await editing.createChapter('Chapter', [projectId]), draft = await editing.getDraft(projectId)
    const artifact = completeArtifact(draft), renderer = provider([artifact])
    const snapshot = await editing.createSnapshot(chapter.id, 0, true, renderer)
    await editing.saveDraft(projectId, 0, draft)
    await expect(editing.replaceSnapshot(snapshot.id, 0, chapter.id, 0, true, renderer)).rejects.toMatchObject({ code: 'matching_render_required' })
    await expect(editing.replaceSnapshot(snapshot.id, 0, chapter.id, 0, true, provider([]))).rejects.toMatchObject({ code: 'matching_render_required' })
    expect(await editing.getSnapshot(snapshot.id)).toEqual(snapshot)
    const replacement = await editing.replaceSnapshot(snapshot.id, 0, chapter.id, 0, true, provider([completeArtifact(await editing.getDraft(projectId))]))
    expect(replacement.revision).toBe(1)
    await expect(editing.replaceSnapshot(snapshot.id, 0, chapter.id, 0, true, renderer)).rejects.toMatchObject({ code: 'stale_revision' })
    await editing.unpublishSnapshot(snapshot.id, 1)
    await expect(editing.getSnapshot(snapshot.id)).rejects.toMatchObject({ code: 'not_found' })
    await expect(editing.snapshotAsset(snapshot.id, projectId, 'poster', renderer)).rejects.toMatchObject({ code: 'not_found' })
    expect(await editing.listSnapshots()).toEqual([])
  })

  it('keeps a prior snapshot and permits explicit retry after the active-head write fails', async () => {
    const chapter = await editing.createChapter('Chapter', [projectId]), renderer = provider([completeArtifact(await editing.getDraft(projectId))])
    const previous = await editing.createSnapshot(chapter.id, 0, true, renderer)
    const actual = await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises')
    vi.mocked(writeFile).mockImplementationOnce(actual.writeFile).mockRejectedValueOnce(new Error('Synthetic snapshot head write failure'))
    await expect(editing.replaceSnapshot(previous.id, 0, chapter.id, 0, true, renderer)).rejects.toMatchObject({ code: 'storage_unavailable' })
    expect(await editing.getSnapshot(previous.id)).toEqual(previous)
    await expect(editing.replaceSnapshot(previous.id, 0, chapter.id, 0, true, renderer)).resolves.toMatchObject({ id: previous.id, revision: 1 })
  })

  it('does not resurrect a withdrawn snapshot through a concurrent stale replacement', async () => {
    const chapter = await editing.createChapter('Chapter', [projectId]), renderer = provider([completeArtifact(await editing.getDraft(projectId))])
    const snapshot = await editing.createSnapshot(chapter.id, 0, true, renderer)
    const results = await Promise.allSettled([
      editing.unpublishSnapshot(snapshot.id, 0),
      new EditingStore(originals).replaceSnapshot(snapshot.id, 0, chapter.id, 0, true, renderer),
    ])
    expect(results[0].status).toBe('fulfilled')
    expect(results[1]).toMatchObject({ status: 'rejected', reason: { code: 'stale_revision' } })
    await expect(editing.getSnapshot(snapshot.id)).rejects.toMatchObject({ code: 'not_found' })
    expect(await editing.listSnapshots()).toEqual([])
  })

  it('captures only the public artifact fields, never processing paths or raw drafts', async () => {
    const chapter = await editing.createChapter('Chapter', [projectId])
    const artifact = Object.assign(completeArtifact(await editing.getDraft(projectId)), { serverPath: '/private/root/job', draft: { regions: [region()] } })
    const snapshot = await editing.createSnapshot(chapter.id, 0, true, provider([artifact]))
    expect(JSON.stringify(snapshot)).not.toMatch(/serverPath|\/private\/|regions|selection/)
  })

  it('serves the captured artifact revision after replacement, while withdrawal denies all revisions', async () => {
    const chapter = await editing.createChapter('Chapter', [projectId]), draft = await editing.getDraft(projectId)
    let artifact = completeArtifact(draft)
    const renderer = { latestCompleted: async () => artifact, readAsset: async (_projectId: string, id: string) => ({ bytes: Buffer.from(id), mimeType: 'video/webm' }) }
    const oldId = artifact.id, snapshot = await editing.createSnapshot(chapter.id, 0, true, renderer)
    const saved = await editing.saveDraft(projectId, 0, draft)
    artifact = completeArtifact(saved)
    await editing.replaceSnapshot(snapshot.id, 0, chapter.id, 0, true, renderer)
    expect((await editing.snapshotAsset(snapshot.id, projectId, 'video', renderer, 0)).bytes.toString()).toBe(oldId)
    expect((await editing.snapshotAsset(snapshot.id, projectId, 'video', renderer, 1)).bytes.toString()).toBe(artifact.id)
    await editing.unpublishSnapshot(snapshot.id, 1)
    await expect(editing.snapshotAsset(snapshot.id, projectId, 'video', renderer, 0)).rejects.toMatchObject({ code: 'not_found' })
  })
})
