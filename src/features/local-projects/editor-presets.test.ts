import { expect, it } from 'vitest'
import { applyPreset, EDITOR_PRESET } from './editor-presets'
import { newRegion } from './draft-editing'
import type { LocalDraft } from './contracts'
const draft: LocalDraft = { schemaVersion: 1, projectId: 'page', sourceVersion: 'source', normalizationVersion: 'working-image-v1', revision: 3, duration: '0.2', fps: '24', regions: [newRegion('part')] }
it('creates bounded native presets with explicit affine migration only for pulse', () => {
  for (const preset of Object.values(EDITOR_PRESET)) {
    const next = applyPreset(draft, 'part', preset, 100, 1, { x: .3, y: .4 })
    const motion = next.regions[0].motion
    expect(next.schemaVersion).toBe(preset === EDITOR_PRESET.PULSE ? 2 : 1)
    expect(motion.anchorX).toBe('0.3')
    expect(motion.anchorY).toBe('0.4')
    expect(Number(motion.duration)).toBeLessThanOrEqual(.2)
    expect(Number(motion.period || motion.duration)).toBeLessThanOrEqual(.2)
    expect(motion.cycles).toBe('1')
    expect(next.regions[0].selection).toEqual(draft.regions[0].selection)
    expect(next.revision).toBe(3)
  }
})
it('keeps raw invalid scene values and refuses unknown bounds unless the existing pivot is valid', () => {
  expect(() => applyPreset({ ...draft, duration: '-' }, 'part', EDITOR_PRESET.SWAY, 50, 2)).toThrow(/Scene duration/)
  const region = { ...newRegion('part'), motion: { ...newRegion().motion, anchorX: '-', anchorY: '' }, maskId: 'model' }
  expect(() => applyPreset({ ...draft, regions: [region] }, 'part', EDITOR_PRESET.SWAY, 50, 2)).toThrow(/pivot/)
  const next = applyPreset({ ...draft, regions: [{ ...newRegion('part'), maskId: 'model' }] }, 'part', EDITOR_PRESET.SWAY, 50, 2)
  expect(next.regions[0].maskId).toBe('model')
  expect(next.regions[0].motion.anchorX).toBe('0.5')
})
it('preserves brush-rich selection and never invents semantic part movement', () => {
  const region = newRegion('part')
  region.selection.strokes = [{ mode: 'add', radius: '0.02', points: [{ x: .1, y: .8 }] }]
  const next = applyPreset({ ...draft, duration: '6', regions: [region] }, 'part', EDITOR_PRESET.MOVE, 50, 3, { x: .12, y: .79 })
  expect(next.regions[0].selection).toEqual(region.selection)
  expect(next.regions[0].motion.type).toBe('translate')
  expect(next.regions[0].motion.dx).toBe('0.04')
  expect(next.regions[0].motion.period).toBe('')
})

it('keeps the chosen direction, rotation sign, and inward scale when tuning an existing preset', () => {
  const region = newRegion('part')
  region.motion = { ...region.motion, type: 'translate', dx: '-0.03', dy: '0.04' }
  const moved = applyPreset({ ...draft, duration: '6', regions: [region] }, 'part', EDITOR_PRESET.MOVE, 50, 3, undefined, true).regions[0].motion
  expect(Number(moved.dx)).toBeCloseTo(-.024)
  expect(Number(moved.dy)).toBeCloseTo(.032)
  region.motion = { ...region.motion, type: 'rotate', angle: '-10' }
  expect(applyPreset({ ...draft, regions: [region] }, 'part', EDITOR_PRESET.SWAY, 50, 2, undefined, true).regions[0].motion.angle).toBe('-7.5')
  region.motion = { ...region.motion, type: 'scale', scale: '0.9' }
  expect(applyPreset({ ...draft, schemaVersion: 2, regions: [region] }, 'part', EDITOR_PRESET.PULSE, 50, 2, undefined, true).regions[0].motion.scale).toBe('0.925')
})
