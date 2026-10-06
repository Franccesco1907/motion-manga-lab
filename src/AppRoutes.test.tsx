import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import App from './App'
import { guestClient } from './features/sharing/share-client'
import { accountClient } from './features/accounts/account-client'
import { localProjectClient } from './features/local-projects/local-project-client'

afterEach(() => { cleanup(); history.replaceState({}, '', '/'); vi.restoreAllMocks() })

it('keeps guest URLs read-only and never bootstraps accounts or fetches private projects', async () => {
  history.replaceState({}, '', `/read/${'a'.repeat(43)}`)
  vi.spyOn(guestClient, 'manifest').mockRejectedValue(new Error('Shared reading unavailable. The link was withdrawn.'))
  const runtime = vi.spyOn(accountClient, 'runtime')
  const projects = vi.spyOn(localProjectClient, 'list')
  render(<App />)
  expect(await screen.findByRole('alert')).toHaveTextContent('withdrawn')
  expect(runtime).not.toHaveBeenCalled()
  expect(projects).not.toHaveBeenCalled()
  expect(screen.queryByRole('button', { name: 'Local projects' })).not.toBeInTheDocument()
  expect(screen.queryByLabelText('Username')).not.toBeInTheDocument()
})
