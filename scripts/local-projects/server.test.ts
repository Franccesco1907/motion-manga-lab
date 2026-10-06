// @vitest-environment node
import { createServer, request } from 'node:http'
import type { Server } from 'node:http'
import { once } from 'node:events'
import { randomUUID } from 'node:crypto'
import { mkdtemp, readFile, readdir, rm, stat, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { homedir } from 'node:os'
import { join } from 'node:path'
import type { AddressInfo } from 'node:net'
import sharp from 'sharp'
import { resolveConfig } from 'vite'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LocalProjectStore } from './store.ts'
import { createLocalProjectsHandler, assertLocalBoundary } from './http.ts'
import { assertLoopbackHost, localProjectsPlugin } from './vite-plugin.ts'

vi.mock('node:fs/promises', async importOriginal => {
  const actual = await importOriginal<typeof import('node:fs/promises')>()
  return { ...actual, writeFile: vi.fn(actual.writeFile) }
})
vi.mock('node:crypto', async importOriginal => {
  const actual = await importOriginal<typeof import('node:crypto')>()
  return { ...actual, randomUUID: vi.fn(actual.randomUUID) }
})

let directory: string
let png: Buffer
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'motion-manga-local-projects-'))
  png = await sharp({ create: { width: 3, height: 2, channels: 3, background: '#365778' } }).png().toBuffer()
})
afterEach(async () => { await rm(directory, { recursive: true, force: true }) })

describe('private original-page store', () => {
  it('preserves exact original bytes and reopens from a new instance with restricted files', async () => {
    const store = new LocalProjectStore(join(directory, 'store'))
    const project = await store.import(png, 'Page one.png')
    expect(project).toMatchObject({ name: 'Page one.png', mimeType: 'image/png', width: 3, height: 2, byteLength: png.length })
    const reopened = new LocalProjectStore(join(directory, 'store'))
    expect(await reopened.list()).toEqual([project])
    expect((await reopened.original(project.id)).bytes).toEqual(png)
    expect((await stat(join(directory, 'store'))).mode & 0o777).toBe(0o700)
    expect((await stat(join(directory, 'store', project.id, 'original'))).mode & 0o777).toBe(0o600)
  })

  it.each(['jpeg', 'webp'] as const)('verifies %s bytes rather than the filename', async format => {
    const bytes = await sharp(png).toFormat(format).toBuffer()
    const store = new LocalProjectStore(join(directory, 'store'))
    const project = await store.import(bytes, 'misleading.png')
    expect(project.mimeType).toBe(`image/${format}`)
    expect((await store.original(project.id)).bytes).toEqual(bytes)
  })

  it('lists newest first deterministically and ignores incomplete staging folders', async () => {
    const root = join(directory, 'store'), store = new LocalProjectStore(root)
    const first = await store.import(png, 'first'), second = await store.import(png, 'second')
    const { mkdir } = await import('node:fs/promises')
    await mkdir(join(root, '.import-incomplete'))
    const expected = [first, second].sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id))
    expect(await new LocalProjectStore(root).list()).toEqual(expected)
  })

  it('rejects invalid bytes and limits without persisting an incomplete project', async () => {
    const root = join(directory, 'store'), store = new LocalProjectStore(root)
    for (const bytes of [Buffer.from('<svg/>'), Buffer.from('not an image'), png.subarray(0, 30)]) {
      await expect(store.import(bytes, 'bad.png')).rejects.toMatchObject({ code: 'invalid_image' })
    }
    await expect(new LocalProjectStore(root, { maxBytes: 4 }).import(png, 'large.png')).rejects.toMatchObject({ code: 'upload_too_large' })
    await expect(new LocalProjectStore(root, { maxPixels: 4 }).import(png, 'large.png')).rejects.toMatchObject({ code: 'invalid_image' })
    expect(await store.list()).toEqual([])
    expect(await readdir(root)).toEqual([])
  })

  it('rejects animated PNG/WebP indicators before decoding', async () => {
    const store = new LocalProjectStore(join(directory, 'store'))
    const control = Buffer.alloc(20); control.writeUInt32BE(8); control.write('acTL', 4)
    const apng = Buffer.concat([png.subarray(0, 33), control, png.subarray(33)])
    const webp = await sharp(png).webp().toBuffer(), chunk = Buffer.alloc(14)
    chunk.write('ANIM'); chunk.writeUInt32LE(6, 4)
    const animated = Buffer.concat([webp, chunk]); animated.writeUInt32LE(animated.length - 8, 4)
    for (const bytes of [apng, animated]) await expect(store.import(bytes, 'animated')).rejects.toMatchObject({ code: 'animated_image' })
    expect(await store.list()).toEqual([])
  })

  it('rejects arbitrary paths, symlinked storage and missing originals', async () => {
    const root = join(directory, 'store'), store = new LocalProjectStore(root)
    await expect(store.original('../outside')).rejects.toMatchObject({ code: 'not_found' })
    const project = await store.import(png, 'page')
    await rm(join(root, project.id, 'original'))
    await expect(store.original(project.id)).rejects.toMatchObject({ code: 'not_found' })
    await symlink(directory, join(directory, 'linked'))
    await expect(new LocalProjectStore(join(directory, 'linked')).import(png, 'page')).rejects.toMatchObject({ code: 'storage_unavailable' })
  })

  it('fails safely when storage is a file, without overwriting it', async () => {
    const root = join(directory, 'blocked'); await writeFile(root, 'keep')
    await expect(new LocalProjectStore(root).import(png, 'page')).rejects.toMatchObject({ code: 'storage_unavailable' })
    expect(await readFile(root, 'utf8')).toBe('keep')
  })

  it('removes staging after a disk-write failure and reports no incomplete import', async () => {
    const root = join(directory, 'store'), store = new LocalProjectStore(root)
    const previous = await store.import(png, 'saved original')
    vi.mocked(writeFile).mockRejectedValueOnce(new Error('Synthetic disk failure with private path'))
    await expect(store.import(png, 'page')).rejects.toMatchObject({ code: 'storage_unavailable' })
    expect(await store.list()).toEqual([previous])
    expect((await store.original(previous.id)).bytes).toEqual(png)
    expect(await readdir(root)).toEqual([previous.id])
  })

  it('never overwrites an existing original even if a server UUID collides', async () => {
    const store = new LocalProjectStore(join(directory, 'store'))
    const previous = await store.import(png, 'previous')
    vi.mocked(randomUUID).mockReturnValueOnce(previous.id as ReturnType<typeof randomUUID>)
    await expect(store.import(png, 'replacement')).rejects.toMatchObject({ code: 'storage_unavailable' })
    expect(await store.list()).toEqual([previous])
    expect((await store.original(previous.id)).bytes).toEqual(png)
    expect(await readdir(join(directory, 'store'))).toEqual([previous.id])
  })
})

