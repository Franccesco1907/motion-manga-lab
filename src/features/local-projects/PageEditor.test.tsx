import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { PageEditor } from './PageEditor'
import { authoringClient } from './authoring-client'
import { newRegion } from './draft-editing'
import type { LocalDraft, LocalProject, LocalRenderArtifact, LocalRenderJob } from './contracts'

const project: LocalProject = { id: 'f3a8c842-a5f8-4ee4-89ec-15230555eca7', name: 'page.png', mimeType: 'image/png', width: 100, height: 100, byteLength: 10, createdAt: '2026-10-04T00:00:00.000Z' }
const saved: LocalDraft = { schemaVersion: 1, projectId: project.id, sourceVersion: 'source', normalizationVersion: 'working-image-v1', revision: 0, duration: '6', fps: '24', regions: [newRegion('first'), newRegion('second')] }

function api() {
  return { ...authoringClient, draft: vi.fn().mockResolvedValue(structuredClone(saved)), working: vi.fn().mockResolvedValue(new Blob(['image'], { type: 'image/png' })),
    capabilities: vi.fn().mockResolvedValue({ suggestRegions: { available: false, reason: 'Optional model not installed.' }, refineRegion: { available: false, reason: 'Optional model not installed.' } }),
    latest: vi.fn().mockResolvedValue(null), saveDraft: vi.fn().mockImplementation(async (draft: LocalDraft) => ({ ...draft, revision: draft.revision + 1 })),
    render: vi.fn().mockRejectedValue(new Error('Horizontal movement must be finite.')) }
}

beforeEach(() => {
  localStorage.clear()
  vi.stubGlobal('PointerEvent', MouseEvent)
  Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: vi.fn(() => 'blob:working') })
  Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() })
})
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); localStorage.clear() })

async function editor(client = api()) {
  const view = render(<PageEditor project={project} originalUrl="blob:original" client={client} />)
  await screen.findByLabelText('Part label')
  return { view, client }
}

it('preserves incomplete motion fields across part switches and saves all raw values', async () => {
  const { client } = await editor()
  await userEvent.selectOptions(screen.getByLabelText('Movement'), 'translate')
  await userEvent.clear(screen.getByLabelText('Horizontal movement'))
  await userEvent.selectOptions(screen.getByLabelText('Selected part'), 'second')
  await userEvent.selectOptions(screen.getByLabelText('Movement'), 'rotate')
  await userEvent.clear(screen.getByLabelText('Rotation angle'))
  await userEvent.type(screen.getByLabelText('Rotation angle'), '-')
  await userEvent.selectOptions(screen.getByLabelText('Selected part'), 'first')
  expect(screen.getByLabelText('Horizontal movement')).toHaveValue('')
  await userEvent.click(screen.getByRole('button', { name: 'Save draft' }))
  await screen.findByText('Draft saved.')
  const draft = client.saveDraft.mock.calls[0][0] as LocalDraft
  expect(draft.regions[0].motion.dx).toBe('')
  expect(draft.regions[1].motion.angle).toBe('-')
  expect(draft.regions[0].selection).toEqual(saved.regions[0].selection)
})

it('upgrades only an explicit scale choice to v2 and leaves drawing geometry unchanged at identity', async () => {
  const { client } = await editor()
  await userEvent.selectOptions(screen.getByLabelText('Movement'), 'scale')
  expect(screen.getByLabelText('Uniform drawing scale')).toHaveValue('1')
  expect(screen.getByLabelText('Pivot X')).toHaveValue('0.5')
  expect(screen.getByText(/0.75 to 1.25/)).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'Save draft' }))
  await screen.findByText('Draft saved.')
  const draft = client.saveDraft.mock.calls[0][0] as LocalDraft
  expect(draft.schemaVersion).toBe(2)
  expect(draft.regions[0].motion.scale).toBe('1')
  expect(draft.regions[0].selection).toEqual(saved.regions[0].selection)
  expect(draft.regions[1]).toEqual(saved.regions[1])
})

