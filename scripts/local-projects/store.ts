import { createHash, randomUUID } from 'node:crypto'
import { lstat, mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import sharp from 'sharp'
import { LOCAL_IMAGE_MIME, type LocalProject } from '../../src/features/local-projects/contracts.ts'

export const LOCAL_LIMITS = { maxBytes: 10 * 1024 * 1024, maxPixels: 20_000_000 } as const
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
const digest = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex')
const displayName = (name: string) => Array.from(name.replace(/[/\\]/g, '_'), char => {
  const code = char.charCodeAt(0)
  return code < 32 || code === 127 ? '_' : char
}).join('').trim().slice(0, 160) || 'Untitled image'

export class LocalProjectError extends Error {
  code: string
  status: number
  constructor(code: string, message: string, status: number) {
    super(message); this.code = code; this.status = status
  }
}
const unavailable = () => new LocalProjectError('storage_unavailable', 'Local storage is unavailable. Try again after checking disk access.', 503)
const missing = () => new LocalProjectError('not_found', 'The local original is unavailable.', 404)

interface StoreLimits { maxBytes?: number; maxPixels?: number }
interface StoredProject { project: LocalProject; sha256: string }

function rejectAnimation(bytes: Buffer) {
  if (bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
    for (let offset = 8; offset + 12 <= bytes.length;) {
      const length = bytes.readUInt32BE(offset)
      if (length > bytes.length - offset - 12) break
      if (bytes.toString('ascii', offset + 4, offset + 8) === 'acTL') throw new LocalProjectError('animated_image', 'Upload a still image, not an animated PNG.', 422)
      offset += length + 12
    }
  }
  if (bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP') {
    for (let offset = 12; offset + 8 <= bytes.length;) {
      const length = bytes.readUInt32LE(offset + 4)
      if (length > bytes.length - offset - 8) break
      if (['ANIM', 'ANMF'].includes(bytes.toString('ascii', offset, offset + 4))) throw new LocalProjectError('animated_image', 'Upload a still image, not animated WebP.', 422)
      offset += 8 + length + length % 2
    }
  }
}

function validRecord(value: unknown, id: string): value is StoredProject {
  if (!value || typeof value !== 'object') return false
  const record = value as Partial<StoredProject>, p = record.project
  return !!p && p.id === id && typeof p.name === 'string' && p.name.length <= 160 &&
    Object.values(LOCAL_IMAGE_MIME).includes(p.mimeType) && Number.isInteger(p.width) && p.width > 0 &&
    Number.isInteger(p.height) && p.height > 0 && Number.isInteger(p.byteLength) && p.byteLength > 0 &&
    typeof p.createdAt === 'string' && Number.isFinite(Date.parse(p.createdAt)) &&
    typeof record.sha256 === 'string' && /^[a-f0-9]{64}$/.test(record.sha256)
}

export class LocalProjectStore {
  readonly root: string
  readonly maxBytes: number
  readonly maxPixels: number
  private importing = false

  constructor(root: string, limits: StoreLimits = {}) {
    this.root = resolve(root)
    this.maxBytes = limits.maxBytes ?? LOCAL_LIMITS.maxBytes
    this.maxPixels = limits.maxPixels ?? LOCAL_LIMITS.maxPixels
  }

  private async initialize() {
    try {
      await mkdir(this.root, { recursive: true, mode: 0o700 })
      const info = await lstat(this.root)
      if (!info.isDirectory() || info.isSymbolicLink() || (info.mode & 0o077) !== 0) throw unavailable()
    } catch { throw unavailable() }
  }

  async ensureRoot() { await this.initialize() }

  async import(input: Buffer, name: string): Promise<LocalProject> {
    if (this.importing) throw new LocalProjectError('busy', 'Another local import is running. Try again when it finishes.', 409)
    this.importing = true
    let staging: string | undefined
    try {
      await this.initialize()
      if (input.length > this.maxBytes) throw new LocalProjectError('upload_too_large', 'Image exceeds the local upload byte limit.', 413)
      const bytes = Buffer.from(input)
      rejectAnimation(bytes)
      let width: number, height: number, mimeType: LocalProject['mimeType']
      try {
        const image = sharp(bytes, { limitInputPixels: this.maxPixels, failOn: 'warning', sequentialRead: true })
        const meta = await image.metadata()
        if (!meta.width || !meta.height || meta.width * meta.height > this.maxPixels || (meta.pages ?? 1) !== 1) throw new Error('Invalid dimensions or animation')
        const formats = { png: LOCAL_IMAGE_MIME.PNG, jpeg: LOCAL_IMAGE_MIME.JPEG, webp: LOCAL_IMAGE_MIME.WEBP }
        if (!meta.format || !Object.hasOwn(formats, meta.format)) throw new Error('Unsupported format')
        width = meta.width; height = meta.height; mimeType = formats[meta.format as keyof typeof formats]
        // Force bounded full decoding to reject truncated data; never persist a normalization.
        await image.raw().toBuffer()
      } catch { throw new LocalProjectError('invalid_image', 'Upload a complete still PNG, JPEG or WebP within the local pixel limit.', 422) }
      const id = randomUUID(), project: LocalProject = {
        id, name: displayName(name),
        mimeType, width, height, byteLength: bytes.length, createdAt: new Date().toISOString(),
      }
      staging = join(this.root, `.import-${id}`)
      await mkdir(staging, { mode: 0o700 })
      await writeFile(join(staging, 'original'), bytes, { flag: 'wx', mode: 0o600 })
      await writeFile(join(staging, 'project.json'), JSON.stringify({ project, sha256: digest(bytes) }), { flag: 'wx', mode: 0o600 })
      await rename(staging, join(this.root, id))
      staging = undefined
      return project
    } catch (error) {
      if (error instanceof LocalProjectError) throw error
      throw unavailable()
    } finally {
      if (staging) await rm(staging, { recursive: true, force: true }).catch(() => {})
      this.importing = false
    }
  }

  private async record(id: string): Promise<StoredProject> {
    if (!UUID.test(id)) throw missing()
    try {
      const folder = join(this.root, id)
      if (!(await lstat(folder)).isDirectory()) throw missing()
      for (const filename of ['project.json', 'original']) {
        const info = await lstat(join(folder, filename))
        if (!info.isFile() || info.isSymbolicLink()) throw missing()
      }
      const value: unknown = JSON.parse(await readFile(join(folder, 'project.json'), 'utf8'))
      if (!validRecord(value, id) || (await lstat(join(folder, 'original'))).size !== value.project.byteLength) throw missing()
      return value
    } catch (error) {
      if (error instanceof LocalProjectError) throw error
      if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') throw missing()
      throw unavailable()
    }
  }

  async list(): Promise<LocalProject[]> {
    await this.initialize()
    try {
      const projects: LocalProject[] = []
      for (const id of await readdir(this.root)) if (UUID.test(id)) {
        try { projects.push((await this.record(id)).project) }
        catch (error) { if (!(error instanceof LocalProjectError) || error.code !== 'not_found') throw error }
      }
      return projects.sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id))
    } catch (error) { if (error instanceof LocalProjectError) throw error; throw unavailable() }
  }

  async original(id: string): Promise<{ project: LocalProject; bytes: Buffer }> {
    await this.initialize()
    const record = await this.record(id)
    try {
      const bytes = await readFile(join(this.root, id, 'original'))
      if (digest(bytes) !== record.sha256) throw missing()
      return { project: record.project, bytes }
    } catch (error) { if (error instanceof LocalProjectError) throw error; throw unavailable() }
  }
}
