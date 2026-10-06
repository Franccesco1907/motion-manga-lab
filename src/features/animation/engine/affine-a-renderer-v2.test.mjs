// @vitest-environment node
import assert from 'node:assert/strict'
import { expect, test } from 'vitest'
import * as legacy from './legacy-a-renderer.mjs'
import * as affine from './affine-a-renderer-v2.mjs'

function fixture() {
  const width = 32, height = 24, source = Buffer.alloc(width * height * 3), mask = new Uint8Array(width * height)
  for (let p = 0; p < mask.length; p++) source.set([12, 22, 32], p * 3)
  for (let y = 8; y <= 12; y++) for (let x = 8; x <= 12; x++) { mask[y * width + x] = 255; source.set([180, 60, 20], (y * width + x) * 3) }
  source.set([255, 0, 17], (12 * width + 12) * 3)
  return { width, height, source, mask }
}
const input = motion => ({ sourcePath: 'synthetic', duration: 2, fps: 4, regions: [{ id: 'actor', maskPath: 'synthetic-mask', motion }] })
const prepared = (engine, f, motion, options = {}) => engine.preparePixels({ ...f, regions: [{ id: 'actor', mask: f.mask, motion: engine.validateProject(input(motion)).regions[0].motion }], ...options })
const pixel = (bytes, width, x, y) => [...bytes.subarray((y * width + x) * 3, (y * width + x) * 3 + 3)]

test('uniform scale and independent-axis stretch move an asymmetric marker around the explicit anchor', () => {
  const f = fixture(), anchor = [8 / f.width, 8 / f.height]
  for (const [motion, destination] of [
    [{ type: 'scale', scale: 1.25, anchor, duration: 1 }, [13, 13]],
    [{ type: 'stretch', scaleX: 1.25, scaleY: .75, anchor, duration: 1 }, [13, 11]],
    [{ type: 'scale', scale: .75, anchor, duration: 1 }, [11, 11]],
  ]) {
    const ctx = prepared(affine, f, motion), frame = affine.renderFrame(ctx, 1)
    expect(pixel(frame, f.width, ...destination)).toEqual([255, 0, 17])
    expect(pixel(frame, f.width, 8, 8)).toEqual(pixel(f.source, f.width, 8, 8))
  }
})

test('identity factors preserve exact static RGB and every v1 action/frame remains byte-identical', () => {
  const f = fixture(), protectedMask = new Uint8Array(f.mask.length), foregroundMask = new Uint8Array(f.mask.length)
  protectedMask[10 * f.width + 10] = 255; foregroundMask[14 * f.width + 14] = 255
  const options = { protectMasks: [protectedMask], foregroundMasks: [foregroundMask] }
  for (const motion of [
    { type: 'static' }, { type: 'translate', dx: .125, dy: .25, duration: 1 },
    { type: 'rotate', angle: 12, anchor: [.5, .5], period: .5, cycles: 2, wristInfluence: .2 },
    { type: 'reveal', start: .25, duration: .5 },
  ]) {
    const a = prepared(legacy, f, motion, options), b = prepared(affine, f, motion, options)
    expect(b.support).toEqual(a.support)
    for (const time of [0, .125, .25, .5, 1, 2]) for (const staticMode of [false, true]) {
      assert.deepEqual(affine.renderFrame(b, time, { static: staticMode }), legacy.renderFrame(a, time, { static: staticMode }))
    }
  }
  for (const motion of [{ type: 'scale', scale: 1 }, { type: 'stretch', scaleX: 1, scaleY: 1 }]) {
    const ctx = prepared(affine, f, motion)
    for (const time of [0, .5, 1, 2]) assert.deepEqual(affine.renderFrame(ctx, time), f.source)
  }
})

test('finite easing, hold/reset and explicit finite pulse repetition have identity endpoints', () => {
  const motion = affine.validateProject(input({ type: 'scale', scale: 1.25, start: .25, duration: 1, easing: 'linear', endState: 'hold' })).regions[0].motion
  expect(affine.motionPose(motion, 0).scaleX).toBe(1)
  expect(affine.motionPose(motion, .75).scaleX).toBe(1.125)
  expect(affine.motionPose({ ...motion, easing: 'ease-in' }, .5).scaleX).toBe(1.015625)
  expect(affine.motionPose({ ...motion, easing: 'smooth' }, .5).scaleX).toBe(1.0390625)
  expect(affine.motionPose(motion, 2).scaleY).toBe(1.25)
  const reset = { ...motion, endState: 'reset' }
  expect(affine.motionPose(reset, 2).scaleX).toBe(1)
  const pulse = affine.validateProject(input({ type: 'stretch', scaleX: 1.25, scaleY: .75, period: 1, cycles: 2 })).regions[0].motion
  expect(affine.motionPose(pulse, .25)).toMatchObject({ scaleX: 1.25, scaleY: .75 })
  expect(affine.motionPose(pulse, .75)).toMatchObject({ scaleX: .75, scaleY: 1.25 })
  expect(affine.motionPose(pulse, 2)).toMatchObject({ scaleX: 1, scaleY: 1 })
  expect(() => affine.validateProject(input({ type: 'scale', scale: 1.25, cycles: 2 }))).toThrow(/period|repetition/i)
})

