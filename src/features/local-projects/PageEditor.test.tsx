import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
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
    latest: vi.fn().mockResolvedValue(null), video: vi.fn().mockResolvedValue(new Blob(['webm'], { type: 'video/webm' })), saveDraft: vi.fn().mockImplementation(async (draft: LocalDraft) => ({ ...draft, revision: draft.revision + 1 })),
    render: vi.fn().mockRejectedValue(new Error('Horizontal movement must be finite.')) }
}

beforeEach(() => {
  localStorage.clear()
  vi.stubGlobal('PointerEvent', MouseEvent)
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })))
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue()
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {})
  Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: vi.fn(() => 'blob:working') })
  Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() })
})
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); localStorage.clear() })

async function editor(client = api()) {
  const view = render(<PageEditor project={project} originalUrl="blob:original" client={client} />)
  await screen.findByLabelText('Part label')
  const image = screen.getByAltText('Working copy for manual selection')
  Object.defineProperties(image, { naturalWidth: { configurable: true, value: 100 }, naturalHeight: { configurable: true, value: 100 } })
  vi.spyOn(image, 'getBoundingClientRect').mockReturnValue(DOMRect.fromRect({ width: 100, height: 100 }))
  fireEvent.load(image)
  await userEvent.click(screen.getByText('Edit selection'))
  await userEvent.click(screen.getByText('Advanced'))
  return { view, client }
}

async function refreshRender() {
  const recovery = screen.getByText('Recovery and reload').closest('details')!
  if (!recovery.open) await userEvent.click(screen.getByText('Recovery and reload'))
  await userEvent.click(screen.getByRole('button', { name: 'Refresh render status' }))
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
  await userEvent.click(screen.getByRole('button', { name: 'Preview changes' }))
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
  fireEvent.change(screen.getByLabelText('Part label'), { target: { value: 'Adjusted' } })
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
  await userEvent.click(screen.getByRole('button', { name: 'Preview changes' }))
  expect(await screen.findByText(/Render queued/)).toBeInTheDocument()
  const draft = client.render.mock.calls[0][0] as LocalDraft
  expect(draft.schemaVersion).toBe(2)
  expect(draft.regions[0].motion.type).toBe(type)
  expect(type === 'scale' ? draft.regions[0].motion.scale : draft.regions[0].motion.scaleX).toBe('1.1')
  if (type === 'stretch') expect(draft.regions[0].motion.scaleY).toBe('0.9')
  expect(draft.regions[0].selection).toEqual(saved.regions[0].selection)
})

it('prepares and plays the matching result from one Preview changes action', async () => {
  const client = api()
  client.render.mockResolvedValue(renderJob)
  const status = vi.fn().mockResolvedValue({ ...renderJob, status: 'completed', artifact: renderArtifact })
  const video = vi.fn().mockResolvedValue(new Blob(['webm'], { type: 'video/webm' }))
  await editor({ ...client, job: status, video })
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })))
  await userEvent.click(screen.getByRole('button', { name: 'Preview changes' }))
  expect(await screen.findByText(/Render queued/)).toBeInTheDocument()
  await refreshRender()
  await waitFor(() => expect(screen.getByRole('button', { name: 'Play' })).toBeEnabled())
  expect(video).toHaveBeenCalledTimes(1)
  expect(video.mock.calls[0][0]).toEqual(renderArtifact)
  expect(screen.getByRole('button', { name: 'Continue editing' })).toBeInTheDocument()
})

it('cancels rendering and ignores a stale status response while retaining draft edits', async () => {
  const client = api()
  client.render.mockResolvedValue(renderJob)
  let complete!: (job: LocalRenderJob) => void
  const status = vi.fn().mockReturnValue(new Promise<LocalRenderJob>(resolve => { complete = resolve }))
  const cancel = vi.fn().mockResolvedValue({ ...renderJob, status: 'cancelled' })
  await editor({ ...client, job: status, cancel })
  await userEvent.click(screen.getByRole('button', { name: 'Preview changes' }))
  await screen.findByText(/Render queued/)
  await refreshRender()
  await userEvent.click(screen.getByRole('button', { name: 'Cancel preview' }))
  expect(await screen.findByText('Render cancelled. Draft and selections are kept.')).toBeInTheDocument()
  await act(async () => complete({ ...renderJob, status: 'completed', artifact: renderArtifact }))
  expect(screen.queryByRole('button', { name: 'Play' })).not.toBeInTheDocument()
  expect(screen.getByLabelText('Selection X')).toHaveValue('0.25')
})


it('starts with one dominant edit canvas and keeps raw controls behind Advanced', async () => {
  const client = api()
  render(<PageEditor project={project} originalUrl="blob:original" client={client} />)
  await screen.findByLabelText('Part label')
  expect(screen.getByRole('button', { name: 'Edit' })).toHaveAttribute('aria-pressed', 'true')
  expect(screen.getByLabelText('Frames per second')).not.toBeVisible()
  expect(screen.getByRole('button', { name: 'Preview changes' })).toBeEnabled()
  expect(screen.getAllByRole('img')).toHaveLength(1)
  await userEvent.click(screen.getByRole('button', { name: 'Original' }))
  expect(screen.queryByLabelText('Working image selection surface')).not.toBeInTheDocument()
  expect(screen.getAllByRole('img')).toHaveLength(1)
  expect(screen.getByRole('img')).toHaveAttribute('src', 'blob:original')
  await userEvent.click(screen.getByRole('button', { name: 'Preview' }))
  expect(screen.getByText(/Preview changes to see/)).toBeInTheDocument()
  expect(client.render).not.toHaveBeenCalled()
})

