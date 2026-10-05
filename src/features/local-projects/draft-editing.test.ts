import { expect, it } from 'vitest'
import { newRegion, updateRegion, recoverDraft, backupDraft, finiteRaw } from './draft-editing'
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
