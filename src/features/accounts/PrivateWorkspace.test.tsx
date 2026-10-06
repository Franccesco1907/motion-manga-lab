import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, it, vi } from 'vitest'
import { PrivateWorkspace } from './PrivateWorkspace'
import { accountClient } from './account-client'
import { expirePrivateSession, resetPrivateSession } from './private-session'
import { act } from 'react'
import { LocalProjects } from '../local-projects/LocalProjects'

afterEach(() => { cleanup(); resetPrivateSession() })

it('gates account editing until sign in, clears it on expiry, and never shows the previous owner to the next account', async () => {
  const client = { ...accountClient, runtime: vi.fn().mockResolvedValue({ mode: 'accounts' }), session: vi.fn().mockResolvedValue({ user: null, csrfToken: null }),
    login: vi.fn().mockResolvedValueOnce({ user: { id: 'owner-a', username: 'alice' }, csrfToken: 'csrf-a' }).mockResolvedValueOnce({ user: { id: 'owner-b', username: 'bob' }, csrfToken: 'csrf-b' }), logout: vi.fn().mockResolvedValue(undefined) }
  const workspace = vi.fn((owner: string) => <p>Private draft for {owner}</p>)
  render(<PrivateWorkspace client={client} workspace={workspace} />)
  expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument()
  expect(workspace).not.toHaveBeenCalled()
  await userEvent.type(screen.getByLabelText('Username'), 'alice')
  await userEvent.type(screen.getByLabelText('Password'), 'test-password')
  await userEvent.click(screen.getByRole('button', { name: 'Sign in' }))
  expect(await screen.findByText('Private draft for owner-a')).toBeInTheDocument()
  await act(async () => expirePrivateSession())
  expect(screen.queryByText('Private draft for owner-a')).not.toBeInTheDocument()
  expect(screen.getByText(/session expired/)).toBeInTheDocument()
  await userEvent.type(screen.getByLabelText('Username'), 'bob')
  await userEvent.type(screen.getByLabelText('Password'), 'other-password')
  await userEvent.click(screen.getByRole('button', { name: 'Sign in' }))
  expect(await screen.findByText('Private draft for owner-b')).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'Sign out' }))
  expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument()
  expect(screen.queryByText('Private draft for owner-b')).not.toBeInTheDocument()
  expect(client.logout).toHaveBeenCalledWith('csrf-b')
})

it('retains explicit local mode but never assumes local editing when runtime verification fails', async () => {
  const client = { ...accountClient, runtime: vi.fn().mockRejectedValueOnce(new Error('Service unavailable.')).mockResolvedValue({ mode: 'local' }), session: vi.fn() }
  const workspace = vi.fn(() => <p>Verified local editor</p>)
  render(<PrivateWorkspace client={client} workspace={workspace} />)
  expect(await screen.findByRole('alert')).toHaveTextContent('Service unavailable')
  expect(workspace).not.toHaveBeenCalled()
  await userEvent.click(screen.getByRole('button', { name: 'Retry workspace connection' }))
  expect(await screen.findByText('Verified local editor')).toBeInTheDocument()
  expect(client.session).not.toHaveBeenCalled()
})

it('revokes owner A image URLs and clears the selected project before owner B signs in', async () => {
  const revoke = vi.fn()
  Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: vi.fn(() => 'blob:owner-a') })
  Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: revoke })
  const project = { id: 'f3a8c842-a5f8-4ee4-89ec-15230555eca7', name: 'A-private.png', mimeType: 'image/png' as const, width: 2, height: 2, byteLength: 10, createdAt: '2026-10-05T00:00:00Z' }
  const client = { ...accountClient, runtime: vi.fn().mockResolvedValue({ mode: 'accounts' }), session: vi.fn().mockResolvedValue({ user: { id: 'owner-a', username: 'alice' }, csrfToken: 'csrf-a' }),
    login: vi.fn().mockResolvedValue({ user: { id: 'owner-b', username: 'bob' }, csrfToken: 'csrf-b' }), logout: vi.fn().mockResolvedValue(undefined) }
  const projects = { list: vi.fn().mockResolvedValueOnce([project]).mockResolvedValue([]), create: vi.fn(), original: vi.fn().mockResolvedValue(new Blob(['original'], { type: 'image/png' })) }
  render(<PrivateWorkspace client={client} workspace={ownerId => <LocalProjects ownerId={ownerId} client={projects} />} />)
  await userEvent.click(await screen.findByRole('button', { name: 'Open A-private.png' }))
  fireEvent.load(await screen.findByAltText('Original page: A-private.png'))
  expect(await screen.findByRole('img', { name: 'Original page: A-private.png' })).toBeVisible()
  await userEvent.click(screen.getByRole('button', { name: 'Sign out' }))
  await screen.findByRole('heading', { name: 'Sign in' })
  expect(revoke).toHaveBeenCalledWith('blob:owner-a')
  await userEvent.type(screen.getByLabelText('Username'), 'bob')
  await userEvent.type(screen.getByLabelText('Password'), 'other-test-password')
  await userEvent.click(screen.getByRole('button', { name: 'Sign in' }))
  expect(await screen.findByText('No saved projects yet.')).toBeInTheDocument()
  expect(screen.queryByText('A-private.png')).not.toBeInTheDocument()
  expect(screen.queryByRole('img')).not.toBeInTheDocument()
})
