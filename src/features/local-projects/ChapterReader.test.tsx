import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { ChapterReader } from './ChapterReader'
import { authoringClient } from './authoring-client'
import { localProjectClient } from './local-project-client'
import type { LocalProject } from './contracts'

const a: LocalProject = { id: 'f3a8c842-a5f8-4ee4-89ec-15230555eca7', name: 'a.png', mimeType: 'image/png', width: 2, height: 2, byteLength: 10, createdAt: '2026-10-04T00:00:00.000Z' }
const b = { ...a, id: 'e209c512-f69f-4f68-b034-53296ca3e039', name: 'b.png' }
const revoke = vi.fn()
beforeEach(() => {
  revoke.mockClear()
  Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: vi.fn(() => 'blob:reading') })
  Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: revoke })
})
afterEach(cleanup)

it('reads pages in chapter order with keyboard controls and cleans assets on navigation', async () => {
  const originals = { ...localProjectClient, original: vi.fn().mockResolvedValue(new Blob(['image'], { type: 'image/png' })) }
  const client = { ...authoringClient, latest: vi.fn().mockResolvedValue(null) }
  render(<ChapterReader name="chapter" pageIds={[b.id, a.id]} projects={[a, b]} client={client} originals={originals} />)
  expect(await screen.findByRole('img', { name: 'Static original: b.png' })).toBeVisible()
  expect(screen.getByRole('button', { name: 'Previous page' })).toBeDisabled()
  await userEvent.click(screen.getByRole('button', { name: 'Next page' }))
  expect(await screen.findByRole('img', { name: 'Static original: a.png' })).toBeVisible()
  expect(screen.getByRole('button', { name: 'Next page' })).toBeDisabled()
  expect(originals.original.mock.calls.map(call => call[0])).toEqual([b.id, a.id])
  expect(revoke).toHaveBeenCalledWith('blob:reading')
})

it('keeps the original readable when completed-render metadata is missing', async () => {
  const originals = { ...localProjectClient, original: vi.fn().mockResolvedValue(new Blob(['image'], { type: 'image/png' })) }
  const client = { ...authoringClient, latest: vi.fn().mockRejectedValue(new Error('Render metadata unavailable.')) }
  render(<ChapterReader name="chapter" pageIds={[a.id]} projects={[a]} client={client} originals={originals} />)
  expect(await screen.findByRole('img', { name: 'Static original: a.png' })).toBeVisible()
  expect(screen.getByRole('alert')).toHaveTextContent('Render metadata unavailable')
})