it('undoes a whole rectangle gesture and retains the newest server revision after saving', async () => {
  const { client } = await editor()
  const surface = screen.getByLabelText('Working image selection surface')
  vi.spyOn(surface, 'getBoundingClientRect').mockReturnValue(DOMRect.fromRect({ width: 100, height: 100 }))
  fireEvent.pointerDown(surface, { clientX: 10, clientY: 20, button: 0 })
  fireEvent.pointerMove(surface, { clientX: 40, clientY: 60 })
  fireEvent.pointerUp(surface, { clientX: 40, clientY: 60 })
  await userEvent.click(screen.getByRole('button', { name: 'Save draft' }))
  await screen.findByText('Draft saved.')
  await userEvent.click(screen.getByRole('button', { name: 'Undo' }))
  expect(screen.getByLabelText('Selection X')).toHaveValue('0.25')
  expect(screen.getByRole('button', { name: 'Undo' })).toBeDisabled()
  await userEvent.click(screen.getByRole('button', { name: 'Save draft' }))
  await screen.findByText('Draft saved.')
  expect((client.saveDraft.mock.calls[1][0] as LocalDraft).revision).toBe(1)
  await userEvent.click(screen.getByRole('button', { name: 'Redo' }))
  expect(screen.getByLabelText('Selection X')).toHaveValue('0.1')
})

it('preserves the last valid preview on render failure and marks it stale after edits', async () => {
  const client = api()
  client.latest.mockResolvedValue({ ...renderArtifact, draftRevision: 0 })
  await editor(client)
  await userEvent.clear(screen.getByLabelText('Part label'))
  await userEvent.type(screen.getByLabelText('Part label'), 'Changed')
  await userEvent.click(screen.getByRole('button', { name: 'Preview changes' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Horizontal movement must be finite')
  expect(screen.getByText(/Preview is out of date/)).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'Preview' }))
  expect(screen.getByRole('button', { name: 'Play' })).toBeInTheDocument()
  expect(screen.getByText('Advanced').closest('details')).toHaveAttribute('open')
})

it('centers a preset on the real brush mask rather than its tiny seed and keeps strokes intact', async () => {
  const client = api()
  const region = newRegion('first')
  region.selection = { x: '0.001', y: '0.001', width: '0.001', height: '0.001', strokes: [{ mode: 'add', radius: '0.1', points: [{ x: .7, y: .8 }] }] }
  client.draft.mockResolvedValue({ ...saved, regions: [region] })
  await editor(client)
  await userEvent.click(screen.getByRole('button', { name: 'Rotate / sway' }))
  expect(screen.getByLabelText('Pivot X')).toHaveValue('0.7')
  expect(screen.getByLabelText('Pivot Y')).toHaveValue('0.8')
  await userEvent.click(screen.getByRole('button', { name: 'Save draft' }))
  await screen.findByText('Draft saved.')
  const next = client.saveDraft.mock.calls[0][0] as LocalDraft
  expect(next.schemaVersion).toBe(1)
  expect(next.regions[0].selection).toEqual(region.selection)
  expect(next.regions[0].motion.period).toBe('1.2')
  await userEvent.click(screen.getByRole('button', { name: 'Undo' }))
  expect(screen.getByLabelText('Movement')).toHaveValue('static')
})

it('resets history across owner changes and ignores an old owner save response', async () => {
  const client = api()
  let complete!: (draft: LocalDraft) => void
  client.saveDraft.mockReturnValue(new Promise<LocalDraft>(resolve => { complete = resolve }))
  const { view } = await editor(client)
  await userEvent.clear(screen.getByLabelText('Part label'))
  await userEvent.type(screen.getByLabelText('Part label'), 'Old owner edits')
  await userEvent.click(screen.getByRole('button', { name: 'Save draft' }))
  view.rerender(<PageEditor project={project} originalUrl="blob:original" client={client} ownerId="new-owner" />)
  await screen.findByLabelText('Part label')
  expect(screen.getByLabelText('Part label')).toHaveValue('New part')
  expect(screen.getByRole('button', { name: 'Undo' })).toBeDisabled()
  await act(async () => complete({ ...saved, revision: 9 }))
  expect(screen.getByLabelText('Part label')).toHaveValue('New part')
  expect(screen.getByText('Saved revision 0')).toBeInTheDocument()
})

it('resets content history after explicitly reloading a different source version', async () => {
  const { client } = await editor()
  await userEvent.clear(screen.getByLabelText('Part label'))
  await userEvent.type(screen.getByLabelText('Part label'), 'Changed')
  client.draft.mockResolvedValue({ ...saved, sourceVersion: 'different-source', revision: 4 })
  await userEvent.click(screen.getByText('Recovery and reload'))
  await userEvent.click(screen.getByRole('button', { name: 'Discard local edits & reload' }))
  await screen.findByText('Saved revision 4')
  expect(screen.getByLabelText('Part label')).toHaveValue('New part')
  expect(screen.getByRole('button', { name: 'Undo' })).toBeDisabled()
})

it('requires deliberate mask replacement before changing rectangle coordinates of a refined mask', async () => {
  const client = api()
  const region = newRegion('first')
  region.maskId = 'assisted-mask'
  const mask = vi.fn().mockResolvedValue(new Blob(['mask'], { type: 'image/png' }))
  client.draft.mockResolvedValue({ ...saved, regions: [region] })
  await editor({ ...client, mask })
  expect(screen.getByLabelText('Selection X')).toBeDisabled()
  await userEvent.click(screen.getByRole('button', { name: 'Replace mask with rectangle' }))
  expect(screen.getByLabelText('Selection X')).toBeEnabled()
  await userEvent.click(screen.getByRole('button', { name: 'Save draft' }))
  await screen.findByText('Draft saved.')
  expect((client.saveDraft.mock.calls[0][0] as LocalDraft).regions[0].maskId).toBeUndefined()
})