test('protected/foreground RGB and declared finite support hold at image borders', () => {
  const f = fixture(), protect = new Uint8Array(f.mask.length), foreground = new Uint8Array(f.mask.length)
  protect[11 * f.width + 13] = 255; foreground[13 * f.width + 13] = 255
  for (const anchor of [[0, 0], [1, 1], [.25, 1 / 3]]) {
    const ctx = prepared(affine, f, { type: 'stretch', scaleX: 1.25, scaleY: .75, anchor }, { protectMasks: [protect], foregroundMasks: [foreground] })
    for (const time of [0, .25, .5, 1, 2]) {
      const frame = affine.renderFrame(ctx, time)
      for (let p = 0; p < ctx.support.length; p++) if (ctx.protect[p] || !ctx.support[p]) assert.deepEqual(frame.subarray(p * 3, p * 3 + 3), f.source.subarray(p * 3, p * 3 + 3))
    }
  }
})

test('scaled premultiplied sampling does not pull white source background into a dark edge', () => {
  const f = { width: 24, height: 24, source: Buffer.alloc(24 * 24 * 3, 255), mask: new Uint8Array(24 * 24) }
  const p = 8 * f.width + 8; f.mask[p] = 255; f.source.fill(0, p * 3, p * 3 + 3)
  const frame = affine.renderFrame(prepared(affine, f, { type: 'scale', scale: 1.25, anchor: [0, 0], duration: 1 }), 1)
  expect(pixel(frame, f.width, 10, 10)).toEqual([0, 0, 0])
  expect(pixel(frame, f.width, 11, 10)).toEqual([204, 204, 204])
})

test('border selections clip within the finite image without expanding outside declared support', () => {
  for (const corner of [[0, 0], [29, 21]]) {
    const f = { width: 32, height: 24, source: Buffer.alloc(32 * 24 * 3, 90), mask: new Uint8Array(32 * 24) }
    for (let y = corner[1]; y < corner[1] + 3; y++) for (let x = corner[0]; x < corner[0] + 3; x++) {
      f.mask[y * f.width + x] = 255; f.source[(y * f.width + x) * 3] = 240
    }
    const ctx = prepared(affine, f, { type: 'stretch', scaleX: 1.25, scaleY: .75, anchor: [.5, .5] })
    for (const time of [0, .25, .5, 1]) {
      const frame = affine.renderFrame(ctx, time)
      expect(frame.length).toBe(f.source.length)
      expect([...frame].every(Number.isFinite)).toBe(true)
      for (let p = 0; p < ctx.support.length; p++) if (!ctx.support[p]) assert.deepEqual(frame.subarray(p * 3, p * 3 + 3), f.source.subarray(p * 3, p * 3 + 3))
    }
  }
})

test('rejects negative, zero, nonfinite/out-of-bound factors, anchors and excessive plans before preparation', () => {
  for (const scale of [-1, 0, NaN, Infinity, .749, 1.251, '1.2']) expect(() => affine.validateProject(input({ type: 'scale', scale }))).toThrow()
  for (const anchor of [[-.1, 0], [1.1, 1], [NaN, .5]]) expect(() => affine.validateProject(input({ type: 'stretch', scaleX: 1, scaleY: 1, anchor }))).toThrow()
  expect(() => affine.validateProject(input({ type: 'stretch', scaleX: 1, scaleY: 0 }))).toThrow()
  expect(() => affine.validateProject({ ...input({ type: 'scale', scale: 1.25 }), regions: Array.from({ length: 9 }, (_, i) => ({ id: `r-${i}`, maskPath: 'synthetic', motion: { type: 'scale', scale: 1.25 } })) })).toThrow()
  const f = fixture(), fullMask = new Uint8Array(f.mask.length).fill(255)
  expect(() => prepared(affine, { ...f, mask: fullMask }, { type: 'scale', scale: .75 })).toThrow(/support/)
})
