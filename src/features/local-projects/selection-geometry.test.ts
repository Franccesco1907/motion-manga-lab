import { expect, it } from 'vitest'
import { rasterizeSelection } from '../../../scripts/local-projects/masks'
import type { RawRegion } from './contracts'
import { newRegion } from './draft-editing'
import { selectionBounds } from './selection-geometry'

function nativeBounds(region: RawRegion, width: number, height: number) {
  const mask = rasterizeSelection(region.selection, width, height)
  let left = width, top = height, right = 0, bottom = 0
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) if (mask[y * width + x]) {
    left = Math.min(left, x); top = Math.min(top, y); right = Math.max(right, x + 1); bottom = Math.max(bottom, y + 1)
  }
  return { x: left / width, y: top / height, width: (right - left) / width, height: (bottom - top) / height }
}

it.each([[59, 128], [128, 59], [80, 80]])('matches native pixel-center bounds with continuous add/erase strokes at %i×%i', (width, height) => {
  const region = newRegion('part')
  region.selection = { x: '0.001', y: '0.001', width: '0.001', height: '0.001', strokes: [
    { mode: 'add', radius: '0.08', points: [{ x: 0.2, y: 0.3 }, { x: 0.7, y: 0.6 }] },
    { mode: 'erase', radius: '0.1', points: [{ x: 0.7, y: 0.6 }] },
    { mode: 'add', radius: '0.04', points: [{ x: 0.95, y: 0.9 }] },
  ] }
  expect(selectionBounds(region, width, height)).toEqual(nativeBounds(region, width, height))
})

it('bounds the final mask, not the original seed after erasing its edge', () => {
  const region = newRegion('part')
  region.selection.strokes = [{ mode: 'erase', radius: '0.125', points: [{ x: 0.25, y: 0.25 }, { x: 0.25, y: 0.5 }] }]
  expect(selectionBounds(region, 100, 200)).toEqual(nativeBounds(region, 100, 200))
  expect(selectionBounds(region, 100, 200)?.x).toBeGreaterThan(0.25)
})

it('does not invent model-mask, invalid, over-budget or empty-mask bounds', () => {
  const region = newRegion('part')
  expect(selectionBounds({ ...region, maskId: 'model' }, 100, 200)).toBeUndefined()
  expect(selectionBounds(region, 0, 200)).toBeUndefined()
  expect(selectionBounds({ ...region, selection: { ...region.selection, x: '-' } }, 100, 200)).toBeUndefined()
  expect(selectionBounds(region, 100000, 100000)).toBeUndefined()
  region.selection.strokes = [{ mode: 'erase', radius: '0.25', points: [{ x: 0.375, y: 0.375 }] }]
  expect(selectionBounds(region, 100, 100)).toBeUndefined()
})