it('opens the hidden inspector and maps renderer field names without changing incomplete raw values', async () => {
  const client = api()
  const region = newRegion('first')
  region.motion = { ...region.motion, type: 'translate', dx: '-' }
  client.draft.mockResolvedValue({ ...saved, regions: [region] })
  client.render.mockRejectedValue(new Error('dx requires a finite decimal number'))
  render(<PageEditor project={project} originalUrl="blob:original" client={client} />)
  await screen.findByLabelText('Part label')
  await userEvent.click(screen.getByRole('button', { name: 'Preview changes' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Horizontal movement requires a finite decimal number')
  expect(screen.getByLabelText('Horizontal movement')).toBeVisible()
  expect(screen.getByLabelText('Horizontal movement')).toHaveValue('-')
  expect(client.render).toHaveBeenCalledTimes(1)
})

it('offers a bounded speed slider with keyboard steps and meaningful timing labels', async () => {
  await editor()
  await userEvent.click(screen.getByRole('button', { name: 'Rotate / sway' }))
  const slider = screen.getByRole('slider', { name: 'Speed' })
  expect(slider).toHaveAttribute('min', '1')
  expect(slider).toHaveAttribute('max', '3')
  expect(slider).toHaveAttribute('step', '1')
  expect(slider).toHaveAttribute('aria-valuetext', 'Medium')
  fireEvent.keyDown(slider, { key: 'ArrowRight' })
  expect(slider).toHaveAttribute('aria-valuetext', 'Fast')
  expect(screen.getByLabelText('Gesture period (optional)')).toHaveValue('0.6')
  fireEvent.keyDown(slider, { key: 'ArrowLeft' })
  expect(slider).toHaveAttribute('aria-valuetext', 'Medium')
})

it.each(['Move', 'Rotate / sway', 'Pulse / scale'])('repeats %s per part and preserves intensity and repeat intent while tuning speed', async label => {
  const { client } = await editor()
  expect(screen.queryByRole('checkbox', { name: 'Repeat movement' })).not.toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: label }))
  const repeat = screen.getByRole('checkbox', { name: 'Repeat movement' })
  expect(repeat).not.toBeChecked()
  expect(repeat).toHaveAccessibleDescription(/this clip.*not.*clip/i)
  await userEvent.click(repeat)
  expect(repeat).toBeChecked()
  fireEvent.change(screen.getByLabelText('Intensity'), { target: { value: '73' } })
  fireEvent.change(screen.getByLabelText('Speed'), { target: { value: '3' } })
  expect(screen.getByLabelText('Intensity')).toHaveValue('73')
  await userEvent.click(screen.getByRole('button', { name: 'Save draft' }))
  await screen.findByText('Draft saved.')
  const fast = client.saveDraft.mock.calls.at(-1)![0] as LocalDraft
  expect(fast.regions[0].motion).toMatchObject({ repeat: true, duration: '0.6', period: '0.6', cycles: '10' })
  fireEvent.change(screen.getByLabelText('Speed'), { target: { value: '1' } })
  expect(repeat).toBeChecked()
  expect(screen.getByLabelText('Movement duration')).toHaveValue('2')
  await userEvent.selectOptions(screen.getByLabelText('Selected part'), 'second')
  await userEvent.click(screen.getByRole('button', { name: label }))
  expect(screen.getByRole('checkbox', { name: 'Repeat movement' })).not.toBeChecked()
  await userEvent.selectOptions(screen.getByLabelText('Selected part'), 'first')
  expect(screen.getByRole('checkbox', { name: 'Repeat movement' })).toBeChecked()
  await userEvent.click(screen.getByRole('checkbox', { name: 'Repeat movement' }))
  await userEvent.click(screen.getByRole('button', { name: 'Undo' }))
  expect(screen.getByRole('checkbox', { name: 'Repeat movement' })).toBeChecked()
  await userEvent.click(screen.getByRole('button', { name: 'Redo' }))
  expect(screen.getByRole('checkbox', { name: 'Repeat movement' })).not.toBeChecked()
})

it('keeps exact custom movement values on repeat and speed changes and restores saved repeat intent', async () => {
  const client = api()
  const region = newRegion('first')
  region.motion = { ...region.motion, type: 'translate', dx: '-0.013579', dy: '0.024681', anchorX: '0.23456789', start: '0.2', duration: '1.2' }
  client.draft.mockResolvedValue({ ...saved, regions: [region] })
  const { view } = await editor(client)
  await userEvent.click(screen.getByRole('checkbox', { name: 'Repeat movement' }))
  fireEvent.change(screen.getByLabelText('Speed'), { target: { value: '3' } })
  await userEvent.click(screen.getByRole('button', { name: 'Save draft' }))
  await screen.findByText('Draft saved.')
  const next = client.saveDraft.mock.calls.at(-1)![0] as LocalDraft
  expect(next.regions[0].motion).toMatchObject({ repeat: true, dx: region.motion.dx, dy: region.motion.dy, anchorX: region.motion.anchorX, start: '0.2', cycles: '9' })
  expect(next.regions[0].selection).toEqual(region.selection)
  view.unmount()
  client.draft.mockResolvedValue(next)
  await editor(client)
  expect(screen.getByRole('checkbox', { name: 'Repeat movement' })).toBeChecked()
})

it('shows legacy custom repetitions honestly without rewriting them on load and refuses nonfitting repeat timing', async () => {
  const client = api()
  const region = newRegion('first')
  region.motion = { ...region.motion, type: 'rotate', cycles: '4', period: '1.2' }
  client.draft.mockResolvedValue({ ...saved, regions: [region] })
  await editor(client)
  expect(screen.getByRole('checkbox', { name: 'Repeat movement' })).toBeChecked()
  expect(screen.getByText(/Custom repetitions: 4/)).toBeInTheDocument()
  expect(client.saveDraft).not.toHaveBeenCalled()
  expect(screen.getByRole('button', { name: 'Save draft' })).toBeDisabled()
  await userEvent.click(screen.getByRole('checkbox', { name: 'Repeat movement' }))
  fireEvent.change(screen.getByLabelText('Movement start'), { target: { value: '5.5' } })
  await userEvent.click(screen.getByRole('checkbox', { name: 'Repeat movement' }))
  expect(await screen.findByRole('alert')).toHaveTextContent(/Advanced/)
  expect(screen.getByRole('checkbox', { name: 'Repeat movement' })).not.toBeChecked()
  expect(screen.getByLabelText('Movement start')).toHaveValue('5.5')
})

