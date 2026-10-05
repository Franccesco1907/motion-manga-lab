import type { IncomingMessage, ServerResponse } from 'node:http'
import { LOCAL_ASSISTANCE_MODE, type LocalAssistanceCapabilities, type LocalAssistanceJob, type LocalAssistanceMode, type LocalDraft, type LocalRenderArtifact, type LocalRenderJob } from '../../src/features/local-projects/contracts.ts'
import { object, revision } from './draft-validation.ts'
import { EditingStore, type SnapshotRenderer } from './editing-store.ts'
import { LocalProjectError, type LocalProjectStore } from './store.ts'

export interface RenderBackend extends SnapshotRenderer {
  start(projectId: string, draft: LocalDraft, original: Buffer): Promise<LocalRenderJob>
  get(projectId: string, jobId: string): Promise<LocalRenderJob>
  cancel(projectId: string, jobId: string): Promise<LocalRenderJob>
}
export interface AuthoringServices {
  editing?: EditingStore
  renderer?: RenderBackend
  workingSource?: (original: Buffer) => Promise<{ png: Buffer; width: number; height: number; sourceVersion: string }>
  assistance?: AssistanceBackend
}
export interface AssistanceBackend {
  capabilities(): Promise<LocalAssistanceCapabilities>
  start(projectId: string, draft: LocalDraft, original: Buffer, mode: LocalAssistanceMode, regionId?: string): Promise<LocalAssistanceJob>
  get(projectId: string, jobId: string): Promise<LocalAssistanceJob>
  cancel(projectId: string, jobId: string): Promise<LocalAssistanceJob>
  readMask(projectId: string, maskId: string, sourceVersion: string): Promise<{ bytes: Buffer; pixels: Uint8Array; width: number; height: number }>
}
interface RouteContext {
  req: IncomingMessage
  res: ServerResponse
  originals: LocalProjectStore
  editing: EditingStore
  services: AuthoringServices
  input: () => Promise<Record<string, unknown>>
  json: (status: number, value: unknown) => void
}
const unavailable = () => new LocalProjectError('processing_unavailable', 'Local processing is unavailable. Start the development app with its local processing service.', 503)