it('preserves incomplete scale factors across parts and reopens distinct stretch axes without coercion', async () => {
  const client = api()
  const { view } = await editor(client)
  await userEvent.selectOptions(screen.getByLabelText('Movement'), 'scale')
  await userEvent.clear(screen.getByLabelText('Uniform drawing scale'))
  await userEvent.selectOptions(screen.getByLabelText('Selected part'), 'second')
  await userEvent.selectOptions(screen.getByLabelText('Movement'), 'stretch')
  await userEvent.clear(screen.getByLabelText('Drawing scale X'))
  await userEvent.type(screen.getByLabelText('Drawing scale X'), '1.2')
  await userEvent.clear(screen.getByLabelText('Drawing scale Y'))
  await userEvent.type(screen.getByLabelText('Drawing scale Y'), '-')
  await userEvent.clear(screen.getByLabelText('Pivot X'))
  await userEvent.type(screen.getByLabelText('Pivot X'), '0.3')
  await userEvent.click(screen.getByRole('button', { name: 'Save draft' }))
  await screen.findByText('Draft saved.')
  const draft = client.saveDraft.mock.calls[0][0] as LocalDraft
  expect(draft.schemaVersion).toBe(2)
  expect(draft.regions[0].motion.scale).toBe('')
  expect(draft.regions[1].motion.scaleX).toBe('1.2')
  expect(draft.regions[1].motion.scaleY).toBe('-')
  expect(draft.regions[1].motion.anchorX).toBe('0.3')
  expect(draft.regions[1].selection).toEqual(saved.regions[1].selection)
  view.unmount()
  client.draft.mockResolvedValue({ ...draft, revision: 1 })
  await editor(client)
  expect(screen.getByLabelText('Uniform drawing scale')).toHaveValue('')
  await userEvent.selectOptions(screen.getByLabelText('Selected part'), 'second')
  expect(screen.getByLabelText('Drawing scale X')).toHaveValue('1.2')
  expect(screen.getByLabelText('Drawing scale Y')).toHaveValue('-')
})

it('does not upgrade or add affine defaults when editing a legacy movement', async () => {
  const { client } = await editor()
  await userEvent.selectOptions(screen.getByLabelText('Movement'), 'translate')
  await userEvent.click(screen.getByRole('button', { name: 'Save draft' }))
  await screen.findByText('Draft saved.')
  const draft = client.saveDraft.mock.calls[0][0] as LocalDraft
  expect(draft.schemaVersion).toBe(1)
  expect(draft.regions[0].motion.scale).toBeUndefined()
  expect(draft.regions[0].motion.scaleX).toBeUndefined()
})

it('shows only effective affine timing controls for a fixed periodic renderer curve', async () => {
  await editor()
  await userEvent.selectOptions(screen.getByLabelText('Movement'), 'scale')
  expect(screen.getByLabelText('Easing')).toBeInTheDocument()
  expect(screen.getByLabelText('Final state')).toBeInTheDocument()
  await userEvent.type(screen.getByLabelText('Gesture period (optional)'), '1')
  expect(screen.queryByLabelText('Easing')).not.toBeInTheDocument()
  expect(screen.queryByLabelText('Final state')).not.toBeInTheDocument()
  expect(screen.getByText(/fixed sine curve and returns to identity/)).toBeInTheDocument()
})

it('draws an on-image rectangle and supports numeric add/erase brush corrections', async () => {
  const { client } = await editor()
  const surface = screen.getByLabelText('Working image selection surface')
  vi.spyOn(surface, 'getBoundingClientRect').mockReturnValue(DOMRect.fromRect({ x: 0, y: 0, width: 100, height: 100 }))
  fireEvent.pointerDown(surface, { clientX: 10, clientY: 20, button: 0 })
  fireEvent.pointerMove(surface, { clientX: 40, clientY: 60 })
  fireEvent.pointerUp(surface, { clientX: 40, clientY: 60 })
  expect(screen.getByLabelText('Selection X')).toHaveValue('0.1')
  expect(screen.getByLabelText('Selection width')).toHaveValue('0.3')
  await userEvent.selectOptions(screen.getByLabelText('Selection tool'), 'erase')
  await userEvent.click(screen.getByRole('button', { name: 'Apply brush point' }))
  await userEvent.selectOptions(screen.getByLabelText('Selection tool'), 'add')
  await userEvent.click(screen.getByRole('button', { name: 'Apply brush point' }))
  await userEvent.click(screen.getByRole('button', { name: 'Save draft' }))
  await screen.findByText('Draft saved.')
  const draft = client.saveDraft.mock.calls[0][0] as LocalDraft
  expect(draft.regions[0].selection.strokes.map(stroke => stroke.mode)).toEqual(['erase', 'add'])
  expect(screen.getByText(/nonsemantic fallback/)).toBeInTheDocument()
})