it('keeps repeat intent checked for a short scene, after browser recovery and through Keep static and preset changes', async () => {
  const client = api()
  client.draft.mockResolvedValue({ ...saved, duration: '0.2' })
  const { view } = await editor(client)
  await userEvent.click(screen.getByRole('button', { name: 'Move' }))
  await userEvent.click(screen.getByRole('checkbox', { name: 'Repeat movement' }))
  expect(screen.getByRole('checkbox', { name: 'Repeat movement' })).toBeChecked()
  expect(screen.getByLabelText('Movement duration')).toHaveValue('0.2')
  expect(screen.getByLabelText('Finite repetitions')).toHaveValue('1')
  view.unmount()
  await editor(client)
  expect(screen.getByRole('checkbox', { name: 'Repeat movement' })).toBeChecked()
  expect(screen.getByText(/Recovered unsaved draft/)).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'Keep static' }))
  expect(screen.queryByRole('checkbox', { name: 'Repeat movement' })).not.toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'Pulse / scale' }))
  expect(screen.getByRole('checkbox', { name: 'Repeat movement' })).toBeChecked()
  expect(screen.getByLabelText('Finite repetitions')).toHaveValue('1')
  await userEvent.click(screen.getByRole('button', { name: 'Rotate / sway' }))
  expect(screen.getByRole('checkbox', { name: 'Repeat movement' })).toBeChecked()
  await userEvent.click(screen.getByRole('button', { name: 'Save draft' }))
  await screen.findByText('Draft saved.')
  expect((client.saveDraft.mock.calls.at(-1)![0] as LocalDraft).regions[0].motion).toMatchObject({ repeat: true, cycles: '1', period: '0.2' })
})

it('does not offer a clean save that would falsely stale an unchanged completed preview', async () => {
  const client = api()
  client.render.mockResolvedValue({ ...renderJob, status: 'completed', artifact: renderArtifact })
  await editor(client)
  await userEvent.click(screen.getByRole('button', { name: 'Preview changes' }))
  await screen.findByText('Ready. Compare Before and After, or continue editing.')
  expect(screen.getByRole('button', { name: 'Save draft' })).toBeDisabled()
  expect(screen.queryByText(/Preview is out of date/)).not.toBeInTheDocument()
  expect(client.saveDraft).toHaveBeenCalledTimes(1)
})

it('keeps page controls concise without repeating the page filename and retains the compact part selector', async () => {
  await editor()
  expect(screen.queryByText(project.name)).not.toBeInTheDocument()
  expect(screen.queryByText('Motion workspace')).not.toBeInTheDocument()
  expect(screen.getByRole('heading', { name: 'Page controls' })).toBeInTheDocument()
  await userEvent.selectOptions(screen.getByLabelText('Selected part'), 'second')
  await userEvent.clear(screen.getByLabelText('Part label'))
  await userEvent.type(screen.getByLabelText('Part label'), 'Selected through compact selector')
  await userEvent.click(screen.getByRole('button', { name: 'Save draft' }))
  await screen.findByText('Draft saved.')
  expect(screen.getByLabelText('Selected part')).toHaveValue('second')
})


it('pins the previous successful render as Before and keeps the pair while editing again', async () => {
  const client = api()
  const before = { ...renderArtifact, id: '951c79c7-2a9c-421f-a009-7634ae0d813c', draftRevision: 0 }
  client.latest.mockResolvedValue(before)
  client.render.mockResolvedValue({ ...renderJob, status: 'completed', artifact: renderArtifact })
  const video = vi.fn().mockResolvedValue(new Blob(['webm'], { type: 'video/webm' }))
  await editor({ ...client, video })
  fireEvent.change(screen.getByLabelText('Part label'), { target: { value: 'New settings' } })
  await userEvent.click(screen.getByRole('button', { name: 'Preview changes' }))
  await screen.findByText('Ready. Compare Before and After, or continue editing.')
  await userEvent.click(screen.getByRole('button', { name: 'Before' }))
  expect(screen.getByText('Before · previous successful preview')).toBeInTheDocument()
  expect(video.mock.calls.at(-1)?.[0]).toEqual(before)
  await userEvent.click(screen.getByRole('button', { name: 'After' }))
  expect(screen.getByText('After · current changes')).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'Continue editing' }))
  expect(screen.getByLabelText('Working image selection surface')).toBeInTheDocument()
  expect(screen.getByLabelText('Part label')).toHaveValue('New settings')
  expect(client.render).toHaveBeenCalledTimes(1)
})

it.each(['edit', 'view', 'cancel'] as const)('invalidates preview intent during save on %s', async action => {
  const client = api()
  let finishSave!: (draft: LocalDraft) => void
  client.saveDraft.mockReturnValue(new Promise<LocalDraft>(resolve => { finishSave = resolve }))
  const { view } = await editor(client)
  await userEvent.click(screen.getByRole('button', { name: 'Preview changes' }))
  if (action === 'edit') {
    const surface = screen.getByLabelText('Working image selection surface')
    vi.spyOn(surface, 'getBoundingClientRect').mockReturnValue(DOMRect.fromRect({ width: 100, height: 100 }))
    fireEvent.pointerDown(surface, { clientX: 10, clientY: 10, button: 0 })
    fireEvent.pointerUp(surface, { clientX: 30, clientY: 30 })
  } else if (action === 'view') await userEvent.click(screen.getByRole('button', { name: 'Original' }))
  else await userEvent.click(screen.getByRole('button', { name: 'Cancel preview' }))
  await act(async () => finishSave({ ...saved, revision: 1 }))
  expect(client.render).not.toHaveBeenCalled()
  view.unmount()
})

it.each(['revision', 'source', 'edit'] as const)('never promotes a completed result with mismatched %s', async mismatch => {
  const client = api()
  client.render.mockResolvedValue(renderJob)
  const result = { ...renderArtifact, ...(mismatch === 'revision' ? { draftRevision: 99 } : mismatch === 'source' ? { sourceVersion: 'wrong-source' } : {}) }
  const job = vi.fn().mockResolvedValue({ ...renderJob, status: 'completed', artifact: result })
  const video = vi.fn()
  await editor({ ...client, job, video })
  await userEvent.click(screen.getByRole('button', { name: 'Preview changes' }))
  await screen.findByText(/Render queued/)
  if (mismatch === 'edit') fireEvent.change(screen.getByLabelText('Part label'), { target: { value: 'Newer edit' } })
  await refreshRender()
  expect(await screen.findByText(/Outdated result/)).toBeInTheDocument()
  expect(video).not.toHaveBeenCalled()
  expect(screen.queryByText('After · current changes')).not.toBeInTheDocument()
})


