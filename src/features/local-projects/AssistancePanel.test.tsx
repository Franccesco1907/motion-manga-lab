import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, it, vi } from 'vitest'
import { AssistancePanel } from './AssistancePanel'
import { authoringClient } from './authoring-client'
import { newRegion } from './draft-editing'
import type { LocalAssistanceJob, LocalDraft } from './contracts'

const draft: LocalDraft = { schemaVersion: 1, projectId: 'f3a8c842-a5f8-4ee4-89ec-15230555eca7', sourceVersion: 'source', normalizationVersion: 'working-image-v1', revision: 1, duration: '6', fps: '24', regions: [newRegion('first')] }
const job: LocalAssistanceJob = { id: '35bfe329-e084-4635-8a28-bd6db6b7e0cc', projectId: draft.projectId, sourceVersion: draft.sourceVersion, draftRevision: 1, mode: 'suggest', reviewRequired: true, status: 'completed', regions: [newRegion('suggestion')] }
afterEach(cleanup)

it('offers actual available assistance only on explicit request and applies only after review', async () => {
  const client = { ...authoringClient, capabilities: vi.fn().mockResolvedValue({ suggestRegions: { available: true, reason: 'Offline Magi available.' }, refineRegion: { available: true, reason: 'Offline SAM available.' } }), assist: vi.fn().mockResolvedValue(job) }
  const apply = vi.fn()
  render(<AssistancePanel draft={draft} selectedId="first" client={client} prepare={async () => draft} apply={apply} />)
  await screen.findByRole('button', { name: 'Suggest regions' })
  expect(client.assist).not.toHaveBeenCalled()
  await userEvent.click(screen.getByRole('button', { name: 'Suggest regions' }))
  expect(await screen.findByText(/requires your review/)).toBeInTheDocument()
  expect(apply).not.toHaveBeenCalled()
  await userEvent.click(screen.getByRole('button', { name: 'Apply suggested regions' }))
  expect(apply.mock.calls[0][0].regions).toHaveLength(2)
})

it('shows unavailable reasons without inventing successful suggestions', async () => {
  const client = { ...authoringClient, capabilities: vi.fn().mockResolvedValue({ suggestRegions: { available: false, reason: 'Magi runtime not installed.' }, refineRegion: { available: false, reason: 'SAM runtime not installed.' } }), assist: vi.fn() }
  render(<AssistancePanel draft={draft} selectedId="first" client={client} prepare={async () => draft} apply={vi.fn()} />)
  expect(await screen.findByText('Magi runtime not installed.')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Suggest regions' })).toBeDisabled()
  expect(client.assist).not.toHaveBeenCalled()
})
