import { expect, it } from 'vitest'
import { applyPreset, EDITOR_PRESET, isRepeatMovementEnabled, setRepeatMovement, setPresetSpeed } from './editor-presets'
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

it.each(Object.values(EDITOR_PRESET))('repeats %s with complete finite gestures and preserves exact raw artwork settings', preset => {
  const initial = applyPreset({ ...draft, duration: '6' }, 'part', preset, 43, 2)
  const region = initial.regions[0]
  region.motion = { ...region.motion, dx: '-0.013579', dy: '0.024681', angle: '-6.54321', scale: '0.94321', anchorX: '0.23456789', start: '0.2', pause: '0.1' }
  const repeated = setRepeatMovement(initial, 'part', true)
  expect(repeated.regions[0].motion).toEqual({ ...region.motion, repeat: true, cycles: '4', period: '1.2', ...(preset === 'translate' ? { endState: 'reset' } : {}) })
  expect(repeated.regions[0].selection).toEqual(region.selection)
  const fast = setPresetSpeed(repeated, 'part', 3)
  expect(fast.regions[0].motion).toEqual({ ...repeated.regions[0].motion, duration: '0.6', period: '0.6', cycles: '8' })
  const single = setRepeatMovement(repeated, 'part', false)
  expect(single.regions[0].motion).toEqual({ ...repeated.regions[0].motion, repeat: false, cycles: '1', ...(preset === 'translate' ? { period: '', endState: 'hold' } : {}) })
})

it('caps finite gestures at twelve and keeps incomplete raw periods when a toggle is rejected', () => {
  const region = newRegion('part')
  region.motion = { ...region.motion, type: 'rotate', duration: '0.12', period: '0.12' }
  expect(setRepeatMovement({ ...draft, duration: '6', regions: [region] }, 'part', true).regions[0].motion.cycles).toBe('12')
  region.motion.period = '-'
  expect(() => setRepeatMovement({ ...draft, duration: '6', regions: [region] }, 'part', true)).toThrow(/Advanced/)
  expect(region.motion.period).toBe('-')
})

it.each([{ duration: '0.04', period: '0.04' }, { period: '6.1' }, { pause: '6.1' }, { duration: '0.03' }, { start: '-0.1' }])('refuses unsupported native timing %j without changing raw motion', fields => {
  const region = newRegion('part')
  region.motion = { ...region.motion, type: 'rotate', duration: '0.12', period: '0.12', ...fields }
  const initial = { ...draft, duration: '6', regions: [region] }, before = structuredClone(initial)
  expect(() => setRepeatMovement(initial, 'part', true)).toThrow(/Advanced/)
  expect(initial).toEqual(before)
})

it.each(Object.values(EDITOR_PRESET))('keeps %s repeat intent through intensity, speed and preset changes', preset => {
  const repeated = setRepeatMovement(applyPreset({ ...draft, duration: '6' }, 'part', preset, 50, 2), 'part', true)
  for (const [speed, duration, cycles] of [[1, '2', '3'], [2, '1.2', '5'], [3, '0.6', '10']] as const) {
    const next = setPresetSpeed(repeated, 'part', speed)
    expect(next.regions[0].motion).toEqual({ ...repeated.regions[0].motion, duration, period: duration, cycles })
    const tuned = applyPreset(next, 'part', preset, 73, speed, undefined, true)
    expect(tuned.regions[0].motion).toMatchObject({ repeat: true, duration, period: duration, cycles })
    const switched = applyPreset(tuned, 'part', preset === 'scale' ? 'translate' : 'scale', 50, speed)
    expect(switched.regions[0].motion).toMatchObject({ repeat: true, cycles })
  }
})

it('retains explicit repeat intent for one short gesture and rejects incomplete or nonfitting timing without mutation', () => {
  const short = applyPreset(draft, 'part', EDITOR_PRESET.MOVE, 50, 2)
  expect(setRepeatMovement(short, 'part', true).regions[0].motion).toMatchObject({ repeat: true, cycles: '1', duration: '0.2', period: '0.2' })
  for (const fields of [{ start: '-' }, { pause: '-' }, { duration: '-' }, { start: '0.1' }]) {
    const invalid = { ...short, regions: [{ ...short.regions[0], motion: { ...short.regions[0].motion, ...fields } }] }
    const before = structuredClone(invalid)
    expect(() => setRepeatMovement(invalid, 'part', true)).toThrow(/Advanced/)
    expect(invalid).toEqual(before)
  }
})

it('recognizes legacy periodic repetitions without inferring repeat from ignored Move fields', () => {
  const motion = { ...newRegion().motion, type: 'rotate' as const, cycles: '4', period: '1.2' }
  expect(isRepeatMovementEnabled(motion)).toBe(true)
  expect(isRepeatMovementEnabled({ ...motion, type: 'translate' })).toBe(false)
  expect(isRepeatMovementEnabled({ ...motion, cycles: '1', repeat: true })).toBe(true)
  const legacy = { ...draft, duration: '6', regions: [{ ...newRegion('part'), motion }] }
  expect(applyPreset(legacy, 'part', EDITOR_PRESET.SWAY, 50, 3).regions[0].motion).toMatchObject({ repeat: true, cycles: '10' })
  const move = { ...legacy, regions: [{ ...legacy.regions[0], motion: { ...motion, type: 'translate' as const, period: '5', duration: '1.2' } }] }
  expect(setRepeatMovement(move, 'part', true).regions[0].motion).toMatchObject({ repeat: true, period: '1.2', cycles: '5' })
})