it('recovers raw drafts after failed saves and keeps them after render errors', async () => {
  const client = api()
  client.saveDraft.mockRejectedValueOnce(new Error('Disk unavailable.'))
  const { view } = await editor(client)
  await userEvent.clear(screen.getByLabelText('Scene duration'))
  await userEvent.click(screen.getByRole('button', { name: 'Save draft' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Disk unavailable')
  view.unmount()
  await editor(client)
  expect(screen.getByLabelText('Scene duration')).toHaveValue('')
  expect(screen.getByText(/Recovered unsaved draft/)).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'Save & render' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Horizontal movement must be finite')
  expect(screen.getByLabelText('Scene duration')).toHaveValue('')
})

it('reports revision conflicts without discarding raw edits and requires explicit reload', async () => {
  const client = api()
  client.saveDraft.mockRejectedValue(new Error('Draft revision conflict. Reload saved draft before retrying.'))
  await editor(client)
  await userEvent.clear(screen.getByLabelText('Scene duration'))
  await userEvent.click(screen.getByRole('button', { name: 'Save draft' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('revision conflict')
  expect(screen.getByLabelText('Scene duration')).toHaveValue('')
  expect(screen.getByRole('button', { name: 'Discard local edits & reload' })).toBeEnabled()
})

it('keeps selection edits made while a whole-draft save is pending', async () => {
  const client = api()
  let complete!: (draft: LocalDraft) => void
  client.saveDraft.mockReturnValue(new Promise<LocalDraft>(resolve => { complete = resolve }))
  await editor(client)
  const surface = screen.getByLabelText('Working image selection surface')
  vi.spyOn(surface, 'getBoundingClientRect').mockReturnValue(DOMRect.fromRect({ x: 0, y: 0, width: 100, height: 100 }))
  await userEvent.click(screen.getByRole('button', { name: 'Save draft' }))
  fireEvent.pointerDown(surface, { clientX: 10, clientY: 10, button: 0 })
  fireEvent.pointerUp(surface, { clientX: 30, clientY: 30 })
  complete({ ...saved, revision: 1 })
  expect(await screen.findByText(/newer edits remain unsaved/)).toBeInTheDocument()
  expect(screen.getByLabelText('Selection X')).toHaveValue('0.1')
})

const renderArtifact: LocalRenderArtifact = { id: '35bfe329-e084-4635-8a28-bd6db6b7e0cc', projectId: project.id, sourceVersion: 'source', normalizationVersion: 'working-image-v1', draftRevision: 1, width: 100, height: 100, duration: 6, fps: 24, createdAt: project.createdAt, videoMime: 'video/webm' }
const renderJob: LocalRenderJob = { id: 'a8942f85-5e0f-4a4c-8f35-4a70e80f2e52', projectId: project.id, sourceVersion: 'source', draftRevision: 1, status: 'queued' }

it.each(['scale', 'stretch'] as const)('saves and requests the v2 renderer for an explicit %s movement', async type => {
  const client = api()
  client.render.mockResolvedValue({ ...renderJob, rendererVersion: 'affine-a-v2', draftSchemaVersion: 2 })
  await editor(client)
  await userEvent.selectOptions(screen.getByLabelText('Movement'), type)
  const label = type === 'scale' ? 'Uniform drawing scale' : 'Drawing scale X'
  await userEvent.clear(screen.getByLabelText(label))
  await userEvent.type(screen.getByLabelText(label), '1.1')
  if (type === 'stretch') {
    await userEvent.clear(screen.getByLabelText('Drawing scale Y'))
    await userEvent.type(screen.getByLabelText('Drawing scale Y'), '0.9')
  }
  await userEvent.click(screen.getByRole('button', { name: 'Save & render' }))
  expect(await screen.findByText(/Render queued/)).toBeInTheDocument()
  const draft = client.render.mock.calls[0][0] as LocalDraft
  expect(draft.schemaVersion).toBe(2)
  expect(draft.regions[0].motion.type).toBe(type)
  expect(type === 'scale' ? draft.regions[0].motion.scale : draft.regions[0].motion.scaleX).toBe('1.1')
  if (type === 'stretch') expect(draft.regions[0].motion.scaleY).toBe('0.9')
  expect(draft.regions[0].selection).toEqual(saved.regions[0].selection)
})

it('shows a render job, refreshes completion and never fetches playback automatically', async () => {
  const client = api()
  client.render.mockResolvedValue(renderJob)
  const status = vi.fn().mockResolvedValue({ ...renderJob, status: 'completed', artifact: renderArtifact })
  const video = vi.fn().mockResolvedValue(new Blob(['webm'], { type: 'video/webm' }))
  await editor({ ...client, job: status, video })
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })))
  await userEvent.click(screen.getByRole('button', { name: 'Save & render' }))
  expect(await screen.findByText(/Render queued/)).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'Refresh render status' }))
  expect(await screen.findByRole('button', { name: 'Play' })).toBeEnabled()
  expect(video).not.toHaveBeenCalled()
})

it('cancels rendering and ignores a stale status response while retaining draft edits', async () => {
  const client = api()
  client.render.mockResolvedValue(renderJob)
  let complete!: (job: LocalRenderJob) => void
  const status = vi.fn().mockReturnValue(new Promise<LocalRenderJob>(resolve => { complete = resolve }))
  const cancel = vi.fn().mockResolvedValue({ ...renderJob, status: 'cancelled' })
  await editor({ ...client, job: status, cancel })
  await userEvent.click(screen.getByRole('button', { name: 'Save & render' }))
  await screen.findByText(/Render queued/)
  await userEvent.click(screen.getByRole('button', { name: 'Refresh render status' }))
  await userEvent.click(screen.getByRole('button', { name: 'Cancel render' }))
  expect(await screen.findByText('Render cancelled. Draft and selections are kept.')).toBeInTheDocument()
  await act(async () => complete({ ...renderJob, status: 'completed', artifact: renderArtifact }))
  expect(screen.queryByRole('button', { name: 'Play' })).not.toBeInTheDocument()
  expect(screen.getByLabelText('Selection X')).toHaveValue('0.25')
})
