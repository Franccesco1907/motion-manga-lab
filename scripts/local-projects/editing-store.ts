import { createHash, randomUUID } from 'node:crypto'
import { LOCAL_VIDEO_MIME, type LocalChapter, type LocalDraft, type LocalRenderArtifact, type LocalSnapshot } from '../../src/features/local-projects/contracts.ts'
import { isUuid, object, revision, validateDraft } from './draft-validation.ts'
import { StateFiles } from './state-files.ts'
import { LocalProjectError, type LocalProjectStore } from './store.ts'

export interface SnapshotRenderer {
  latestCompleted(projectId: string): Promise<LocalRenderArtifact | undefined>
  readAsset(projectId: string, artifactId: string, kind: 'poster' | 'video'): Promise<{ bytes: Buffer; mimeType: string }>
}
const missing = () => new LocalProjectError('not_found', 'This local editable resource is unavailable.', 404)
const stale = () => new LocalProjectError('stale_revision', 'Saved work changed. Keep your draft and reload the saved revision before retrying.', 409)
const badChapter = () => new LocalProjectError('invalid_chapter', 'Provide a name and at most 100 unique existing local page IDs.', 422)
const matchingRender = () => new LocalProjectError('matching_render_required', 'Every page needs a completed render matching its currently saved source and draft. Previous snapshots remain unchanged.', 409)
function publicArtifact(artifact: LocalRenderArtifact): LocalRenderArtifact {
  if (!isUuid(artifact.id) || !isUuid(artifact.projectId) || !/^[a-f0-9]{64}$/.test(artifact.sourceVersion) ||
    !Number.isSafeInteger(artifact.draftRevision) || artifact.draftRevision < 0 || artifact.normalizationVersion !== 'working-image-v1' ||
    !Number.isInteger(artifact.width) || !Number.isInteger(artifact.height) || artifact.width < 2 || artifact.height < 2 ||
    Math.max(artifact.width, artifact.height) > 1280 || !Number.isFinite(artifact.duration) || artifact.duration < .1 || artifact.duration > 6 ||
    !Number.isInteger(artifact.fps) || artifact.fps < 1 || artifact.fps > 24 || !Number.isFinite(Date.parse(artifact.createdAt)) ||
    !Object.values(LOCAL_VIDEO_MIME).includes(artifact.videoMime)) throw matchingRender()
  const { id, projectId, sourceVersion, draftRevision, normalizationVersion, width, height, duration, fps, createdAt, videoMime } = artifact
  return { id, projectId, sourceVersion, draftRevision, normalizationVersion, width, height, duration, fps, createdAt, videoMime }
}

export class EditingStore {
  private originals: LocalProjectStore
  private files: StateFiles
  constructor(originals: LocalProjectStore) { this.originals = originals; this.files = new StateFiles(originals) }

  async getDraft(projectId: string): Promise<LocalDraft> {
    const original = await this.originals.original(projectId)
    const sourceVersion = createHash('sha256').update(original.bytes).digest('hex')
    const stored = await this.files.read(['drafts'], `${projectId}.json`)
    if (stored !== undefined) return validateDraft(stored, projectId, sourceVersion)
    return { schemaVersion: 1, projectId, sourceVersion, normalizationVersion: 'working-image-v1', revision: 0, duration: '6', fps: '24', regions: [] }
  }

  async saveDraft(projectId: string, expectedRevision: unknown, value: unknown) {
    return this.files.transaction(async () => {
      const current = await this.getDraft(projectId)
      if (revision(expectedRevision) !== current.revision) throw stale()
      const draft = validateDraft(value, projectId, current.sourceVersion)
      if (draft.revision !== current.revision) throw stale()
      const saved = { ...draft, revision: current.revision + 1 }
      await this.files.write(['drafts'], `${projectId}.json`, saved)
      return saved
    })
  }

  private async chapterInput(name: unknown, pageIds: unknown) {
    if (typeof name !== 'string' || !name.trim() || name.length > 120 || !Array.isArray(pageIds) || pageIds.length > 100 ||
      pageIds.some(id => !isUuid(id)) || new Set(pageIds).size !== pageIds.length) throw badChapter()
    for (const id of pageIds) await this.originals.original(id as string)
    return { name: name.trim(), pageIds: pageIds as string[] }
  }

  async createChapter(name: unknown, pageIds: unknown): Promise<LocalChapter> {
    return this.files.transaction(async () => {
      const input = await this.chapterInput(name, pageIds), now = new Date().toISOString()
      const chapter = { id: randomUUID(), ...input, revision: 0, createdAt: now, updatedAt: now }
      await this.files.write(['chapters'], `${chapter.id}.json`, chapter, true)
      return chapter
    })
  }

  async getChapter(id: string): Promise<LocalChapter> {
    if (!isUuid(id)) throw missing()
    const value = await this.files.read(['chapters'], `${id}.json`)
    if (!value) throw missing()
    const record = object(value)
    if (record.id !== id || typeof record.name !== 'string' || !Array.isArray(record.pageIds) || record.pageIds.some(pageId => !isUuid(pageId)) ||
      typeof record.createdAt !== 'string' || typeof record.updatedAt !== 'string') throw missing()
    revision(record.revision)
    return record as unknown as LocalChapter
  }