export async function authoringRoute(context: RouteContext): Promise<boolean> {
  const { req, res, originals, editing, services, input, json } = context
  const path = req.url?.slice('/api/local-projects'.length) ?? '', method = req.method
  const renderer = () => { if (!services.renderer) throw unavailable(); return services.renderer }
  const assistance = () => { if (!services.assistance) throw unavailable(); return services.assistance }
  const bytes = (asset: { bytes: Buffer; mimeType: string }) => {
    res.writeHead(200, { 'Content-Type': asset.mimeType, 'Content-Length': asset.bytes.length }); res.end(asset.bytes)
  }
  if (path === '/chapters') {
    if (method === 'GET') { json(200, { chapters: await editing.listChapters() }); return true }
    if (method === 'POST') { const value = await input(); json(201, { chapter: await editing.createChapter(value.name, value.pageIds) }); return true }
  }
  const chapter = /^\/chapters\/([^/]+)$/.exec(path)
  if (chapter) {
    if (method === 'GET') { json(200, { chapter: await editing.getChapter(chapter[1]) }); return true }
    if (method === 'PUT') { const value = await input(); json(200, { chapter: await editing.saveChapter(chapter[1], value.expectedRevision, value.name, value.pageIds) }); return true }
  }
  if (path === '/snapshots') {
    if (method === 'GET') { json(200, { snapshots: await editing.listSnapshots() }); return true }
    if (method === 'POST') {
      const value = await input()
      json(201, { snapshot: await editing.createSnapshot(String(value.chapterId), value.expectedChapterRevision, value.reviewed, renderer()) }); return true
    }
  }
  const snapshot = /^\/snapshots\/([^/]+)$/.exec(path)
  if (snapshot) {
    if (method === 'GET') { json(200, { snapshot: await editing.getSnapshot(snapshot[1]) }); return true }
    if (method === 'PUT') {
      const value = await input()
      json(200, { snapshot: await editing.replaceSnapshot(snapshot[1], value.expectedRevision, String(value.chapterId), value.expectedChapterRevision, value.reviewed, renderer()) }); return true
    }
    if (method === 'DELETE') { const value = await input(); await editing.unpublishSnapshot(snapshot[1], value.expectedRevision); json(200, { ok: true }); return true }
  }
  const snapshotAsset = /^\/snapshots\/([^/]+)\/pages\/([^/]+)\/(poster|video)(?:\?revision=([^&]+))?$/.exec(path)
  if (snapshotAsset && method === 'GET') {
    const selected = snapshotAsset[4] === undefined ? undefined : Number(snapshotAsset[4])
    if (snapshotAsset[4] !== undefined && (!/^(0|[1-9]\d*)$/.test(snapshotAsset[4]) || !Number.isSafeInteger(selected))) {
      throw new LocalProjectError('invalid_snapshot_revision', 'Use a non-negative safe integer snapshot revision.', 400)
    }
    bytes(await editing.snapshotAsset(snapshotAsset[1], snapshotAsset[2], snapshotAsset[3] as 'poster' | 'video', renderer(), selected)); return true
  }
  const draft = /^\/([^/]+)\/draft$/.exec(path)
  if (draft) {
    if (method === 'GET') { json(200, { draft: await editing.getDraft(draft[1]) }); return true }
    if (method === 'PUT') { const value = await input(); json(200, { draft: await editing.saveDraft(draft[1], value.expectedRevision, value.draft) }); return true }
  }
  const working = /^\/([^/]+)\/working$/.exec(path)
  if (working && method === 'GET') {
    if (!services.workingSource) throw unavailable()
    const original = await originals.original(working[1]), source = await services.workingSource(original.bytes)
    res.setHeader('X-Source-Version', source.sourceVersion)
    bytes({ bytes: source.png, mimeType: 'image/png' }); return true
  }
  const latest = /^\/([^/]+)\/artifacts\/latest$/.exec(path)
  if (latest && method === 'GET') {
    await originals.original(latest[1])
    const artifact: LocalRenderArtifact | undefined = await renderer().latestCompleted(latest[1])
    json(200, { artifact: artifact ?? null }); return true
  }
  const capabilities = /^\/([^/]+)\/assistance\/capabilities$/.exec(path)
  if (capabilities && method === 'GET') {
    await originals.original(capabilities[1]); json(200, { capabilities: await assistance().capabilities() }); return true
  }
  const suggest = /^\/([^/]+)\/assistance$/.exec(path)
  if (suggest && method === 'POST') {
    const value = await input(), saved = await editing.getDraft(suggest[1])
    if (revision(value.expectedRevision) !== saved.revision) throw new LocalProjectError('stale_revision', 'Save or reload the current draft before local assistance.', 409)
    if (!Object.values(LOCAL_ASSISTANCE_MODE).includes(value.mode as LocalAssistanceMode) ||
      (value.regionId !== undefined && (typeof value.regionId !== 'string' || !saved.regions.some(region => region.id === value.regionId)))) {
      throw new LocalProjectError('invalid_assistance', 'Choose a supported local action and an existing region for refinement.', 422)
    }
    const original = await originals.original(suggest[1])
    json(202, { job: await assistance().start(suggest[1], saved, original.bytes, value.mode as LocalAssistanceMode, value.regionId as string | undefined) }); return true
  }
  const assistanceJob = /^\/([^/]+)\/assistance\/([^/]+)(\/cancel)?$/.exec(path)
  if (assistanceJob) {
    if (method === 'GET' && !assistanceJob[3]) { json(200, { job: await assistance().get(assistanceJob[1], assistanceJob[2]) }); return true }
    if (method === 'POST' && assistanceJob[3]) { await input(); json(200, { job: await assistance().cancel(assistanceJob[1], assistanceJob[2]) }); return true }
  }
  const mask = /^\/([^/]+)\/masks\/([^/?]+)\?sourceVersion=([a-f0-9]{64})$/.exec(path)
  if (mask && method === 'GET') { bytes({ ...(await assistance().readMask(mask[1], mask[2], mask[3])), mimeType: 'image/png' }); return true }
  const render = /^\/([^/]+)\/render$/.exec(path)
  if (render && method === 'POST') {
    const value = object(await input()), saved = await editing.getDraft(render[1])
    if (revision(value.expectedRevision) !== saved.revision) throw new LocalProjectError('stale_revision', 'Save or reload the current draft before rendering.', 409)
    const original = await originals.original(render[1])
    json(202, { job: await renderer().start(render[1], saved, original.bytes) }); return true
  }
  const job = /^\/([^/]+)\/jobs\/([^/]+)(\/cancel)?$/.exec(path)
  if (job) {
    if (method === 'GET' && !job[3]) { json(200, { job: await renderer().get(job[1], job[2]) }); return true }
    if (method === 'POST' && job[3]) { await input(); json(200, { job: await renderer().cancel(job[1], job[2]) }); return true }
  }
  const artifact = /^\/([^/]+)\/artifacts\/([^/]+)\/(poster|video)$/.exec(path)
  if (artifact && method === 'GET') { bytes(await renderer().readAsset(artifact[1], artifact[2], artifact[3] as 'poster' | 'video')); return true }
  return false
}