it('labels the original fallback as Before only when there is no previous successful output', async () => {
  const client = api()
  client.render.mockResolvedValue({ ...renderJob, status: 'completed', artifact: renderArtifact })
  await editor(client)
  await userEvent.click(screen.getByRole('button', { name: 'Preview changes' }))
  await screen.findByText('After · current changes')
  await userEvent.click(screen.getByRole('button', { name: 'Before' }))
  expect(screen.getByText('Before · original (no previous preview)')).toBeInTheDocument()
  expect(screen.getByRole('img')).toHaveAttribute('src', 'blob:original')
  expect(screen.queryByRole('button', { name: 'Play' })).not.toBeInTheDocument()
})

it.each(['unmount', 'reduced motion'] as const)('invalidates pre-save preview intent on %s', async action => {
  const client = api()
  let finishSave!: (draft: LocalDraft) => void
  let changed!: (event: MediaQueryListEvent) => void
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: false, addEventListener: (_: string, listener: typeof changed) => { changed = listener }, removeEventListener: vi.fn() })))
  client.saveDraft.mockReturnValue(new Promise<LocalDraft>(resolve => { finishSave = resolve }))
  const { view } = await editor(client)
  await userEvent.click(screen.getByRole('button', { name: 'Preview changes' }))
  if (action === 'unmount') view.unmount()
  else act(() => changed({ matches: true } as MediaQueryListEvent))
  await act(async () => finishSave({ ...saved, revision: 1 }))
  expect(client.render).not.toHaveBeenCalled()
})

it.each(['Edit', 'Before'] as const)('keeps a fresh result available without overriding a newer %s view intent', async destination => {
  const client = api()
  const prior = { ...renderArtifact, id: '951c79c7-2a9c-421f-a009-7634ae0d813c', draftRevision: 0 }
  client.latest.mockResolvedValue(prior)
  client.render.mockResolvedValue(renderJob)
  const job = vi.fn().mockResolvedValue({ ...renderJob, status: 'completed', artifact: renderArtifact })
  const video = vi.fn().mockResolvedValue(new Blob(['clip'], { type: 'video/webm' }))
  await editor({ ...client, job, video })
  await userEvent.click(screen.getByRole('button', { name: 'Preview changes' }))
  await screen.findByText(/Render queued/)
  if (destination === 'Before') {
    await userEvent.click(screen.getByRole('button', { name: 'Preview' }))
    await userEvent.click(screen.getByRole('button', { name: 'Before' }))
  } else await userEvent.click(screen.getByRole('button', { name: 'Edit' }))
  await refreshRender()
  expect(await screen.findByText(/New preview is ready/)).toBeInTheDocument()
  if (destination === 'Edit') expect(video).not.toHaveBeenCalled()
  else expect(video.mock.calls.at(-1)?.[0]).toEqual(prior)
  if (destination === 'Edit') expect(screen.getByLabelText('Working image selection surface')).toBeInTheDocument()
  else expect(screen.getByText('Before · previous successful preview')).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'Preview' }))
  await userEvent.click(screen.getByRole('button', { name: 'After' }))
  expect(video.mock.calls.at(-1)?.[0]).toEqual(renderArtifact)
  expect(client.render).toHaveBeenCalledTimes(1)
})

it('cancels a queued render whose submission response arrives after Cancel preview', async () => {
  const client = api()
  let submit!: (job: LocalRenderJob) => void
  client.render.mockReturnValue(new Promise<LocalRenderJob>(resolve => { submit = resolve }))
  const cancel = vi.fn().mockResolvedValue({ ...renderJob, status: 'cancelled' })
  await editor({ ...client, cancel })
  await userEvent.click(screen.getByRole('button', { name: 'Preview changes' }))
  await screen.findByRole('button', { name: 'Cancel preview' })
  await userEvent.click(screen.getByRole('button', { name: 'Cancel preview' }))
  await act(async () => submit(renderJob))
  expect(cancel).toHaveBeenCalledWith(project.id, renderJob.id)
  expect(screen.queryByRole('button', { name: 'Refresh render status' })).not.toBeInTheDocument()
})


it('keeps the main edit path open and contextual without rendering each adjustment', async () => {
  const client = api()
  render(<PageEditor project={project} originalUrl="blob:original" client={client} />)
  const label = await screen.findByLabelText('Part label')
  expect(label).not.toBeVisible()
  expect(screen.getByRole('button', { name: 'Keep static' })).toBeVisible()
  expect(screen.getByText('Advanced').closest('details')).not.toHaveAttribute('open')
  expect(screen.queryByRole('option', { name: 'Place pivot' })).not.toBeInTheDocument()
  await userEvent.click(screen.getByText('Edit selection'))
  fireEvent.change(label, { target: { value: 'Face' } })
  expect(screen.getAllByText('Selected part: Face')).toHaveLength(1)
  expect(screen.queryByText('Selected: Face')).not.toBeInTheDocument()
  expect(screen.getByText('Editing · unsaved changes.')).toBeInTheDocument()
  expect(client.render).not.toHaveBeenCalled()
  await userEvent.click(screen.getByRole('button', { name: 'Original' }))
  expect(screen.getByText('Part inspector').closest('details')).not.toBeVisible()
  expect(client.render).not.toHaveBeenCalled()
})

it('never transfers an older After playback request onto a quietly completed new artifact', async () => {
  const client = api()
  const prior = { ...renderArtifact, id: '951c79c7-2a9c-421f-a009-7634ae0d813c', draftRevision: 0 }
  client.latest.mockResolvedValue(prior)
  client.render.mockResolvedValue(renderJob)
  const job = vi.fn().mockResolvedValue({ ...renderJob, status: 'completed', artifact: renderArtifact })
  const video = vi.fn().mockResolvedValue(new Blob(['clip'], { type: 'video/webm' }))
  await editor({ ...client, job, video })
  await userEvent.click(screen.getByRole('button', { name: 'Preview changes' }))
  await screen.findByText(/Render queued/)
  await userEvent.click(screen.getByRole('button', { name: 'Preview' }))
  await userEvent.click(screen.getByRole('button', { name: 'After' }))
  expect(video.mock.calls.at(-1)?.[0]).toEqual(prior)
  await refreshRender()
  await screen.findByText(/New preview is ready/)
  expect(video.mock.calls.every(call => (call[0] as LocalRenderArtifact).id === prior.id)).toBe(true)
  await userEvent.click(screen.getByRole('button', { name: 'After' }))
  expect(video.mock.calls.at(-1)?.[0]).toEqual(renderArtifact)
})


