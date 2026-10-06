import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, it, vi } from 'vitest'
import { SharePanel } from './SharePanel'
import { shareClient } from './share-client'
import type { LocalSnapshot } from '../local-projects/contracts'
import type { OwnerShare } from './contracts'

const token = 'a'.repeat(43)
const snapshot: LocalSnapshot = { id: '35bfe329-e084-4635-8a28-bd6db6b7e0cc', chapterId: '3f43dcac-463f-4d71-866a-6e242a0753bc', name: 'Chapter', revision: 2, createdAt: '2026-10-05T00:00:00Z', pages: [] }
const share: OwnerShare = { id: '96e8c7f9-63c2-4708-9617-c8866d37d244', snapshotId: snapshot.id, snapshotRevision: 2, name: snapshot.name, createdAt: snapshot.createdAt, revision: 0, rightsConfirmed: true, rightsConfirmedAt: snapshot.createdAt, attribution: '' }
afterEach(cleanup)

it('requires explicit review, copies only a real newly created link and withdraws it', async () => {
  const client = { ...shareClient, list: vi.fn().mockResolvedValue([]), create: vi.fn().mockResolvedValue({ share, token, path: `/read/${token}` }), withdraw: vi.fn().mockResolvedValue(undefined) }
  const user = userEvent.setup()
  const clipboard = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue(undefined)
  render(<SharePanel snapshot={snapshot} client={client} />)
  await screen.findByText('No active guest link for this snapshot.')
  expect(screen.getByRole('button', { name: 'Share reviewed snapshot' })).toBeDisabled()
  await user.click(screen.getByLabelText('I approve unlisted guest reading of this reviewed snapshot.'))
  expect(screen.getByRole('button', { name: 'Share reviewed snapshot' })).toBeDisabled()
  await user.click(screen.getByLabelText('I confirm I have permission to share this content.'))
  await user.type(screen.getByLabelText('Attribution (optional)'), 'Artist credit')
  await user.click(screen.getByRole('button', { name: 'Share reviewed snapshot' }))
  await user.click(await screen.findByRole('button', { name: 'Copy new guest link' }))
  expect(client.create).toHaveBeenCalledWith(snapshot, { rightsConfirmed: true, attribution: 'Artist credit' })
  expect(clipboard).toHaveBeenCalledWith(`${location.origin}/read/${token}`)
  await user.click(screen.getByRole('button', { name: 'Withdraw guest link' }))
  expect(await screen.findByText('Guest link withdrawn. Future guest requests are blocked.')).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Copy new guest link' })).not.toBeInTheDocument()
})

it('never reconstructs a raw link from persisted hash-only metadata', async () => {
  const client = { ...shareClient, list: vi.fn().mockResolvedValue([share]) }
  render(<SharePanel snapshot={snapshot} client={client} />)
  expect(await screen.findByText(/not stored and cannot be reconstructed/)).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Copy new guest link' })).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Replace guest link' })).toBeDisabled()
})

it('shows a backend permission rejection without creating a link or inventing approval', async () => {
  const client = { ...shareClient, list: vi.fn().mockResolvedValue([]), create: vi.fn().mockRejectedValue(new Error('Confirm permission to share this content.')) }
  render(<SharePanel snapshot={snapshot} client={client} />)
  await screen.findByText('No active guest link for this snapshot.')
  await userEvent.click(screen.getByLabelText('I approve unlisted guest reading of this reviewed snapshot.'))
  await userEvent.click(screen.getByLabelText('I confirm I have permission to share this content.'))
  await userEvent.click(screen.getByRole('button', { name: 'Share reviewed snapshot' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Confirm permission')
  expect(screen.queryByRole('button', { name: 'Copy new guest link' })).not.toBeInTheDocument()
})
