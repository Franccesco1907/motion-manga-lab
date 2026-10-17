import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, it, vi } from 'vitest'
import { LocalProjects } from './LocalProjects'
import { authoringClient } from './authoring-client'
import type { LocalProject } from './contracts'

const originalCreate = Object.getOwnPropertyDescriptor(URL, 'createObjectURL')
const originalRevoke = Object.getOwnPropertyDescriptor(URL, 'revokeObjectURL')
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  localStorage.clear()
  if (originalCreate) Object.defineProperty(URL, 'createObjectURL', originalCreate)
  else Reflect.deleteProperty(URL, 'createObjectURL')
  if (originalRevoke) Object.defineProperty(URL, 'revokeObjectURL', originalRevoke)
  else Reflect.deleteProperty(URL, 'revokeObjectURL')
})

it('uploads into the real editor after original loading without a second edit action or canvas', async () => {
  const project: LocalProject = { id: 'f3a8c842-a5f8-4ee4-89ec-15230555eca7', name: 'page.png', mimeType: 'image/png', width: 200, height: 300, byteLength: 10, createdAt: '2026-10-13T00:00:00Z' }
  const blob = new Blob(['page'], { type: 'image/png' })
  let urlCount = 0
  Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: vi.fn(() => `blob:integration-${++urlCount}`) })
  Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() })
  vi.spyOn(authoringClient, 'draft').mockResolvedValue({ schemaVersion: 1, projectId: project.id, sourceVersion: 'source', normalizationVersion: 'working-image-v1', revision: 0, duration: '6', fps: '24', regions: [] })
  vi.spyOn(authoringClient, 'working').mockResolvedValue(blob)
  vi.spyOn(authoringClient, 'latest').mockResolvedValue(null)
  vi.spyOn(authoringClient, 'capabilities').mockResolvedValue({ suggestRegions: { available: false, reason: 'Optional model unavailable.' }, refineRegion: { available: false, reason: 'Optional model unavailable.' } })
  const client = { list: vi.fn().mockResolvedValue([]), create: vi.fn().mockResolvedValue(project), original: vi.fn().mockResolvedValue(blob) }
  render(<LocalProjects client={client} />)
  await screen.findByText('No saved pages yet.')
  await userEvent.upload(screen.getByLabelText('Page image'), new File(['page'], project.name, { type: 'image/png' }))
  await userEvent.click(screen.getByRole('button', { name: 'Upload page' }))
  const candidate = await screen.findByAltText('Original page: page.png')
  expect(candidate).not.toBeVisible()
  expect(authoringClient.draft).not.toHaveBeenCalled()
  fireEvent.load(candidate)
  expect(await screen.findByRole('button', { name: 'Add part' })).toBeInTheDocument()
  expect(screen.getByRole('heading', { name: 'page.png', level: 1 })).toHaveFocus()
  await userEvent.click(screen.getByRole('button', { name: 'Add part' }))
  await userEvent.click(screen.getByText('Advanced', { selector: 'summary' }))
  expect(screen.getByLabelText('Scene duration')).toHaveValue('6')
  expect(screen.queryByRole('button', { name: 'Edit page' })).not.toBeInTheDocument()
  expect(screen.queryByRole('img', { name: 'Original page: page.png' })).not.toBeInTheDocument()
  expect(screen.getAllByRole('img')).toHaveLength(1)
  expect(screen.getByRole('link', { name: 'Download original' })).toHaveAttribute('download', project.name)
})