it('puts motion first and reveals selection editing only when requested or adding a new part', async () => {
  const client = api()
  render(<PageEditor project={project} originalUrl="blob:original" client={client} />)
  await screen.findByLabelText('Part label')
  const selection = screen.getByText('Edit selection').closest('details')!
  const motion = screen.getByRole('group', { name: 'Motion' })
  expect(selection).not.toHaveAttribute('open')
  expect(screen.getByLabelText('Selection tool')).not.toBeVisible()
  expect(motion.compareDocumentPosition(selection) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  await userEvent.click(screen.getByRole('button', { name: 'Add part' }))
  expect(selection).toHaveAttribute('open')
  expect(screen.getByLabelText('Part label')).toBeVisible()
  await userEvent.selectOptions(screen.getByLabelText('Selected part'), 'first')
  expect(selection).not.toHaveAttribute('open')
  expect(client.render).not.toHaveBeenCalled()
})

it('frames original fallback and rendered output using the same normalized working-image ratio', async () => {
  const client = api()
  client.render.mockResolvedValue({ ...renderJob, status: 'completed', artifact: { ...renderArtifact, width: 100, height: 102 } })
  await editor(client)
  await userEvent.click(screen.getByRole('button', { name: 'Preview changes' }))
  await screen.findByText('After · current changes')
  const after = screen.getByLabelText(`Animated page: ${project.name}`).closest('.local-playback__media')
  expect(after).toHaveStyle({ aspectRatio: '1' })
  await userEvent.click(screen.getByRole('button', { name: 'Before' }))
  const before = screen.getByRole('img').closest('.local-playback__media')
  expect(before).toHaveStyle({ aspectRatio: '1' })
  expect(before?.nextElementSibling).toHaveClass('local-playback__feedback')
})


it('learns normalized framing even when the selection image is never shown or decoded by the user', async () => {
  class WorkingImage {
    naturalWidth = 100
    naturalHeight = 200
    onload: (() => void) | null = null
    set src(url: string) { if (url) queueMicrotask(() => this.onload?.()) }
  }
  vi.stubGlobal('Image', WorkingImage)
  render(<PageEditor project={project} originalUrl="blob:original" client={api()} />)
  await screen.findByLabelText('Part label')
  await userEvent.click(screen.getByRole('button', { name: 'Preview' }))
  const frame = screen.getByRole('img').closest('.local-playback__media')
  expect(frame).toHaveStyle({ aspectRatio: '0.5' })
})

function downloadClient() {
  const client = api()
  client.latest.mockResolvedValue({ ...renderArtifact, draftRevision: 0 })
  return client
}

async function previewForDownload(client = downloadClient()) {
  const result = await editor(client)
  await userEvent.click(screen.getByRole('button', { name: 'Preview' }))
  return result
}

function nativeDownloads() {
  const downloads: { filename: string; href: string; connected: boolean }[] = []
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
    downloads.push({ filename: this.download, href: this.href, connected: this.isConnected })
  })
  return downloads
}

it('downloads exact current After bytes without rendering, saving or autoplay, including reduced motion', async () => {
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() })))
  const client = downloadClient(), downloads = nativeDownloads()
  const bytes = new Blob([new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 17, 23])], { type: 'video/webm' })
  client.video.mockResolvedValue(bytes)
  vi.mocked(URL.createObjectURL).mockImplementation(blob => blob === bytes ? 'blob:download' : 'blob:working')
  const { view } = await previewForDownload(client)
  const button = screen.getByRole('button', { name: 'Download animation' })
  expect(button).not.toHaveClass('page-editor__primary')
  await userEvent.click(button)
  expect(await screen.findByText('Download requested. Check your browser downloads.')).toBeInTheDocument()
  expect(client.video).toHaveBeenCalledExactlyOnceWith({ ...renderArtifact, draftRevision: 0 }, expect.any(AbortSignal))
  expect(URL.createObjectURL).toHaveBeenCalledWith(bytes)
  expect(downloads).toEqual([{ filename: 'page-animation.webm', href: 'blob:download', connected: true }])
  expect(URL.revokeObjectURL).not.toHaveBeenCalledWith('blob:download')
  expect(client.render).not.toHaveBeenCalled()
  expect(client.saveDraft).not.toHaveBeenCalled()
  expect(HTMLMediaElement.prototype.play).not.toHaveBeenCalled()
  expect(document.querySelector('a[download]')).not.toBeInTheDocument()
  view.unmount()
  expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:download')
})

it('never downloads Before and downloads only current After after switching back', async () => {
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() })))
  const client = downloadClient(), downloads = nativeDownloads()
  client.render.mockResolvedValue({ ...renderJob, status: 'completed', artifact: renderArtifact })
  await editor(client)
  await userEvent.click(screen.getByRole('button', { name: 'Preview changes' }))
  await screen.findByText('Ready. Compare Before and After, or continue editing.')
  await userEvent.click(screen.getByRole('button', { name: 'Before' }))
  const button = screen.getByRole('button', { name: 'Download animation' })
  expect(button).toBeDisabled()
  expect(button).toHaveAccessibleDescription('Switch to After to download the current animation.')
  await userEvent.click(button)
  expect(client.video).not.toHaveBeenCalled()
  await userEvent.click(screen.getByRole('button', { name: 'After' }))
  await userEvent.click(button)
  await screen.findByText('Download requested. Check your browser downloads.')
  expect(client.video).toHaveBeenCalledExactlyOnceWith(renderArtifact, expect.any(AbortSignal))
  expect(downloads).toHaveLength(1)
})

it.each([
  { draftRevision: 9 }, { sourceVersion: 'old-source' }, { projectId: 'other-project' },
  { videoMime: 'video/mp4' }, { duration: 0 }, { duration: 7 },
])('disables downloading an invalid or outdated artifact %j', async invalid => {
  const client = downloadClient()
  client.latest.mockResolvedValue({ ...renderArtifact, draftRevision: 0, ...invalid })
  await previewForDownload(client)
  expect(screen.getByRole('button', { name: 'Download animation' })).toBeDisabled()
  expect(client.video).not.toHaveBeenCalled()
})

