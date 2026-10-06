import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, it, vi } from 'vitest'
import { LocalChapters } from './LocalChapters'
import { authoringClient } from './authoring-client'
import type { LocalChapter, LocalProject, LocalSnapshot } from './contracts'

const a: LocalProject = { id: 'f3a8c842-a5f8-4ee4-89ec-15230555eca7', name: 'a.png', mimeType: 'image/png', width: 2, height: 2, byteLength: 10, createdAt: '2026-10-04T00:00:00.000Z' }
const b: LocalProject = { ...a, id: 'e209c512-f69f-4f68-b034-53296ca3e039', name: 'b.png' }
const chapter: LocalChapter = { id: '3f43dcac-463f-4d71-866a-6e242a0753bc', name: 'My chapter', pageIds: [a.id, b.id], revision: 0, createdAt: a.createdAt, updatedAt: a.createdAt }
const snapshot: LocalSnapshot = { id: '35bfe329-e084-4635-8a28-bd6db6b7e0cc', chapterId: chapter.id, name: chapter.name, revision: 0, createdAt: a.createdAt, pages: [] }
afterEach(cleanup)

function client() { return { ...authoringClient, chapters: vi.fn().mockResolvedValue([chapter]), snapshots: vi.fn().mockResolvedValue([]),
  createChapter: vi.fn().mockResolvedValue({ ...chapter, pageIds: [] }),
  saveChapter: vi.fn().mockImplementation(async (next: LocalChapter) => ({ ...next, revision: next.revision + 1 })),
  publish: vi.fn().mockResolvedValue(snapshot), unpublish: vi.fn().mockResolvedValue(undefined) } }

it('reorders chapter pages, saves order, and reopens that order from the adapter', async () => {
  const api = client()
  const view = render(<LocalChapters projects={[a, b]} client={api} />)
  await screen.findByRole('button', { name: 'Move b.png up' })
  await userEvent.click(screen.getByRole('button', { name: 'Move b.png up' }))
  const order = screen.getByRole('list', { name: 'Chapter page order' })
  expect(within(order).getAllByRole('listitem').map(item => item.textContent?.slice(0, 5))).toEqual(['b.png', 'a.png'])
  await userEvent.click(screen.getByRole('button', { name: 'Save chapter' }))
  expect(await screen.findByText('Chapter saved.')).toBeInTheDocument()
  const saved = api.saveChapter.mock.calls[0][0] as LocalChapter
  expect(saved.pageIds).toEqual([b.id, a.id])
  view.unmount()
  api.chapters.mockResolvedValue([{ ...saved, revision: 1 }])
  render(<LocalChapters projects={[a, b]} client={api} />)
  await screen.findByRole('button', { name: 'Move a.png up' })
  expect(within(screen.getByRole('list', { name: 'Chapter page order' })).getAllByRole('listitem')[0]).toHaveTextContent('b.png')
})

it('creates a local chapter, adds existing pages and never claims Internet publication', async () => {
  const api = client()
  api.chapters.mockResolvedValue([])
  render(<LocalChapters projects={[a, b]} client={api} />)
  await screen.findByText('No chapters yet.')
  await userEvent.type(screen.getByLabelText('New chapter name'), 'My chapter')
  await userEvent.click(screen.getByRole('button', { name: 'Create chapter' }))
  await screen.findByLabelText('Existing page')
  await userEvent.selectOptions(screen.getByLabelText('Existing page'), a.id)
  await userEvent.click(screen.getByRole('button', { name: 'Add page to chapter' }))
  expect(screen.getByRole('list', { name: 'Chapter page order' })).toHaveTextContent('a.png')
  expect(screen.getByText(/not Internet sharing/)).toBeInTheDocument()
})

it('requires explicit review, replaces a local snapshot, and unpublishes it', async () => {
  const api = client()
  render(<LocalChapters projects={[a, b]} client={api} />)
  await screen.findByRole('button', { name: 'Create local reading snapshot' })
  expect(screen.getByRole('button', { name: 'Create local reading snapshot' })).toBeDisabled()
  await userEvent.click(screen.getByLabelText('I reviewed every rendered page and its static fallback.'))
  await userEvent.click(screen.getByRole('button', { name: 'Create local reading snapshot' }))
  expect(await screen.findByText('Local reading snapshot created.')).toBeInTheDocument()
  expect(api.publish).toHaveBeenCalledWith(chapter, undefined)
  await userEvent.click(screen.getByLabelText('I reviewed every rendered page and its static fallback.'))
  await userEvent.click(screen.getByRole('button', { name: 'Replace local reading snapshot' }))
  expect(api.publish).toHaveBeenLastCalledWith(chapter, snapshot)
  await userEvent.click(screen.getByRole('button', { name: 'Unpublish local snapshot' }))
  expect(await screen.findByText('Local reading snapshot unpublished.')).toBeInTheDocument()
  expect(api.unpublish).toHaveBeenCalledWith(snapshot)
})

it('keeps chapter edits and valid published reading when a stale render blocks replacement', async () => {
  const api = client()
  api.snapshots.mockResolvedValue([snapshot])
  api.publish.mockRejectedValue(new Error('Every page needs a matching completed render.'))
  render(<LocalChapters projects={[a, b]} client={api} />)
  await screen.findByRole('button', { name: 'Replace local reading snapshot' })
  await userEvent.click(screen.getByLabelText('I reviewed every rendered page and its static fallback.'))
  await userEvent.click(screen.getByRole('button', { name: 'Replace local reading snapshot' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('matching completed render')
  expect(screen.getByRole('button', { name: 'Read local snapshot' })).toBeEnabled()
})
