import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { GuestReading } from './GuestReading'
import { guestClient } from './share-client'

const token = 'a'.repeat(43)
const page = (index: number) => ({ index, name: `Page ${index + 1}`, width: 2, height: 2, duration: 1, fps: 4, posterPath: `/api/read/${token}/pages/${index}/poster`, videoPath: `/api/read/${token}/pages/${index}/video`, videoMime: 'video/webm' as const })
beforeEach(() => {
  Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: vi.fn(() => 'blob:guest') })
  Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() })
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() })))
})
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

it('reads only approved derived pages without exposing editable workspace controls', async () => {
  const client = { ...guestClient, manifest: vi.fn().mockResolvedValue({ name: 'Shared chapter', attribution: '<b>Artist credit</b>', revision: 0, pages: [page(0), page(1)] }), poster: vi.fn().mockResolvedValue(new Blob(['poster'], { type: 'image/png' })), video: vi.fn() }
  render(<GuestReading token={token} client={client} />)
  expect(await screen.findByRole('img', { name: 'Reviewed static page: Page 1' })).toBeVisible()
  expect(screen.queryByRole('button', { name: 'Edit page' })).not.toBeInTheDocument()
  expect(screen.queryByLabelText('Page image')).not.toBeInTheDocument()
  expect(client.video).not.toHaveBeenCalled()
  expect(screen.getByRole('button', { name: 'Play' })).toBeDisabled()
  expect(screen.getByText('<b>Artist credit</b>')).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'Next page' }))
  expect(await screen.findByRole('img', { name: 'Reviewed static page: Page 2' })).toBeVisible()
  expect(client.poster.mock.calls.map(call => call[1])).toEqual([0, 1])
})

it('clears a withdrawn reading on reload instead of opening a private local fallback', async () => {
  const client = { ...guestClient, manifest: vi.fn().mockResolvedValueOnce({ name: 'Shared chapter', attribution: '', revision: 0, pages: [page(0)] }).mockRejectedValue(new Error('Shared reading unavailable. The link was withdrawn.')), poster: vi.fn().mockResolvedValue(new Blob(['poster'], { type: 'image/png' })) }
  render(<GuestReading token={token} client={client} />)
  await screen.findByRole('img')
  await userEvent.click(screen.getByRole('button', { name: 'Reload shared reading' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('withdrawn')
  expect(screen.queryByRole('img')).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Local projects' })).not.toBeInTheDocument()
})