it('requires Preview changes after editing and while preparing or failing a new render', async () => {
  const client = downloadClient()
  await previewForDownload(client)
  fireEvent.change(screen.getByLabelText('Part label'), { target: { value: 'Kept edits' } })
  expect(screen.getByRole('button', { name: 'Download animation' })).toBeDisabled()
  expect(screen.getByRole('button', { name: 'Download animation' })).toHaveAccessibleDescription(/Preview changes/)
  let fail!: (error: Error) => void
  client.render.mockReturnValue(new Promise((_resolve, reject) => { fail = reject }))
  await userEvent.click(screen.getByRole('button', { name: 'Preview changes' }))
  await waitFor(() => expect(client.render).toHaveBeenCalledTimes(1))
  expect(screen.getByRole('button', { name: 'Download animation' })).toBeDisabled()
  await act(async () => fail(new Error('Render unavailable')))
  expect(await screen.findByRole('alert')).toHaveTextContent('Render unavailable')
  await userEvent.click(screen.getByRole('button', { name: 'Preview' }))
  expect(screen.getByRole('button', { name: 'Download animation' })).toBeDisabled()
  expect(screen.getByLabelText('Part label')).toHaveValue('Kept edits')
})

it('keeps failed downloads retryable and permits only one pending request', async () => {
  const client = downloadClient(), downloads = nativeDownloads()
  let fail!: (error: Error) => void
  client.video.mockReturnValueOnce(new Promise((_resolve, reject) => { fail = reject }))
  await previewForDownload(client)
  const button = screen.getByRole('button', { name: 'Download animation' })
  fireEvent.click(button)
  fireEvent.click(button)
  expect(client.video).toHaveBeenCalledTimes(1)
  expect(screen.getByRole('button', { name: 'Preparing download…' })).toBeDisabled()
  await act(async () => fail(new Error('Network unavailable.')))
  expect(await screen.findByRole('alert')).toHaveTextContent(/Download failed: Network unavailable.*draft and preview are kept.*Retry Download animation/)
  expect(screen.getByLabelText('Part label')).toHaveValue('New part')
  await userEvent.click(screen.getByRole('button', { name: 'Download animation' }))
  await screen.findByText('Download requested. Check your browser downloads.')
  expect(downloads).toHaveLength(1)
  expect(client.video).toHaveBeenCalledTimes(2)
  expect(client.render).not.toHaveBeenCalled()
})

it.each(['edit', 'mode', 'unmount', 'owner', 'project', 'source', 'reload', 'render'] as const)('ignores a pending download after %s even when the client ignores abort', async boundary => {
  const client = downloadClient(), downloads = nativeDownloads()
  let complete!: (blob: Blob) => void
  client.video.mockReturnValue(new Promise<Blob>(resolve => { complete = resolve }))
  const { view } = await previewForDownload(client)
  await userEvent.click(screen.getByRole('button', { name: 'Download animation' }))
  const signal = client.video.mock.calls[0][1] as AbortSignal
  if (boundary === 'edit') fireEvent.change(screen.getByLabelText('Part label'), { target: { value: 'Newer edit' } })
  if (boundary === 'mode') await userEvent.click(screen.getByRole('button', { name: 'Original' }))
  if (boundary === 'unmount') view.unmount()
  if (boundary === 'owner') view.rerender(<PageEditor project={project} originalUrl="blob:original" client={client} ownerId="different-owner" />)
  if (boundary === 'project') view.rerender(<PageEditor project={{ ...project, id: 'other-project' }} originalUrl="blob:original" client={client} />)
  if (boundary === 'source') view.rerender(<PageEditor project={project} originalUrl="blob:new-source" client={client} />)
  if (boundary === 'reload') { await userEvent.click(screen.getByText('Recovery and reload')); await userEvent.click(screen.getByRole('button', { name: 'Retry loading editor' })) }
  if (boundary === 'render') { await userEvent.click(screen.getByRole('button', { name: 'Continue editing' })); await userEvent.click(screen.getByRole('button', { name: 'Preview changes' })) }
  expect(signal.aborted).toBe(true)
  await act(async () => complete(new Blob(['stale'], { type: 'video/webm' })))
  expect(downloads).toHaveLength(0)
  expect(screen.queryByText('Download requested. Check your browser downloads.')).not.toBeInTheDocument()
})

it.each([
  ['../../unsafe\\name:*?.png', 'unsafe-name-animation.webm'],
  ['\u0000\u202e...png', 'animation.webm'],
])('sanitizes the suggested download filename for %j', async (name, expected) => {
  const client = downloadClient(), downloads = nativeDownloads()
  render(<PageEditor project={{ ...project, name }} originalUrl="blob:original" client={client} />)
  await screen.findByLabelText('Part label')
  await userEvent.click(screen.getByRole('button', { name: 'Preview' }))
  await userEvent.click(screen.getByRole('button', { name: 'Download animation' }))
  await screen.findByText('Download requested. Check your browser downloads.')
  expect(downloads[0].filename).toBe(expected)
})

it('retains only its latest download URL without revoking the working image URL', async () => {
  const client = downloadClient(), downloads = nativeDownloads()
  let sequence = 0
  vi.mocked(URL.createObjectURL).mockImplementation(blob => blob instanceof Blob && blob.type === 'video/webm' ? `blob:download-${++sequence}` : 'blob:working')
  const { view } = await previewForDownload(client)
  await userEvent.click(screen.getByRole('button', { name: 'Download animation' }))
  await screen.findByText('Download requested. Check your browser downloads.')
  expect(URL.revokeObjectURL).not.toHaveBeenCalledWith('blob:download-1')
  await userEvent.click(screen.getByRole('button', { name: 'Download animation' }))
  await waitFor(() => expect(downloads).toHaveLength(2))
  expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:download-1')
  expect(URL.revokeObjectURL).not.toHaveBeenCalledWith('blob:download-2')
  expect(URL.revokeObjectURL).not.toHaveBeenCalledWith('blob:working')
  view.unmount()
  expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:download-2')
})


