import type { IncomingMessage, ServerResponse } from 'node:http'
import { LocalProjectError, type LocalProjectStore } from './store.ts'
import { EditingStore } from './editing-store.ts'
import { object, STATE_BYTE_LIMIT } from './draft-validation.ts'
import { authoringRoute, type AuthoringServices } from './authoring-routes.ts'

export interface LocalBoundary {
  peer?: string
  port?: number
  host?: string
  origin?: string
  marker?: string
  method?: string
}
export function assertLocalBoundary(boundary: LocalBoundary) {
  const { peer, port, host, origin, marker, method } = boundary
  if (!['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(peer ?? '') ||
    ![`127.0.0.1:${port}`, `localhost:${port}`, `[::1]:${port}`].includes(host ?? '') ||
    (origin !== undefined && origin !== `http://${host}`) || marker !== '1' || method === 'OPTIONS') {
    throw new LocalProjectError('local_request_required', 'Use this app on its local, same-origin development server.', 403)
  }
}

function json(res: ServerResponse, status: number, value: unknown) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(value))
}
async function body(req: IncomingMessage, maxBytes: number) {
  const declared = req.headers['content-length']
  if (declared !== undefined && (!/^\d+$/.test(declared) || Number(declared) > maxBytes)) {
    throw new LocalProjectError('upload_too_large', 'Image exceeds the local upload byte limit.', 413)
  }
  const chunks: Buffer[] = []; let size = 0
  for await (const chunk of req) {
    size += chunk.length
    if (size > maxBytes) throw new LocalProjectError('upload_too_large', 'Image exceeds the local upload byte limit.', 413)
    chunks.push(Buffer.from(chunk))
  }
  return Buffer.concat(chunks)
}

export function createLocalProjectsHandler(store: LocalProjectStore, services: AuthoringServices = {}, boundaryPolicy: (boundary: LocalBoundary) => void = assertLocalBoundary) {
  let importing = false
  let mutating = false
  const editing = services.editing ?? new EditingStore(store)
  return async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    res.setHeader('X-Content-Type-Options', 'nosniff')
    res.setHeader('Cache-Control', 'private, no-store')
    res.setHeader('Cross-Origin-Resource-Policy', 'same-origin')
    let admittedMutation = false
    try {
      boundaryPolicy({ peer: req.socket.remoteAddress, port: req.socket.localPort, host: req.headers.host,
        origin: req.headers.origin, marker: typeof req.headers['x-motion-manga-local'] === 'string' ? req.headers['x-motion-manga-local'] : undefined, method: req.method })
      if (req.url !== '/api/local-projects' && ['POST', 'PUT', 'DELETE'].includes(req.method ?? '')) {
        if (mutating) throw new LocalProjectError('busy', 'Another local save or processing request is being prepared. Try again.', 409)
        mutating = true; admittedMutation = true
      }
      const input = async () => {
        if (req.headers['content-type']?.split(';')[0].trim() !== 'application/json') throw new LocalProjectError('unsupported_content_type', 'Send local editable state as JSON.', 415)
        try { return object(JSON.parse((await body(req, STATE_BYTE_LIMIT)).toString('utf8'))) }
        catch (error) { if (error instanceof LocalProjectError) throw error; throw new LocalProjectError('invalid_json', 'Provide valid local editable JSON.', 400) }
      }
      if (await authoringRoute({ req, res, originals: store, editing, services, input, json: (status, value) => json(res, status, value) })) return
      if (req.url === '/api/local-projects' && req.method === 'GET') {
        json(res, 200, { projects: await store.list() }); return
      }
      if (req.url === '/api/local-projects' && req.method === 'POST') {
        if (importing) throw new LocalProjectError('busy', 'Another local import is running. Try again when it finishes.', 409)
        if (req.headers['content-type'] !== 'application/octet-stream') throw new LocalProjectError('unsupported_content_type', 'Send the original image bytes.', 415)
        let name: string
        try {
          const encoded = req.headers['x-file-name']
          if (typeof encoded !== 'string' || encoded.length > 2048) throw new Error('Invalid filename')
          name = decodeURIComponent(encoded)
        } catch { throw new LocalProjectError('invalid_filename', 'Provide a valid image filename.', 400) }
        importing = true
        try {
          const project = await store.import(await body(req, store.maxBytes), name)
          json(res, 201, { project }); return
        } finally { importing = false }
      }
      const match = /^\/api\/local-projects\/([^/]+)\/original$/.exec(req.url ?? '')
      if (match && req.method === 'GET') {
        const original = await store.original(match[1])
        res.writeHead(200, { 'Content-Type': original.project.mimeType, 'Content-Length': original.bytes.length })
        res.end(original.bytes); return
      }
      throw new LocalProjectError('not_found', 'This local resource does not exist.', 404)
    } catch (error) {
      const failure = error instanceof LocalProjectError ? error : new LocalProjectError('request_failed', 'The local request failed. Try again.', 503)
      if (!res.destroyed) {
        if (!req.complete) {
          res.setHeader('Connection', 'close')
          res.once('finish', () => req.destroy())
        }
        json(res, failure.status, { error: { code: failure.code, message: failure.message } })
      }
    } finally { if (admittedMutation) mutating = false }
  }
}
