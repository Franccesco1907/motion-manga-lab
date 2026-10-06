import { LOCAL_IMAGE_MIME, type LocalProject } from './contracts'
import { expirePrivateSession, getPrivateSession, privateHeaders } from '../accounts/private-session'

export interface LocalProjectClient {
  list: (signal?: AbortSignal) => Promise<LocalProject[]>
  create: (file: File, signal?: AbortSignal) => Promise<LocalProject>
  original: (id: string, signal?: AbortSignal) => Promise<Blob>
}

const BASE = '/api/local-projects'
const UNAVAILABLE = 'Local service unavailable. Start npm run dev on this machine, then retry. Build and preview do not provide local project storage.'
const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
const responseEpochs = new WeakMap<Response, number>()
function validateEpoch(response: Response) {
  const epoch = responseEpochs.get(response)
  if (epoch !== undefined && epoch !== getPrivateSession().epoch) throw new Error('Workspace session changed. Reopen the page after signing in.')
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isProject(value: unknown): value is LocalProject {
  return record(value) && typeof value.id === 'string' && ID.test(value.id)
    && typeof value.name === 'string' && value.name.length > 0
    && Object.values(LOCAL_IMAGE_MIME).some(mime => mime === value.mimeType)
    && typeof value.createdAt === 'string' && Number.isFinite(Date.parse(value.createdAt))
    && [value.width, value.height, value.byteLength].every(n => typeof n === 'number' && Number.isSafeInteger(n) && n > 0)
}

export async function localJson(response: Response): Promise<unknown> {
  if (!response.headers.get('content-type')?.toLowerCase().includes('application/json')) throw new Error(UNAVAILABLE)
  let value: unknown
  try { value = await response.json() }
  catch (error) { throw new Error(UNAVAILABLE, { cause: error }) }
  validateEpoch(response)
  return value
}

export async function privateBlob(response: Response) {
  const blob = await response.blob()
  validateEpoch(response)
  return blob
}

export async function localRequest(url: string, options: RequestInit = {}): Promise<Response> {
  let response: Response
  const session = getPrivateSession()
  const headers = privateHeaders(options.method ?? 'GET')
  try {
    response = await fetch(url, { credentials: 'same-origin', redirect: 'error', cache: 'no-store', ...options, headers: { ...options.headers, ...headers } })
  } catch (error) {
    if (options.signal?.aborted) throw error
    throw new Error(UNAVAILABLE, { cause: error })
  }
  if (getPrivateSession().epoch !== session.epoch) throw new Error('Workspace session changed. Reopen the page after signing in.')
  responseEpochs.set(response, session.epoch)
  if (response.status === 401) {
    expirePrivateSession()
    throw new Error('Sign in again. Your session expired and the private workspace has been closed.')
  }
  if (!response.ok) {
    const body = await localJson(response)
    if (record(body) && record(body.error) && typeof body.error.message === 'string') {
      throw new Error(body.error.message.slice(0, 1000))
    }
    throw new Error(UNAVAILABLE)
  }
  return response
}

export const localProjectClient: LocalProjectClient = {
  async list(signal) {
    const body = await localJson(await localRequest(BASE, { signal }))
    if (!record(body) || !Array.isArray(body.projects) || !body.projects.every(isProject)) throw new Error('Invalid local project response. Retry loading projects.')
    return body.projects
  },
  async create(file, signal) {
    const body = await localJson(await localRequest(BASE, {
      method: 'POST', signal, body: file,
      headers: { 'Content-Type': 'application/octet-stream', 'X-File-Name': encodeURIComponent(file.name) },
    }))
    if (!record(body) || !isProject(body.project)) throw new Error('Invalid local project response. Reload the saved project list before trying another upload.')
    return body.project
  },
  async original(id, signal) {
    if (!ID.test(id)) throw new Error('Invalid project ID.')
    const response = await localRequest(`${BASE}/${encodeURIComponent(id)}/original`, { signal })
    const mime = response.headers.get('content-type')?.split(';')[0].trim()
    if (!Object.values(LOCAL_IMAGE_MIME).some(value => value === mime)) throw new Error(UNAVAILABLE)
    const blob = await privateBlob(response)
    if (!blob.size) throw new Error('The saved original is empty. Retry or import the source file again.')
    return blob
  },
}