async function withServer(run: (port: number, server: Server) => Promise<void>, maxBytes = 10 * 1024 * 1024) {
  const handler = createLocalProjectsHandler(new LocalProjectStore(join(directory, 'store'), { maxBytes }))
  const server = createServer((req, res) => { void handler(req, res) })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  try { await run((server.address() as AddressInfo).port, server) }
  finally { await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())) }
}

async function call(port: number, path = '/api/local-projects', method = 'GET', body?: Buffer, headers: Record<string, string> = {}) {
  return new Promise<{ status: number; headers: import('node:http').IncomingHttpHeaders; bytes: Buffer }>((resolve, reject) => {
    const req = request({ hostname: '127.0.0.1', port, path, method, headers: { 'X-Motion-Manga-Local': '1', ...headers } }, res => {
      const chunks: Buffer[] = []; res.on('data', chunk => chunks.push(Buffer.from(chunk)))
      res.on('end', () => resolve({ status: res.statusCode ?? 0, headers: res.headers, bytes: Buffer.concat(chunks) }))
    })
    req.on('error', reject); req.end(body)
  })
}

describe('local-only native HTTP boundary', () => {
  it('configures actual Vite only on loopback with storage outside served paths and excludes preview/build', async () => {
    const options = { configFile: false as const, root: directory, plugins: [localProjectsPlugin()] }
    expect((await resolveConfig(options, 'serve')).server.host).toBe('127.0.0.1')
    await expect(resolveConfig({ ...options, server: { host: '0.0.0.0' } }, 'serve')).rejects.toThrow('loopback')
    await expect(resolveConfig({ ...options, server: { fs: { allow: [homedir()] } } }, 'serve')).rejects.toThrow('outside Vite')
    expect((await resolveConfig(options, 'build')).plugins.some(plugin => plugin.name === 'local-original-projects')).toBe(false)
    expect((await resolveConfig(options, 'serve', undefined, undefined, true)).plugins.some(plugin => plugin.name === 'local-original-projects')).toBe(false)
  })

  it('roundtrips POST, list and exact original with private MIME-safe headers', async () => {
    await withServer(async port => {
      const imported = await call(port, undefined, 'POST', png, { 'Content-Type': 'application/octet-stream', 'X-File-Name': encodeURIComponent('Page one.png'), Origin: `http://127.0.0.1:${port}` })
      expect(imported.status).toBe(201)
      const { project } = JSON.parse(imported.bytes.toString())
      expect(JSON.parse((await call(port)).bytes.toString())).toEqual({ projects: [project] })
      const original = await call(port, `/api/local-projects/${project.id}/original`)
      expect(original.status).toBe(200); expect(original.bytes).toEqual(png)
      expect(original.headers['content-type']).toBe('image/png')
      expect(original.headers['x-content-type-options']).toBe('nosniff')
      expect(original.headers['cache-control']).toBe('private, no-store')
      expect(original.headers['access-control-allow-origin']).toBeUndefined()
    })
  })

  it('rejects untrusted Host, cross-origin, preflight and missing marker', async () => {
    await withServer(async port => {
      const rejectedHeaders: Record<string, string>[] = [{ Host: 'evil.example' }, { Origin: 'http://evil.example' }, { 'X-Motion-Manga-Local': '' }]
      for (const headers of rejectedHeaders) {
        expect((await call(port, undefined, 'GET', undefined, headers)).status).toBe(403)
      }
      expect((await call(port, undefined, 'OPTIONS')).status).toBe(403)
    })
    expect(() => assertLocalBoundary({ peer: '192.0.2.1', port: 1234, host: '127.0.0.1:1234', marker: '1', method: 'GET' })).toThrow()
    for (const host of [true, '0.0.0.0', '::', '192.0.2.1']) expect(() => assertLoopbackHost(host)).toThrow()
    for (const host of [undefined, '127.0.0.1', 'localhost', '::1']) expect(() => assertLoopbackHost(host)).not.toThrow()
  })

  it('returns safe errors for invalid bodies, headers, paths and missing files', async () => {
    await withServer(async port => {
      expect((await call(port, undefined, 'POST', png)).status).toBe(415)
      const headers = { 'Content-Type': 'application/octet-stream', 'X-File-Name': 'page.png' }
      expect((await call(port, undefined, 'POST', Buffer.from('fake'), headers)).status).toBe(422)
      expect((await call(port, undefined, 'POST', png, { ...headers, 'X-File-Name': '%' })).status).toBe(400)
      const invalid = await call(port, '/api/local-projects/../original')
      expect(invalid.status).toBe(404)
      expect(JSON.stringify(JSON.parse(invalid.bytes.toString()))).not.toContain(directory)
    })
    await withServer(async port => {
      expect((await call(port, undefined, 'POST', png, { 'Content-Type': 'application/octet-stream', 'X-File-Name': 'page' })).status).toBe(413)
      expect(JSON.parse((await call(port)).bytes.toString())).toEqual({ projects: [] })
    }, 4)
  })

  it('bounds chunked uploads without losing the actionable response or importing partial data', async () => {
    await withServer(async port => {
      const response = await call(port, undefined, 'POST', png, {
        'Content-Type': 'application/octet-stream', 'X-File-Name': 'page', 'Transfer-Encoding': 'chunked',
      })
      expect(response.status).toBe(413)
      expect(JSON.parse(response.bytes.toString()).error.code).toBe('upload_too_large')
      expect(JSON.parse((await call(port)).bytes.toString())).toEqual({ projects: [] })
    }, 4)
  })

  it('bounds active uploads before buffering and preserves existing projects', async () => {
    await withServer(async (port, server) => {
      const received = once(server, 'request')
      const held = request({ hostname: '127.0.0.1', port, path: '/api/local-projects', method: 'POST', headers: {
        'X-Motion-Manga-Local': '1', 'Content-Type': 'application/octet-stream', 'X-File-Name': 'held', 'Content-Length': png.length,
      } })
      held.on('error', () => {})
      held.write(png.subarray(0, 8))
      await received
      try {
        const response = await call(port, undefined, 'POST', png, { 'Content-Type': 'application/octet-stream', 'X-File-Name': 'second' })
        expect(response.status).toBe(409)
        expect(JSON.parse((await call(port)).bytes.toString())).toEqual({ projects: [] })
      } finally { held.destroy() }
    })
  })
})
