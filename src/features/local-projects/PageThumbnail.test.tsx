import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { PageThumbnail } from './PageThumbnail'
import type { LocalProject } from './contracts'

const project: LocalProject = { id: 'page-a', name: 'page.png', mimeType: 'image/png', width: 200, height: 300, byteLength: 10, createdAt: '2026-10-13T00:00:00Z' }
const blob = new Blob(['page'], { type: 'image/png' })
const create = vi.fn()
const revoke = vi.fn()
const originalCreate = Object.getOwnPropertyDescriptor(URL, 'createObjectURL')
const originalRevoke = Object.getOwnPropertyDescriptor(URL, 'revokeObjectURL')
function client() { return { list: vi.fn(), create: vi.fn(), original: vi.fn().mockResolvedValue(blob) } }
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(yes => { resolve = yes })
  return { promise, resolve }
}
beforeEach(() => {
  create.mockReset().mockImplementation(() => `blob:thumb-${create.mock.calls.length}`)
  revoke.mockReset()
  Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: create })
  Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: revoke })
})
afterEach(() => {
  cleanup()
  if (originalCreate) Object.defineProperty(URL, 'createObjectURL', originalCreate)
  else Reflect.deleteProperty(URL, 'createObjectURL')
  if (originalRevoke) Object.defineProperty(URL, 'revokeObjectURL', originalRevoke)
  else Reflect.deleteProperty(URL, 'revokeObjectURL')
})

it('keeps the protected decorative image hidden until loaded and revokes it on unmount', async () => {
  const api = client()
  const view = render(<PageThumbnail project={project} client={api} />)
  await act(async () => {})
  const image = view.container.querySelector('img')!
  expect(api.original).toHaveBeenCalledWith(project.id, expect.any(AbortSignal))
  expect(image).not.toBeVisible()
  expect(screen.getByText('Loading preview…')).toBeInTheDocument()
  fireEvent.load(image)
  expect(image).toBeVisible()
  expect(screen.queryByRole('img')).not.toBeInTheDocument()
  expect(screen.queryByText('Loading preview…')).not.toBeInTheDocument()
  view.unmount()
  expect(revoke).toHaveBeenCalledWith('blob:thumb-1')
})

it('uses a readable placeholder instead of exposing a broken thumbnail', async () => {
  const view = render(<PageThumbnail project={project} client={client()} />)
  await act(async () => {})
  fireEvent.error(view.container.querySelector('img')!)
  expect(screen.getByText('Preview unavailable')).toBeInTheDocument()
  expect(view.container.querySelector('img')).toBeNull()
})

it('keeps protected request failures contained to the thumbnail', async () => {
  const api = client()
  api.original.mockRejectedValue(new Error('Private server message'))
  render(<PageThumbnail project={project} client={api} />)
  expect(await screen.findByText('Preview unavailable')).toBeInTheDocument()
  expect(screen.queryByText('Private server message')).not.toBeInTheDocument()
})

it('aborts pending requests and does not allocate URLs after unmount', async () => {
  const api = client()
  const pending = deferred<Blob>()
  api.original.mockReturnValue(pending.promise)
  const view = render(<PageThumbnail project={project} client={api} />)
  const signal = api.original.mock.calls[0][1] as AbortSignal
  view.unmount()
  expect(signal.aborted).toBe(true)
  await act(async () => pending.resolve(blob))
  expect(create).not.toHaveBeenCalled()
})

it('never retains the previous private preview when its client changes', async () => {
  const api = client()
  const view = render(<PageThumbnail project={project} client={api} />)
  await act(async () => {})
  fireEvent.load(view.container.querySelector('img')!)
  const next = client()
  const pending = deferred<Blob>()
  next.original.mockReturnValue(pending.promise)
  view.rerender(<PageThumbnail project={project} client={next} />)
  expect(view.container.querySelector('img')).toBeNull()
  expect(screen.getByText('Loading preview…')).toBeInTheDocument()
  expect(revoke).toHaveBeenCalledWith('blob:thumb-1')
  await act(async () => pending.resolve(blob))
  expect(view.container.querySelector('img')).not.toBeVisible()
})
