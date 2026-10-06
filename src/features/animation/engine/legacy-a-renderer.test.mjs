import { test } from 'vitest'
import assert from 'node:assert/strict'
import { validateProject, motionPose, completeBackground, renderFrame, preparePixels } from './legacy-a-renderer.mjs'

const project = (motion = { type: 'translate', dx: .25, dy: .25, duration: 1 }) => ({ sourcePath: '/source.png', duration: 2, fps: 24, regions: [{ id: 'piece', maskPath: '/mask.png', motion }] })
const fixture = () => {
  const width = 16, height = 16, source = Buffer.alloc(width * height * 3, 90), mask = new Uint8Array(width * height)
  for (let y = 5; y < 8; y++) for (let x = 5; x < 8; x++) { const p = y * width + x; mask[p] = 255; source[p * 3] = 240 }
  return { width, height, source, mask }
}
test('rejects malformed numeric plans and excessive render budgets', () => {
  for (const value of [NaN, Infinity, '0.2']) assert.throws(() => validateProject(project({ type: 'translate', dx: value })))
  assert.throws(() => validateProject({ ...project(), duration: 7 }))
  assert.throws(() => validateProject({ ...project(), fps: 30 }))
  assert.throws(() => validateProject(project({ type: 'rotate', anchor: [2, 0] })))
  assert.throws(() => validateProject({ ...project(), regions: Array.from({ length: 9 }, (_, i) => ({ ...project().regions[0], id: String(i) })) }))
})
test('each motion has independent displacement, timing and finite repetition', () => {
  const fall = validateProject(project({ type: 'translate', dx: -.1, dy: .5, start: .5, duration: 1, easing: 'ease-in', endState: 'hold' })).regions[0].motion
  assert.equal(motionPose(fall, .4).dy, 0)
  assert.equal(motionPose(fall, 1).dy, .125)
  assert.equal(motionPose(fall, 2).dy, .5)
  const hand = validateProject(project({ type: 'rotate', angle: 12, anchor: [.5, .5], start: 0, duration: 2, cycles: 2, period: 1, endState: 'reset' })).regions[0].motion
  assert.equal(motionPose(hand, .25).angle, 12)
  assert.equal(motionPose(hand, .75).angle, -12)
  assert.equal(motionPose(hand, 2).angle, 0)
})
test('harmonic completion preserves every pixel outside erase support including image borders', () => {
  const { source, mask, width, height } = fixture(); mask[0] = 255
  const filled = completeBackground(source, mask, width, height, 40)
  for (let p = 0; p < mask.length; p++) if (!mask[p]) assert.deepEqual(filled.subarray(p * 3, p * 3 + 3), source.subarray(p * 3, p * 3 + 3))
  assert.ok([...filled].every(Number.isFinite))
})
test('translation erases old actor, restores protected pixels, and static is byte-identical', () => {
  const f = fixture(), protect = new Uint8Array(256); protect[10 * 16 + 10] = 255
  const ctx = preparePixels({ ...f, regions: [{ id: 'arbitrary', mask: f.mask, motion: validateProject(project()).regions[0].motion }], protectMasks: [protect] })
  assert.deepEqual(renderFrame(ctx, 0, { static: true }), f.source)
  assert.deepEqual(renderFrame(ctx, 0), f.source)
  const rendered = renderFrame(ctx, 1)
  assert.ok(rendered[6 * 16 * 3 + 6 * 3] < 150)
  assert.equal(rendered[(10 * 16 + 10) * 3], 90)
  assert.equal(rendered[(9 * 16 + 9) * 3], 240)
  for (let p = 0; p < 256; p++) if (!ctx.support[p]) assert.deepEqual(rendered.subarray(p * 3, p * 3 + 3), f.source.subarray(p * 3, p * 3 + 3))
})
test('reveal fades whole mask including balloon and returns original at full opacity', () => {
  const f = fixture(); const motion = validateProject(project({ type: 'reveal', start: .25, duration: .5 })).regions[0].motion
  const ctx = preparePixels({ ...f, regions: [{ id: 'dialogue', mask: f.mask, motion }] })
  assert.notDeepEqual(renderFrame(ctx, 0), f.source)
  assert.deepEqual(renderFrame(ctx, 1), f.source)
})
test('static layers remain static and cannot erase original content', () => {
  const f = fixture(); const ctx = preparePixels({ ...f, regions: [{ id: 'background', mask: f.mask, motion: { type: 'static' } }] })
  assert.deepEqual(renderFrame(ctx, 1), f.source)
})
test('same-source patch refuses protected text donors instead of copying text', () => {
  const f = fixture(), protect = new Uint8Array(256); protect[6 * 16 + 10] = 255
  assert.throws(() => preparePixels({ ...f, regions: [{ id: 'piece', mask: f.mask, motion: validateProject(project()).regions[0].motion, patchHint: { dx: .25, dy: 0 } }], protectMasks: [protect] }), /protected|foreground/)
})
test('translation ignores gesture period and retains a final falling pose', () => {
  const motion = validateProject(project({ type: 'translate', dx: .2, dy: .5, duration: 1, period: 1, cycles: 1, endState: 'hold' })).regions[0].motion
  assert.equal(motionPose(motion, 2).dy, .5)
})
test('premultiplied actor interpolation cannot pull bright surrounding RGB into a dark edge', () => {
  const width = 8, height = 8, source = Buffer.alloc(192, 255), mask = new Uint8Array(64)
  mask[3 * 8 + 3] = 255; source.fill(0, (3 * 8 + 3) * 3, (3 * 8 + 3) * 3 + 3)
  const motion = validateProject(project({ type: 'translate', dx: .0625, dy: 0, duration: 1, easing: 'linear' })).regions[0].motion
  const ctx = preparePixels({ source, width, height, regions: [{ id: 'edge', mask, motion }] }), rgb = renderFrame(ctx, 1)
  assert.equal(rgb[(3 * 8 + 3) * 3], 128)
  assert.equal(rgb[(3 * 8 + 4) * 3], 128)
})
test('foreground remains exact even when a translated actor crosses it', () => {
  const f = fixture(), foreground = new Uint8Array(256); foreground[9 * 16 + 9] = 255
  const ctx = preparePixels({ ...f, regions: [{ id: 'piece', mask: f.mask, motion: validateProject(project()).regions[0].motion }], foregroundMasks: [foreground] })
  assert.deepEqual(renderFrame(ctx, 1).subarray((9 * 16 + 9) * 3, (9 * 16 + 9) * 3 + 3), f.source.subarray((9 * 16 + 9) * 3, (9 * 16 + 9) * 3 + 3))
})
test('same-source patch refuses copying another moving actor', () => {
  const f = fixture(), otherMask = new Uint8Array(256); otherMask[6 * 16 + 10] = 255
  const motion = validateProject(project()).regions[0].motion
  assert.throws(() => preparePixels({ ...f, regions: [{ id: 'piece', mask: f.mask, motion, patchHint: { dx: .25, dy: 0 } }, { id: 'other', mask: otherMask, motion }] }), /moving/)
})
test('prepared source-based background is sampled only inside active erase supports', () => {
  const f = fixture(), background = Buffer.alloc(f.source.length, 12), protect = new Uint8Array(256)
  protect[6 * 16 + 6] = 255
  const motion = validateProject(project()).regions[0].motion
  const ctx = preparePixels({ ...f, background, regions: [{ id: 'piece', mask: f.mask, motion }], protectMasks: [protect] })
  assert.deepEqual(renderFrame(ctx, 0), f.source)
  assert.deepEqual(renderFrame(ctx, 1, { static: true }), f.source)
  const rgb = renderFrame(ctx, 1)
  assert.equal(rgb[(5 * 16 + 5) * 3], 12)
  assert.equal(rgb[(6 * 16 + 6) * 3], 240)
  assert.equal(rgb[0], 90)
  const still = preparePixels({ ...f, background, regions: [{ id: 'piece', mask: f.mask, motion: { type: 'static' } }] })
  assert.deepEqual(renderFrame(still, 1), f.source)
})
test('a full-image static proposal renders original with zero support and no completion', () => {
  const f = fixture(), mask = new Uint8Array(256).fill(255)
  const ctx = preparePixels({ ...f, regions: [{ id: 'broad-proposal', mask, motion: { type: 'static' } }] })
  assert.deepEqual(renderFrame(ctx, 1), f.source)
  assert.equal(ctx.support.some(Boolean), false)
  assert.equal(ctx.regions[0].background, f.source)
  const motion = validateProject(project()).regions[0].motion
  assert.throws(() => preparePixels({ ...f, regions: [{ id: 'moving', mask: f.mask, eraseMask: mask, motion }] }), /Erase support/)
})