  async listChapters() {
    const chapters: LocalChapter[] = []
    for (const file of await this.files.list(['chapters'])) {
      const id = file.replace(/\.json$/, '')
      if (isUuid(id)) chapters.push(await this.getChapter(id))
    }
    return chapters.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || b.id.localeCompare(a.id))
  }

  async saveChapter(id: string, expectedRevision: unknown, name: unknown, pageIds: unknown) {
    return this.files.transaction(async () => {
      const current = await this.getChapter(id)
      if (revision(expectedRevision) !== current.revision) throw stale()
      const saved = { ...current, ...await this.chapterInput(name, pageIds), revision: current.revision + 1, updatedAt: new Date().toISOString() }
      await this.files.write(['chapters'], `${id}.json`, saved)
      return saved
    })
  }

  private async capture(chapterId: string, chapterRevision: unknown, reviewed: unknown, renderer: SnapshotRenderer) {
    if (reviewed !== true) throw new LocalProjectError('review_required', 'Review the complete local chapter and explicitly confirm creating a reading snapshot.', 422)
    const chapter = await this.getChapter(chapterId)
    if (revision(chapterRevision) !== chapter.revision) throw stale()
    if (!chapter.pageIds.length) throw badChapter()
    const pages: LocalSnapshot['pages'] = []
    for (const projectId of chapter.pageIds) {
      const draft = await this.getDraft(projectId), original = await this.originals.original(projectId), artifact = await renderer.latestCompleted(projectId)
      if (!artifact || !isUuid(artifact.id) || artifact.projectId !== projectId || artifact.sourceVersion !== draft.sourceVersion || artifact.draftRevision !== draft.revision ||
        artifact.normalizationVersion !== draft.normalizationVersion || !Object.values(LOCAL_VIDEO_MIME).includes(artifact.videoMime)) {
        throw matchingRender()
      }
      // Confirm both immutable artifacts exist before advancing the active snapshot.
      await renderer.readAsset(projectId, artifact.id, 'poster')
      await renderer.readAsset(projectId, artifact.id, 'video')
      pages.push({ projectId, name: original.project.name, artifact: publicArtifact(artifact) })
    }
    return { chapterId, name: chapter.name, createdAt: new Date().toISOString(), pages }
  }

  async createSnapshot(chapterId: string, chapterRevision: unknown, reviewed: unknown, renderer: SnapshotRenderer): Promise<LocalSnapshot> {
    return this.files.transaction(async () => {
      const capture = await this.capture(chapterId, chapterRevision, reviewed, renderer)
      const snapshot = { id: randomUUID(), ...capture, revision: 0 }
      await this.commitSnapshot(snapshot)
      return snapshot
    })
  }

  private async commitSnapshot(snapshot: LocalSnapshot) {
    const parts = ['snapshots', snapshot.id], filename = `revision-${snapshot.revision}.json`
    await this.files.write(parts, filename, snapshot, true)
    try { await this.files.write(parts, 'current.json', { revision: snapshot.revision, active: true }) }
    catch (error) {
      await this.files.discardUncommitted(parts, filename)
      throw error
    }
  }

  private async head(id: string) {
    if (!isUuid(id)) throw missing()
    const value = await this.files.read(['snapshots', id], 'current.json')
    if (!value) throw missing()
    const head = object(value)
    if (typeof head.active !== 'boolean') throw missing()
    return { active: head.active, revision: revision(head.revision) }
  }

  async getSnapshot(id: string, capturedRevision?: number): Promise<LocalSnapshot> {
    const head = await this.head(id)
    if (!head.active) throw missing()
    const selected = capturedRevision ?? head.revision
    if (!Number.isSafeInteger(selected) || selected < 0 || selected > head.revision) throw missing()
    const snapshot = await this.files.read(['snapshots', id], `revision-${selected}.json`)
    if (!snapshot) throw missing()
    const saved = snapshot as LocalSnapshot
    if (saved.id !== id || saved.revision !== selected || !isUuid(saved.chapterId) || typeof saved.name !== 'string' || saved.name.length > 120 ||
      !Array.isArray(saved.pages) || saved.pages.length > 100 || !Number.isFinite(Date.parse(saved.createdAt))) throw missing()
    const pages = saved.pages.map(page => {
      if (!isUuid(page.projectId) || typeof page.name !== 'string' || page.name.length > 160 || !page.artifact || page.artifact.projectId !== page.projectId) throw missing()
      return { projectId: page.projectId, name: page.name, artifact: publicArtifact(page.artifact) }
    })
    return { id, chapterId: saved.chapterId, name: saved.name, revision: saved.revision, createdAt: saved.createdAt, pages }
  }

  async listSnapshots() {
    const snapshots: LocalSnapshot[] = []
    for (const id of await this.files.list(['snapshots'])) if (isUuid(id)) {
      try { snapshots.push(await this.getSnapshot(id)) }
      catch (error) { if (!(error instanceof LocalProjectError) || error.code !== 'not_found') throw error }
    }
    return snapshots.sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id))
  }

  async replaceSnapshot(id: string, expectedRevision: unknown, chapterId: string, chapterRevision: unknown, reviewed: unknown, renderer: SnapshotRenderer) {
    return this.files.transaction(async () => {
      const head = await this.head(id)
      if (revision(expectedRevision) !== head.revision) throw stale()
      const captured = await this.capture(chapterId, chapterRevision, reviewed, renderer)
      const snapshot = { id, ...captured, revision: head.revision + 1 }
      await this.commitSnapshot(snapshot)
      return snapshot
    })
  }

  async unpublishSnapshot(id: string, expectedRevision: unknown) {
    return this.files.transaction(async () => {
      const head = await this.head(id)
      if (revision(expectedRevision) !== head.revision) throw stale()
      await this.files.write(['snapshots', id], 'current.json', { revision: head.revision + 1, active: false })
    })
  }

  async snapshotAsset(id: string, projectId: string, kind: 'poster' | 'video', renderer: SnapshotRenderer, capturedRevision?: number) {
    const snapshot = await this.getSnapshot(id, capturedRevision), page = snapshot.pages.find(page => page.projectId === projectId)
    if (!page) throw missing()
    return renderer.readAsset(projectId, page.artifact.id, kind)
  }
}