it.each(['video/mp4', 'image/png', ''])('rejects non-WebM download bytes %j without renaming or changing the draft', async type => {
  const client = downloadClient(), downloads = nativeDownloads()
  client.video.mockResolvedValue(new Blob(['wrong-format'], { type }))
  await previewForDownload(client)
  await userEvent.click(screen.getByRole('button', { name: 'Download animation' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('The current WebM animation is unavailable.')
  expect(downloads).toHaveLength(0)
  expect(screen.getByRole('button', { name: 'Download animation' })).toBeEnabled()
  expect(client.render).not.toHaveBeenCalled()
})


it('separates draft persistence, canvas history and preview actions into labelled groups', async () => {
  const { client } = await editor(downloadClient())
  const draftActions = screen.getByRole('group', { name: 'Draft actions' })
  expect(within(draftActions).getByRole('button', { name: 'Save draft' })).toBeDisabled()
  expect(within(draftActions).getByRole('status', { name: 'Draft save status' })).toHaveTextContent('Saved revision 0')
  expect(within(draftActions).queryByRole('button', { name: 'Undo' })).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Download animation' })).not.toBeInTheDocument()
  const canvas = screen.getByRole('region', { name: 'Page canvas' })
  const history = within(canvas).getByRole('group', { name: 'Edit history' })
  expect(within(history).getByRole('button', { name: 'Undo' })).toBeDisabled()
  expect(within(history).getByRole('button', { name: 'Redo' })).toBeDisabled()
  const preview = within(canvas).getByRole('group', { name: 'Preview actions' })
  expect(within(preview).getByRole('button', { name: 'Preview changes' })).toHaveClass('page-editor__primary')
  expect(within(canvas).getByRole('group', { name: 'Canvas view' })).toBeInTheDocument()
  expect(screen.queryByRole('toolbar')).not.toBeInTheDocument()
  expect(client.render).not.toHaveBeenCalled()
})

it('keeps save status truthful and independent of preview processing and failure', async () => {
  const client = api()
  let submit!: (job: LocalRenderJob) => void
  client.render.mockReturnValue(new Promise<LocalRenderJob>(resolve => { submit = resolve }))
  await editor(client)
  const saveStatus = screen.getByRole('status', { name: 'Draft save status' })
  fireEvent.change(screen.getByLabelText('Part label'), { target: { value: 'Unsaved label' } })
  expect(saveStatus).toHaveTextContent('Unsaved changes.')
  expect(client.saveDraft).not.toHaveBeenCalled()
  await userEvent.click(screen.getByRole('button', { name: 'Preview changes' }))
  await waitFor(() => expect(client.render).toHaveBeenCalledTimes(1))
  expect(saveStatus).toHaveTextContent('Saved revision 1')
  expect(screen.getByRole('button', { name: 'Preparing preview…' })).toHaveAccessibleDescription(/Preparing preview|Draft saved/)
  await act(async () => submit({ ...renderJob, status: 'failed', error: { code: 'render_failed', message: 'Render unavailable.' } }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Render unavailable')
  expect(saveStatus).toHaveTextContent('Saved revision 1')
  fireEvent.change(screen.getByLabelText('Part label'), { target: { value: 'New unsaved label' } })
  client.saveDraft.mockRejectedValueOnce(new Error('Save unavailable.'))
  await userEvent.click(screen.getByRole('button', { name: 'Save draft' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Save unavailable')
  expect(saveStatus).toHaveTextContent('Unsaved changes.')
})

it('keeps download feedback beside After and preserves the mounted playback on download updates', async () => {
  const client = downloadClient(), downloads = nativeDownloads()
  await previewForDownload(client)
  const comparison = screen.getByRole('group', { name: 'Compare previews' })
  const downloadGroup = screen.getByRole('group', { name: 'Animation download' })
  expect(comparison.parentElement).toBe(downloadGroup.parentElement)
  const button = within(downloadGroup).getByRole('button', { name: 'Download animation' })
  expect(button).not.toHaveClass('page-editor__primary')
  await userEvent.click(screen.getByRole('button', { name: 'Play' }))
  const video = await screen.findByLabelText(`Animated page: ${project.name}`)
  client.video.mockRejectedValueOnce(new Error('Download unavailable.'))
  await userEvent.click(button)
  expect(await within(downloadGroup).findByRole('alert')).toHaveTextContent('Download unavailable')
  expect(button).toHaveAccessibleDescription(/Download failed: Download unavailable/)
  expect(screen.getByLabelText(`Animated page: ${project.name}`)).toBe(video)
  await userEvent.click(button)
  expect(await within(downloadGroup).findByRole('status')).toHaveTextContent('Download requested.')
  expect(button).toHaveAccessibleDescription('Download requested. Check your browser downloads.')
  expect(screen.getByLabelText(`Animated page: ${project.name}`)).toBe(video)
  expect(downloads).toHaveLength(1)
  await userEvent.click(screen.getByRole('button', { name: 'Static' }))
  expect(client.saveDraft).not.toHaveBeenCalled()
  expect(client.render).not.toHaveBeenCalled()
})


it('keeps one download feedback slot mounted through Before, After and download success', async () => {
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() })))
  const client = downloadClient()
  nativeDownloads()
  await previewForDownload(client)
  const downloadGroup = screen.getByRole('group', { name: 'Animation download' })
  const feedback = downloadGroup.querySelector('.page-editor__download-feedback')
  expect(feedback).toBeInTheDocument()
  expect(feedback).toBeEmptyDOMElement()
  await userEvent.click(screen.getByRole('button', { name: 'Before' }))
  expect(feedback).toContainElement(screen.getByText('Switch to After to download the current animation.'))
  await userEvent.click(screen.getByRole('button', { name: 'After' }))
  expect(feedback).toBeEmptyDOMElement()
  await userEvent.click(screen.getByRole('button', { name: 'Download animation' }))
  expect(feedback).toContainElement(await within(downloadGroup).findByRole('status'))
  expect(downloadGroup.querySelector('.page-editor__download-feedback')).toBe(feedback)
})
