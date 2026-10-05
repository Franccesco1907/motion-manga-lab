import { afterEach, describe, expect, it, vi } from 'vitest'
import { localProjectClient } from './local-project-client'

const project = {
  id: 'f3a8c842-a5f8-4ee4-89ec-15230555eca7',
  name: 'page one.png',
  mimeType: 'image/png',
  width: 2,
  height: 3,
  byteLength: 4,
  createdAt: '2026-10-04T00:00:00.000Z',
}

afterEach(() => vi.unstubAllGlobals())

describe('local project client', () => {
  it('lists saved projects with the private same-origin fetch header', async () => {
    const fetch = vi.fn().mockResolvedValue(Response.json({ projects: [project] }))
    vi.stubGlobal('fetch', fetch)
    expect(await localProjectClient.list()).toEqual([project])
    expect(fetch).toHaveBeenCalledWith('/api/local-projects', expect.objectContaining({
      headers: { 'X-Motion-Manga-Local': '1' },
      credentials: 'same-origin',
    }))
  })

  it('sends the original File directly without encoding or normalization', async () => {
    const file = new File([new Uint8Array([1, 2, 3, 4])], 'page one.png', { type: 'image/png' })
    const fetch = vi.fn().mockResolvedValue(Response.json({ project }))
    vi.stubGlobal('fetch', fetch)
    expect(await localProjectClient.create(file)).toEqual(project)
    const request = fetch.mock.calls[0][1]
    expect(request.body).toBe(file)
    expect(request.method).toBe('POST')
    expect(request.headers).toEqual({
      'Content-Type': 'application/octet-stream',
      'X-File-Name': 'page%20one.png',
      'X-Motion-Manga-Local': '1',
    })
  })

  it('fetches exact original bytes as a Blob through the guarded endpoint', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(new Uint8Array([1, 2, 3, 4]), {
      headers: { 'Content-Type': 'image/png' },
    }))
    vi.stubGlobal('fetch', fetch)
    const blob = await localProjectClient.original(project.id)
    expect(Array.from(new Uint8Array(await blob.arrayBuffer()))).toEqual([1, 2, 3, 4])
    expect(fetch).toHaveBeenCalledWith(`/api/local-projects/${project.id}/original`, expect.objectContaining({
      headers: { 'X-Motion-Manga-Local': '1' },
    }))
  })

  it('rejects static-preview HTML and invalid contracts rather than inventing an empty list', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('<html>Vite</html>', {
      headers: { 'Content-Type': 'text/html' },
    })))
    await expect(localProjectClient.list()).rejects.toThrow('npm run dev')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ projects: [{ ...project, id: '../private' }] })))
    await expect(localProjectClient.list()).rejects.toThrow('Invalid local project response')
  })

  it('preserves actionable server errors and makes connection failures explicit', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({
      error: { code: 'unsupported_image', message: 'Animated images are not supported in this local increment.' },
    }, { status: 400 })))
    await expect(localProjectClient.create(new File(['x'], 'page.png'))).rejects.toThrow('Animated images')
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))
    await expect(localProjectClient.list()).rejects.toThrow('npm run dev')
  })

  it('rejects unsafe IDs before requesting a resource', async () => {
    const fetch = vi.fn()
    vi.stubGlobal('fetch', fetch)
    await expect(localProjectClient.original('../private')).rejects.toThrow('Invalid project ID')
    expect(fetch).not.toHaveBeenCalled()
  })
})
