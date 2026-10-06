import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LocalProjects } from './LocalProjects'
import type { LocalProject } from './contracts'
import { authoringClient } from './authoring-client'

const first: LocalProject = {
  id: 'f3a8c842-a5f8-4ee4-89ec-15230555eca7', name: 'first.png', mimeType: 'image/png',
  width: 2, height: 3, byteLength: 4, createdAt: '2026-10-04T00:00:00.000Z',
}
const second: LocalProject = { ...first, id: 'e209c512-f69f-4f68-b034-53296ca3e039', name: 'second.png' }

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}

function client(projects: LocalProject[] = []) {
  return {
    list: vi.fn().mockResolvedValue(projects),
    create: vi.fn().mockResolvedValue(first),
    original: vi.fn().mockResolvedValue(new Blob(['original'], { type: 'image/png' })),
  }
}

const createObjectURL = vi.fn()
const revokeObjectURL = vi.fn()
const originalCreate = Object.getOwnPropertyDescriptor(URL, 'createObjectURL')
const originalRevoke = Object.getOwnPropertyDescriptor(URL, 'revokeObjectURL')

beforeEach(() => {
  createObjectURL.mockReset().mockImplementation(() => `blob:original-${createObjectURL.mock.calls.length}`)
  revokeObjectURL.mockReset()
  Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: createObjectURL })
  Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: revokeObjectURL })
})

afterEach(() => {
  cleanup()
  if (originalCreate) Object.defineProperty(URL, 'createObjectURL', originalCreate)
  else Reflect.deleteProperty(URL, 'createObjectURL')
  if (originalRevoke) Object.defineProperty(URL, 'revokeObjectURL', originalRevoke)
  else Reflect.deleteProperty(URL, 'revokeObjectURL')
  vi.restoreAllMocks()
})

async function open(name: string) {
  await userEvent.click(await screen.findByRole('button', { name: `Open ${name}` }))
  const image = await screen.findByAltText(`Original page: ${name}`)
  fireEvent.load(image)
  await screen.findByRole('heading', { name })
  return image
}

