import type { LocalAssistanceCapabilities, LocalAssistanceJob, LocalAssistanceMode, LocalChapter, LocalDraft, LocalRenderArtifact, LocalRenderJob, LocalSnapshot } from './contracts'
import { isLocalDraft } from './draft-editing'
import { localJson, localRequest } from './local-project-client'

const BASE = '/api/local-projects'
const idPath = (id: string) => {
  if (!/^[0-9a-f-]{36}$/.test(id)) throw new Error('Invalid local resource ID.')
  return encodeURIComponent(id)
}
function object(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null }
function revisionQuery(revision?: number) {
  if (revision === undefined) return ''
  if (!Number.isSafeInteger(revision) || revision < 0) throw new Error('Invalid reading snapshot revision.')
  return `?revision=${revision}`
}

async function data(path: string, signal?: AbortSignal, body?: unknown, method = 'GET') {
  const response = await localRequest(BASE + path, { signal, method,
    ...(body === undefined ? {} : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }) })
  const value = await localJson(response)
  if (!object(value)) throw new Error('Invalid local service response.')
  return value
}

async function blob(path: string, signal?: AbortSignal) {
  const response = await localRequest(BASE + path, { signal })
  const type = response.headers.get('content-type') ?? ''
  if (!/^(image\/png|video\/webm|video\/mp4)(;|$)/.test(type)) throw new Error('Local media unavailable. Start npm run dev, then retry.')
  return response.blob()
}

function entity<T>(value: unknown): T {
  if (!object(value) || typeof value.id !== 'string') throw new Error('Invalid local service response.')
  return value as T
}

export const authoringClient = {
  async draft(id: string, signal?: AbortSignal): Promise<LocalDraft> {
    const value = (await data(`/${idPath(id)}/draft`, signal)).draft
    if (!isLocalDraft(value)) throw new Error('Invalid saved draft. Retry loading the page.')
    return value
  },
  async saveDraft(draft: LocalDraft, signal?: AbortSignal): Promise<LocalDraft> {
    const value = (await data(`/${idPath(draft.projectId)}/draft`, signal, { expectedRevision: draft.revision, draft }, 'PUT')).draft
    if (!isLocalDraft(value)) throw new Error('Invalid saved draft response. Reload the page before retrying.')
    return value
  },
  working: (id: string, signal?: AbortSignal) => blob(`/${idPath(id)}/working`, signal),
  mask: (id: string, maskId: string, sourceVersion: string, signal?: AbortSignal) => blob(`/${idPath(id)}/masks/${idPath(maskId)}?sourceVersion=${encodeURIComponent(sourceVersion)}`, signal),
  async capabilities(id: string, signal?: AbortSignal): Promise<LocalAssistanceCapabilities> {
    const value = (await data(`/${idPath(id)}/assistance/capabilities`, signal)).capabilities
    if (!object(value) || !object(value.suggestRegions) || !object(value.refineRegion)) throw new Error('Model assistance capabilities unavailable.')
    return value as unknown as LocalAssistanceCapabilities
  },
  async assist(draft: LocalDraft, mode: LocalAssistanceMode, regionId?: string): Promise<LocalAssistanceJob> {
    return entity<LocalAssistanceJob>((await data(`/${idPath(draft.projectId)}/assistance`, undefined, { expectedRevision: draft.revision, mode, regionId }, 'POST')).job)
  },
  async assistanceJob(id: string, jobId: string, signal?: AbortSignal): Promise<LocalAssistanceJob> {
    return entity<LocalAssistanceJob>((await data(`/${idPath(id)}/assistance/${idPath(jobId)}`, signal)).job)
  },
  async cancelAssistance(id: string, jobId: string): Promise<LocalAssistanceJob> {
    return entity<LocalAssistanceJob>((await data(`/${idPath(id)}/assistance/${idPath(jobId)}/cancel`, undefined, {}, 'POST')).job)
  },
  async latest(id: string, signal?: AbortSignal): Promise<LocalRenderArtifact | null> {
    const value = (await data(`/${idPath(id)}/artifacts/latest`, signal)).artifact
    return value === null ? null : entity<LocalRenderArtifact>(value)
  },
  async render(draft: LocalDraft, signal?: AbortSignal): Promise<LocalRenderJob> {
    return entity<LocalRenderJob>((await data(`/${idPath(draft.projectId)}/render`, signal, { expectedRevision: draft.revision }, 'POST')).job)
  },
  async job(id: string, jobId: string, signal?: AbortSignal): Promise<LocalRenderJob> {
    return entity<LocalRenderJob>((await data(`/${idPath(id)}/jobs/${idPath(jobId)}`, signal)).job)
  },
  async cancel(id: string, jobId: string): Promise<LocalRenderJob> {
    return entity<LocalRenderJob>((await data(`/${idPath(id)}/jobs/${idPath(jobId)}/cancel`, undefined, {}, 'POST')).job)
  },
  video: (artifact: LocalRenderArtifact, signal?: AbortSignal) => blob(`/${idPath(artifact.projectId)}/artifacts/${idPath(artifact.id)}/video`, signal),
  async chapters(signal?: AbortSignal): Promise<LocalChapter[]> {
    const value = (await data('/chapters', signal)).chapters
    if (!Array.isArray(value)) throw new Error('Invalid chapter list.')
    return value.map(item => entity<LocalChapter>(item))
  },
  async createChapter(name: string): Promise<LocalChapter> { return entity<LocalChapter>((await data('/chapters', undefined, { name, pageIds: [] }, 'POST')).chapter) },
  async saveChapter(chapter: LocalChapter): Promise<LocalChapter> {
    return entity<LocalChapter>((await data(`/chapters/${idPath(chapter.id)}`, undefined, { expectedRevision: chapter.revision, name: chapter.name, pageIds: chapter.pageIds }, 'PUT')).chapter)
  },
  async snapshots(signal?: AbortSignal): Promise<LocalSnapshot[]> {
    const value = (await data('/snapshots', signal)).snapshots
    if (!Array.isArray(value)) throw new Error('Invalid local reading snapshot list.')
    return value.map(item => entity<LocalSnapshot>(item))
  },
  async publish(chapter: LocalChapter, snapshot?: LocalSnapshot): Promise<LocalSnapshot> {
    return entity<LocalSnapshot>((await data(`/snapshots${snapshot ? '/' + idPath(snapshot.id) : ''}`, undefined,
      { chapterId: chapter.id, expectedChapterRevision: chapter.revision, reviewed: true, ...(snapshot ? { expectedRevision: snapshot.revision } : {}) }, snapshot ? 'PUT' : 'POST')).snapshot)
  },
  async unpublish(snapshot: LocalSnapshot) { await data(`/snapshots/${idPath(snapshot.id)}`, undefined, { expectedRevision: snapshot.revision }, 'DELETE') },
  snapshotPoster: (snapshotId: string, pageId: string, signal?: AbortSignal, revision?: number) => blob(`/snapshots/${idPath(snapshotId)}/pages/${idPath(pageId)}/poster${revisionQuery(revision)}`, signal),
  snapshotVideo: (snapshotId: string, pageId: string, signal?: AbortSignal, revision?: number) => blob(`/snapshots/${idPath(snapshotId)}/pages/${idPath(pageId)}/video${revisionQuery(revision)}`, signal),
}

export type AuthoringClient = typeof authoringClient
