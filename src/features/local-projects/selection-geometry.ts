import type { RawRegion } from './contracts'

export const SURFACE_INTERACTION = { SELECT: 'select', MOVE: 'move', RESIZE: 'resize', PIVOT: 'pivot', DIRECTION: 'direction' } as const
export type SelectionInteraction = (typeof SURFACE_INTERACTION)[keyof typeof SURFACE_INTERACTION]

export interface SelectionImageSize { width: number; height: number }
export interface SelectionBounds { x: number; y: number; width: number; height: number }

function decimal(raw: string, min: number, max: number): number | undefined {
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(raw.trim())) return
  const value = Number(raw)
  return Number.isFinite(value) && value >= min && value <= max ? value : undefined
}

/** Final manual-mask pixel bounds, using native pixel-center/capsule rules.
 * Unknown model pixels, invalid drafts, empty masks and excessive work have no bounds.
 * Keep parity covered against scripts/local-projects/masks.ts; never use seed bounds
 * as a substitute for the final mask. Working copies have a maximum edge of 1280.
 */
export function selectionBounds(region: RawRegion, width: number, height: number): SelectionBounds | undefined {
  if (region.maskId || !Number.isInteger(width) || !Number.isInteger(height) || width < 2 || height < 2 || width > 1280 || height > 1280) return
  const selection = region.selection
  const x = decimal(selection.x, 0, 1), y = decimal(selection.y, 0, 1)
  const w = decimal(selection.width, Number.EPSILON, 1), h = decimal(selection.height, Number.EPSILON, 1)
  if (x === undefined || y === undefined || w === undefined || h === undefined || x + w > 1 + 1e-12 || y + h > 1 + 1e-12 || selection.strokes.length > 256) return
  const pixels = new Uint8Array(width * height)
  for (let yy = 0; yy < height; yy++) for (let xx = 0; xx < width; xx++) {
    if ((xx + 0.5) / width >= x && (xx + 0.5) / width < x + w && (yy + 0.5) / height >= y && (yy + 0.5) / height < y + h) pixels[yy * width + xx] = 1
  }
  let count = 0, work = 0
  for (const stroke of selection.strokes) {
    const ratio = decimal(stroke.radius, 0.001, 0.25)
    if (ratio === undefined || !stroke.points.length || (count += stroke.points.length) > 8192) return
    const radius = ratio * Math.min(width, height)
    for (let i = 0; i < stroke.points.length; i++) {
      const a = stroke.points[Math.max(0, i - 1)], b = stroke.points[i]
      if (!Number.isFinite(b.x) || !Number.isFinite(b.y) || b.x < 0 || b.x > 1 || b.y < 0 || b.y > 1) return
      const ax = a.x * width, ay = a.y * height, bx = b.x * width, by = b.y * height
      const vx = bx - ax, vy = by - ay, length = vx * vx + vy * vy
      work += (Math.abs(bx - ax) + radius * 2 + 2) * (Math.abs(by - ay) + radius * 2 + 2)
      if (work > 2_000_000) return
      for (let yy = Math.max(0, Math.floor(Math.min(ay, by) - radius)); yy < Math.min(height, Math.ceil(Math.max(ay, by) + radius)); yy++) {
        for (let xx = Math.max(0, Math.floor(Math.min(ax, bx) - radius)); xx < Math.min(width, Math.ceil(Math.max(ax, bx) + radius)); xx++) {
          const t = length ? Math.max(0, Math.min(1, ((xx + 0.5 - ax) * vx + (yy + 0.5 - ay) * vy) / length)) : 0
          if (Math.hypot(xx + 0.5 - ax - t * vx, yy + 0.5 - ay - t * vy) <= radius) pixels[yy * width + xx] = stroke.mode === 'add' ? 1 : 0
        }
      }
    }
  }
  let left = width, top = height, right = 0, bottom = 0
  for (let yy = 0; yy < height; yy++) for (let xx = 0; xx < width; xx++) if (pixels[yy * width + xx]) {
    left = Math.min(left, xx); top = Math.min(top, yy); right = Math.max(right, xx + 1); bottom = Math.max(bottom, yy + 1)
  }
  if (!right || !bottom) return
  return { x: left / width, y: top / height, width: (right - left) / width, height: (bottom - top) / height }
}
