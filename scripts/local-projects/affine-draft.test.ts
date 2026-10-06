// @vitest-environment node
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import sharp from 'sharp'
import { expect, it } from 'vitest'
import { LocalProjectStore } from './store.ts'
import { EditingStore } from './editing-store.ts'
import { createWorkingSource } from './working-source.ts'
import { frameForDraft, prepareDraft } from './masks.ts'
import { region } from './render-fixtures.ts'
import type { LocalDraft } from '../../src/features/local-projects/contracts.ts'

it('reopens old schema1 unchanged and saves incomplete schema2 factors without coercion before strict render rejection', async () => {
  const temporary = await mkdtemp(join(tmpdir(), 'manga-affine-draft-'))
  try {
    const bytes = await sharp({ create: { width: 16, height: 16, channels: 3, background: '#456789' } }).png().toBuffer()
    const originals = new LocalProjectStore(join(temporary, 'private')), editing = new EditingStore(originals)
    const project = await originals.import(bytes, 'synthetic.png'), working = await createWorkingSource(bytes)
    const initial = await editing.getDraft(project.id), old = await editing.saveDraft(project.id, 0, initial)
    expect((await new EditingStore(originals).getDraft(project.id)).schemaVersion).toBe(1)
    expect(prepareDraft(working, old).rendererVersion).toBe('legacy-a-v1')
    const selected = region({ id: 'actor' })
    const upgraded = { ...old, schemaVersion: 2, duration: '1', fps: '4', regions: [{ ...selected, motion: { ...selected.motion, type: 'scale', scale: '', anchorX: '0.5', anchorY: '0.5' } }] }
    const saved = await editing.saveDraft(project.id, 1, upgraded)
    const reopened = await new EditingStore(originals).getDraft(project.id)
    expect(reopened).toEqual(saved)
    expect(reopened.regions[0].motion.scale).toBe('')
    expect(() => prepareDraft(working, reopened)).toThrow(/scale.*finite/i)
    const corrected = { ...reopened, regions: [{ ...reopened.regions[0], motion: { ...reopened.regions[0].motion, scale: '1.25' } }] }
    const v2 = prepareDraft(working, corrected)
    expect(v2.rendererVersion).toBe('affine-a-v2')
    expect(v2.draftSchemaVersion).toBe(2)
    expect(frameForDraft(v2, 0, true)).toEqual(working.pixels)
    for (const scale of ['0', '-1', 'NaN', 'Infinity', '.749', '1.251']) {
      expect(() => prepareDraft(working, { ...corrected, regions: [{ ...corrected.regions[0], motion: { ...corrected.regions[0].motion, scale } }] })).toThrow(/scale/)
    }
    await expect(editing.saveDraft(project.id, saved.revision, { ...corrected, schemaVersion: 1 })).rejects.toMatchObject({ code: 'invalid_draft' })
    expect((await originals.original(project.id)).bytes).toEqual(bytes)
  } finally { await rm(temporary, { recursive: true, force: true }) }
})

it('keeps moving-source budgets and protected pixels for schema2 without reinterpreting selection geometry', async () => {
  const bytes = await sharp({ create: { width: 700, height: 700, channels: 3, background: '#56789a' } }).png().toBuffer()
  const working = await createWorkingSource(bytes)
  const selected = region({ id: 'actor' })
  const value: LocalDraft = { schemaVersion: 2, projectId: '01999663-729b-4e5b-8129-24735b1fd61c', sourceVersion: working.sourceVersion, normalizationVersion: 'working-image-v1', revision: 0, duration: '1', fps: '4',
    regions: [{ ...selected, selection: { ...selected.selection, x: '0', y: '0', width: '.7', height: '.7' }, motion: { ...selected.motion, type: 'stretch', scaleX: '.75', scaleY: '1.25' } }] }
  expect(() => prepareDraft(working, value)).toThrow(/200000|bounded local preparation budget/)
})