describe('local original projects', () => {
  it('imports a batch sequentially, retains successful pages, and retries only failed files', async () => {
    const api = client()
    api.create.mockResolvedValueOnce(first).mockRejectedValueOnce(new Error('Invalid second image.')).mockResolvedValueOnce(second)
    render(<LocalProjects client={api} />)
    await screen.findByText('No saved projects yet.')
    const one = new File(['one'], 'first.png', { type: 'image/png' })
    const two = new File(['two'], 'second.png', { type: 'image/png' })
    await userEvent.upload(screen.getByLabelText('Page image'), [one, two])
    await userEvent.click(screen.getByRole('button', { name: 'Save originals' }))
    expect(await screen.findByRole('button', { name: 'Open first.png' })).toBeInTheDocument()
    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid second image')
    expect(api.create.mock.calls.map(call => call[0])).toEqual([one, two])
    await userEvent.click(screen.getByRole('button', { name: 'Retry failed imports' }))
    expect(await screen.findByRole('button', { name: 'Open second.png' })).toBeInTheDocument()
    expect(api.create.mock.calls.map(call => call[0])).toEqual([one, two, two])
  })
  it('enters the actual editor only after opening a saved page', async () => {
    vi.spyOn(authoringClient, 'draft').mockResolvedValue({ schemaVersion: 1, projectId: first.id, sourceVersion: 'source', normalizationVersion: 'working-image-v1', revision: 0, duration: '6', fps: '24', regions: [] })
    vi.spyOn(authoringClient, 'working').mockResolvedValue(new Blob(['working'], { type: 'image/png' }))
    vi.spyOn(authoringClient, 'latest').mockResolvedValue(null)
    vi.spyOn(authoringClient, 'capabilities').mockResolvedValue({ suggestRegions: { available: false, reason: 'Optional model unavailable.' }, refineRegion: { available: false, reason: 'Optional model unavailable.' } })
    render(<LocalProjects client={client([first])} />)
    await open(first.name)
    await userEvent.click(screen.getByRole('button', { name: 'Edit page' }))
    expect(await screen.findByRole('button', { name: 'Add part' })).toBeInTheDocument()
    expect(screen.getByLabelText('Scene duration')).toHaveValue('6')
  })
  it('saves a native File, shows saving state, then lists and displays its original', async () => {
    const api = client()
    const saving = deferred<LocalProject>()
    api.create.mockReturnValue(saving.promise)
    render(<LocalProjects client={api} />)
    await screen.findByText('No saved projects yet.')
    const file = new File(['original bytes'], 'first.png', { type: 'image/png' })
    await userEvent.upload(screen.getByLabelText('Page image'), file)
    await userEvent.click(screen.getByRole('button', { name: 'Save original' }))
    expect(screen.getByRole('button', { name: 'Saving original…' })).toBeDisabled()
    expect(api.create.mock.calls[0][0]).toBe(file)
    await act(async () => saving.resolve(first))
    fireEvent.load(await screen.findByAltText('Original page: first.png'))
    expect(await screen.findByRole('button', { name: 'Open first.png' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'first.png' })).toHaveFocus()
    expect(screen.getByRole('link', { name: 'Download original' })).toHaveAttribute('href', 'blob:original-1')
  })

  it('reopens the persisted list after remount without a client-side storage fallback', async () => {
    const api = client([first])
    const view = render(<LocalProjects client={api} />)
    await open(first.name)
    view.unmount()
    render(<LocalProjects client={api} />)
    await open(first.name)
    expect(api.list).toHaveBeenCalledTimes(2)
    expect(api.original).toHaveBeenCalledTimes(2)
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:original-1')
  })

  it('distinguishes unavailable service from an empty list and retries explicitly', async () => {
    const api = client()
    api.list.mockRejectedValueOnce(new Error('Local service unavailable. Start npm run dev.'))
    render(<LocalProjects client={api} />)
    expect(await screen.findByRole('alert')).toHaveTextContent('npm run dev')
    expect(screen.queryByText('No saved projects yet.')).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Retry loading projects' }))
    expect(await screen.findByText('No saved projects yet.')).toBeInTheDocument()
  })

  it('keeps the current original and selected file after a rejected save, then retries', async () => {
    const api = client([first])
    api.create.mockRejectedValueOnce(new Error('Image exceeds the local safety limit.')).mockResolvedValue(second)
    render(<LocalProjects client={api} />)
    await open(first.name)
    const file = new File(['next bytes'], 'second.png', { type: 'image/png' })
    const input = screen.getByLabelText('Page image') as HTMLInputElement
    await userEvent.upload(input, file)
    await userEvent.click(screen.getByRole('button', { name: 'Save original' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('local safety limit')
    expect(input.files?.[0]).toBe(file)
    expect(screen.getByRole('img', { name: 'Original page: first.png' })).toBeVisible()
    await userEvent.click(screen.getByRole('button', { name: 'Save original' }))
    fireEvent.load(await screen.findByAltText('Original page: second.png'))
    expect(await screen.findByRole('heading', { name: 'second.png' })).toBeInTheDocument()
  })

  it('keeps the current image after original fetch failure and offers retry', async () => {
    const api = client([second, first])
    render(<LocalProjects client={api} />)
    await open(first.name)
    api.original.mockRejectedValueOnce(new Error('Original could not be loaded.'))
    await userEvent.click(screen.getByRole('button', { name: 'Open second.png' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Original could not be loaded')
    expect(screen.getByRole('img', { name: 'Original page: first.png' })).toBeVisible()
    await userEvent.click(screen.getByRole('button', { name: 'Retry original' }))
    fireEvent.load(await screen.findByAltText('Original page: second.png'))
    expect(await screen.findByRole('heading', { name: 'second.png' })).toBeInTheDocument()
  })

  it('retains a downloadable original when image display fails and retries display', async () => {
    const api = client([first])
    render(<LocalProjects client={api} />)
    await userEvent.click(await screen.findByRole('button', { name: 'Open first.png' }))
    fireEvent.error(await screen.findByAltText('Original page: first.png'))
    expect(await screen.findByRole('alert')).toHaveTextContent('display')
    expect(screen.getByRole('link', { name: 'Download original' })).toHaveAttribute('href', 'blob:original-1')
    await userEvent.click(screen.getByRole('button', { name: 'Retry original' }))
    fireEvent.load(await screen.findByAltText('Original page: first.png'))
    expect(await screen.findByRole('heading', { name: 'first.png' })).toBeInTheDocument()
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:original-1')
  })

  it('ignores a slower stale reopen and revokes URLs on replacement and unmount', async () => {
    const api = client([first, second])
    const slow = deferred<Blob>()
    api.original.mockReturnValueOnce(slow.promise)
    const view = render(<LocalProjects client={api} />)
    await userEvent.click(await screen.findByRole('button', { name: 'Open first.png' }))
    await open(second.name)
    await act(async () => slow.resolve(new Blob(['stale'], { type: 'image/png' })))
    expect(screen.getByRole('heading', { name: 'second.png' })).toBeInTheDocument()
    expect(createObjectURL).toHaveBeenCalledTimes(1)
    await open(first.name)
    await waitFor(() => expect(revokeObjectURL).toHaveBeenCalledWith('blob:original-1'))
    view.unmount()
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:original-2')
  })

  it('does not allocate a URL after an in-flight original request is unmounted', async () => {
    const api = client([first])
    const pending = deferred<Blob>()
    api.original.mockReturnValue(pending.promise)
    const view = render(<LocalProjects client={api} />)
    await userEvent.click(await screen.findByRole('button', { name: 'Open first.png' }))
    view.unmount()
    await act(async () => pending.resolve(new Blob(['original'], { type: 'image/png' })))
    expect(createObjectURL).not.toHaveBeenCalled()
  })

  it('revokes an undisplayed candidate when a newer project is opened', async () => {
    const api = client([first, second])
    render(<LocalProjects client={api} />)
    await userEvent.click(await screen.findByRole('button', { name: 'Open first.png' }))
    const staleImage = await screen.findByAltText('Original page: first.png')
    await open(second.name)
    fireEvent.load(staleImage)
    expect(screen.getByRole('heading', { name: 'second.png' })).toBeInTheDocument()
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:original-1')
    expect(screen.queryByRole('heading', { name: 'first.png' })).not.toBeInTheDocument()
  })

  it('renders rejected upload messages as text and never automatically retries a failed save', async () => {
    const api = client()
    api.create.mockRejectedValue(new Error('<img src=x onerror=alert(1)>'))
    render(<LocalProjects client={api} />)
    await screen.findByText('No saved projects yet.')
    await userEvent.upload(screen.getByLabelText('Page image'), new File(['bytes'], 'page.png', { type: 'image/png' }))
    await userEvent.click(screen.getByRole('button', { name: 'Save original' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('<img src=x onerror=alert(1)>')
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
    expect(api.create).toHaveBeenCalledTimes(1)
  })
})
