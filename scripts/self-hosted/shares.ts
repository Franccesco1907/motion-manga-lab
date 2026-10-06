import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { join } from 'node:path'
import type { OwnerShare, ShareCreation, SharedReading } from '../../src/features/sharing/contracts.ts'
import { LocalProjectError } from '../local-projects/store.ts'
import { isUuid, revision } from '../local-projects/draft-validation.ts'
import type { OwnerServicesRegistry } from './owners.ts'
import { PrivateFiles } from './files.ts'
interface ShareRecord extends OwnerShare { ownerId: string; tokenHash: string; active: boolean }
const TOKEN = /^[a-zA-Z0-9_-]{43}$/
const hash = (token: string) => createHash('sha256').update(token).digest('hex')
const missing = () => new LocalProjectError('not_found', 'This reading link is unavailable.', 404)
const publicShare = (record: ShareRecord): OwnerShare => ({ id: record.id, snapshotId: record.snapshotId, snapshotRevision: record.snapshotRevision, name: record.name, createdAt: record.createdAt, revision: record.revision, rightsConfirmed: record.rightsConfirmed, rightsConfirmedAt: record.rightsConfirmedAt, attribution: record.attribution })
export class ShareStore {
  private files: PrivateFiles
  private owners: OwnerServicesRegistry
  constructor(root: string, owners: OwnerServicesRegistry) { this.files = new PrivateFiles(join(root, 'sharing')); this.owners = owners }
  private async record(id: string): Promise<ShareRecord> {
    if (!isUuid(id)) throw missing()
    const record = await this.files.read(['records'], `${id}.json`) as ShareRecord | undefined
    if (!record || record.id !== id || !isUuid(record.ownerId) || !isUuid(record.snapshotId) || !/^[a-f0-9]{64}$/.test(record.tokenHash) || typeof record.active !== 'boolean' || typeof record.name !== 'string' || record.rightsConfirmed !== true || !Number.isFinite(Date.parse(record.rightsConfirmedAt)) || typeof record.attribution !== 'string') throw missing()
    revision(record.revision); revision(record.snapshotRevision)
    return record
  }
  private async capture(ownerId: string, snapshotId: string, expected: unknown, reviewed: unknown, rightsConfirmed: unknown, attribution: unknown) {
    if (reviewed !== true) throw new LocalProjectError('review_required', 'Review the reading version and explicitly allow sharing its derived pages.', 422)
    if (rightsConfirmed !== true) throw new LocalProjectError('publication_permission_required', 'Confirm that you have permission to share this content. Account ownership is not content ownership.', 422)
    if (attribution !== undefined && (typeof attribution !== 'string' || attribution.length > 2000 || Buffer.byteLength(attribution) > 8192)) throw new LocalProjectError('invalid_attribution', 'Provide at most 2000 characters of plain-text attribution.', 422)
    const owner = this.owners.get(ownerId), snapshot = await owner.editing.getSnapshot(snapshotId)
    if (snapshot.revision !== revision(expected)) throw new LocalProjectError('stale_revision', 'Reload the reviewed reading snapshot before sharing.', 409)
    for (const page of snapshot.pages) {
      const draft = await owner.editing.getDraft(page.projectId)
      if (draft.sourceVersion !== page.artifact.sourceVersion || draft.revision !== page.artifact.draftRevision) throw new LocalProjectError('matching_snapshot_required', 'Save, render and review an up-to-date reading snapshot before sharing.', 409)
      for (const kind of ['poster', 'video'] as const) await owner.editing.snapshotAsset(snapshot.id, page.projectId, kind, owner.renderer, snapshot.revision)
    }
    return { snapshot, attribution: typeof attribution === 'string' ? Array.from(attribution).filter(char => { const code = char.charCodeAt(0); return code >= 32 && code !== 127 || [9,10,13].includes(code) }).join('').trim() : '' }
  }
  async list(ownerId: string): Promise<OwnerShare[]> {
    const records: OwnerShare[] = []
    for (const file of await this.files.list(['records'])) if (isUuid(file.replace(/\.json$/, ''))) {
      const record = await this.record(file.replace(/\.json$/, ''))
      if (record.ownerId === ownerId && record.active) {
        try { await this.owners.get(ownerId).editing.getSnapshot(record.snapshotId, record.snapshotRevision); records.push(publicShare(record)) }
        catch (error) { if (!(error instanceof LocalProjectError) || error.code !== 'not_found') throw error }
      }
    }
    return records.sort((a,b) => b.createdAt.localeCompare(a.createdAt))
  }
  private async commit(record: ShareRecord, token: string, exclusive: boolean) {
    const filename = `${hash(token)}.json`
    await this.files.write(['tokens'], filename, { shareId: record.id }, true)
    try { await this.files.write(['records'], `${record.id}.json`, record, exclusive) }
    catch (error) { await this.files.remove(['tokens'], filename); throw error }
    return { share: publicShare(record), token, path: `/read/${token}` }
  }
  async create(ownerId: string, snapshotId: string, expected: unknown, reviewed: unknown, rightsConfirmed: unknown = undefined, attribution: unknown = undefined): Promise<ShareCreation> {
    return this.files.transaction(async () => {
      if ((await this.files.list(['records'])).filter(file => file.endsWith('.json')).length >= 1000) throw new LocalProjectError('share_limit', 'The bounded reading-link limit has been reached.', 409)
      const { snapshot, attribution: credits } = await this.capture(ownerId, snapshotId, expected, reviewed, rightsConfirmed, attribution), token = randomBytes(32).toString('base64url')
      const record: ShareRecord = { id: randomUUID(), ownerId, snapshotId, snapshotRevision: snapshot.revision, name: snapshot.name, createdAt: new Date().toISOString(), revision: 0, tokenHash: hash(token), active: true, rightsConfirmed: true, rightsConfirmedAt: new Date().toISOString(), attribution: credits }
      return this.commit(record, token, true)
    })
  }
  async replace(ownerId: string, id: string, expected: unknown, snapshotId: string, expectedSnapshot: unknown, reviewed: unknown, rightsConfirmed: unknown = undefined, attribution: unknown = undefined): Promise<ShareCreation> {
    return this.files.transaction(async () => {
      const current = await this.record(id)
      if (current.ownerId !== ownerId || !current.active) throw missing()
      if (revision(expected) !== current.revision) throw new LocalProjectError('stale_revision', 'Reload this reading link before replacing it.', 409)
      const { snapshot, attribution: credits } = await this.capture(ownerId, snapshotId, expectedSnapshot, reviewed, rightsConfirmed, attribution), token = randomBytes(32).toString('base64url')
      // Only the newly committed hash is accepted, so every previous token revision stops working.
      const result = await this.commit({ ...current, snapshotId, snapshotRevision: snapshot.revision, name: snapshot.name, revision: current.revision + 1, tokenHash: hash(token), rightsConfirmed: true, rightsConfirmedAt: new Date().toISOString(), attribution: credits }, token, false)
      await this.files.remove(['tokens'], `${current.tokenHash}.json`)
      return result
    })
  }
  async revoke(ownerId: string, id: string, expected: unknown) {
    await this.files.transaction(async () => {
      const current = await this.record(id)
      if (current.ownerId !== ownerId || !current.active) throw missing()
      if (revision(expected) !== current.revision) throw new LocalProjectError('stale_revision', 'Reload this reading link before withdrawing it.', 409)
      await this.files.write(['records'], `${id}.json`, { ...current, revision: current.revision + 1, active: false })
      await this.files.remove(['tokens'], `${current.tokenHash}.json`)
    })
  }
  private async byToken(token: string) {
    if (!TOKEN.test(token)) throw missing()
    const index = await this.files.read(['tokens'], `${hash(token)}.json`) as { shareId?: string } | undefined
    if (!index?.shareId) throw missing()
    const record = await this.record(index.shareId)
    if (!record.active || record.tokenHash !== hash(token)) throw missing()
    const owner = this.owners.get(record.ownerId), snapshot = await owner.editing.getSnapshot(record.snapshotId, record.snapshotRevision)
    return { record, owner, snapshot }
  }
  async read(token: string): Promise<SharedReading> {
    const { snapshot, record } = await this.byToken(token)
    return { name: snapshot.name, revision: record.revision, attribution: record.attribution, pages: snapshot.pages.map((page, index) => ({ index, name: page.name, width: page.artifact.width, height: page.artifact.height, duration: page.artifact.duration, fps: page.artifact.fps, videoMime: page.artifact.videoMime,
      posterPath: `/api/read/${token}/pages/${index}/poster`, videoPath: `/api/read/${token}/pages/${index}/video` })) }
  }
  async asset(token: string, index: number, kind: 'poster' | 'video') {
    const { owner, snapshot } = await this.byToken(token)
    if (!Number.isSafeInteger(index) || index < 0 || !['poster','video'].includes(kind) || !snapshot.pages[index]) throw missing()
    return owner.editing.snapshotAsset(snapshot.id, snapshot.pages[index].projectId, kind, owner.renderer, snapshot.revision)
  }
}
