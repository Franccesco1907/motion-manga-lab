import { expect, it } from 'vitest'
import { newRegion, updateRegion, recoverDraft, backupDraft, finiteRaw, isLocalDraft } from './draft-editing'
import type { LocalDraft } from './contracts'

const draft: LocalDraft = {
  schemaVersion: 1, projectId: 'page', sourceVersion: 'source', normalizationVersion: 'working-image-v1',
  revision: 0, duration: '6', fps: '24', regions: [newRegion('first'), newRegion('second')],
}

it('never interprets incomplete numeric fields as zero for selection or brush geometry', () => {
  expect(finiteRaw('')).toBeUndefined()
  expect(finiteRaw('   ')).toBeUndefined()
  expect(finiteRaw('-')).toBeUndefined()
  expect(finiteRaw('0')).toBe(0)
})

it('retains incomplete raw strings in independent parts without changing selection geometry', () => {
  const edited = updateRegion(draft, 'first', region => ({ ...region, motion: { ...region.motion, dx: '', dy: '-', type: 'translate' } }))
  const next = updateRegion(edited, 'second', region => ({ ...region, motion: { ...region.motion, angle: '12' } }))
  expect(next.regions[0].motion.dx).toBe('')
  expect(next.regions[0].motion.dy).toBe('-')
  expect(next.regions[0].selection).toEqual(draft.regions[0].selection)
  expect(next.regions[1].motion.angle).toBe('12')
})

it('backs up only raw editable JSON and recovers against the same source without discarding conflicts', () => {
  const edited = { ...draft, duration: '', regions: [] }
  backupDraft(edited)
  const recovery = recoverDraft(draft)
  expect(recovery?.draft.duration).toBe('')
  expect(recovery?.conflict).toBe(false)
  expect(recoverDraft({ ...draft, revision: 1 })?.conflict).toBe(true)
  expect(recoverDraft({ ...draft, sourceVersion: 'different' })).toBeUndefined()
  expect(JSON.stringify(recovery)).not.toContain('blob:')
  localStorage.clear()
})

it('recognizes v2 raw factor drafts and recovers incomplete factors only for their owner and source', () => {
  const next = structuredClone(draft)
  next.schemaVersion = 2
  next.regions[0].motion = { ...next.regions[0].motion, type: 'scale', scale: '' }
  next.regions[1].motion = { ...next.regions[1].motion, type: 'stretch', scaleX: '1.2', scaleY: '-' }
  expect(isLocalDraft(next)).toBe(true)
  backupDraft(next, 'owner-a')
  expect(recoverDraft(draft, 'owner-a')?.draft.regions[1].motion.scaleY).toBe('-')
  expect(recoverDraft(draft, 'owner-b')).toBeUndefined()
  expect(isLocalDraft({ ...next, schemaVersion: 1 })).toBe(false)
  expect(isLocalDraft({ ...next, schemaVersion: 3 })).toBe(false)
  const invalid = structuredClone(next)
  Reflect.set(invalid.regions[0].motion, 'scale', 1)
  expect(isLocalDraft(invalid)).toBe(false)
  localStorage.clear()
})
