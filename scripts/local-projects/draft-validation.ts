import {
  LOCAL_AFFINE_MOTION, LOCAL_DRAFT_SCHEMA, LOCAL_EASING, LOCAL_END, LOCAL_MOTION, LOCAL_ROLE, LOCAL_STROKE,
  type LocalDraft, type RawMotion, type RawRegion, type RawSelection,
} from '../../src/features/local-projects/contracts.ts'
import { LocalProjectError } from './store.ts'

export const STATE_BYTE_LIMIT = 256 * 1024
export const isUuid = (value: unknown): value is string => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value)
const invalid = () => new LocalProjectError('invalid_draft', 'The draft shape or source version is invalid. Your current draft was not changed.', 422)
export function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw invalid()
  return value as Record<string, unknown>
}
export function revision(value: unknown): number {
  if (!Number.isSafeInteger(value) || typeof value !== 'number' || value < 0) throw invalid()
  return value
}
function raw(value: unknown, length = 64): string {
  if (typeof value !== 'string' || value.length > length) throw invalid()
  return value
}
function option<T extends string>(value: unknown, values: readonly T[]): T {
  if (typeof value !== 'string' || !values.includes(value as T)) throw invalid()
  return value as T
}
export function validateDraft(value: unknown, projectId: string, sourceVersion: string): LocalDraft {
  const draft = object(value)
  if ((draft.schemaVersion !== LOCAL_DRAFT_SCHEMA.LEGACY && draft.schemaVersion !== LOCAL_DRAFT_SCHEMA.AFFINE) || draft.projectId !== projectId || draft.sourceVersion !== sourceVersion || draft.normalizationVersion !== 'working-image-v1' ||
    !Array.isArray(draft.regions) || draft.regions.length > 16) throw invalid()
  const ids = new Set<string>(); let points = 0
  const regions: RawRegion[] = draft.regions.map(value => {
    const region = object(value), selected = object(region.selection), movement = object(region.motion)
    const id = raw(region.id, 80)
    if (!/^[a-zA-Z0-9_-]{1,80}$/.test(id) || ids.has(id)) throw invalid()
    ids.add(id)
    if (!Array.isArray(selected.strokes) || selected.strokes.length > 64) throw invalid()
    const selection: RawSelection = {
      x: raw(selected.x), y: raw(selected.y), width: raw(selected.width), height: raw(selected.height),
      strokes: selected.strokes.map(value => {
        const stroke = object(value)
        if (!Array.isArray(stroke.points) || !stroke.points.length) throw invalid()
        points += stroke.points.length
        if (points > 4096) throw invalid()
        return {
          mode: option(stroke.mode, Object.values(LOCAL_STROKE)), radius: raw(stroke.radius),
          points: stroke.points.map(value => {
            const point = object(value)
            if (typeof point.x !== 'number' || typeof point.y !== 'number' || !Number.isFinite(point.x) || !Number.isFinite(point.y) ||
              point.x < 0 || point.x > 1 || point.y < 0 || point.y > 1) throw invalid()
            return { x: point.x, y: point.y }
          }),
        }
      }),
    }
    const motion: RawMotion = {
      type: option(movement.type, Object.values(draft.schemaVersion === LOCAL_DRAFT_SCHEMA.AFFINE ? LOCAL_AFFINE_MOTION : LOCAL_MOTION)),
      anchorX: raw(movement.anchorX), anchorY: raw(movement.anchorY), dx: raw(movement.dx), dy: raw(movement.dy),
      angle: raw(movement.angle), start: raw(movement.start), duration: raw(movement.duration), cycles: raw(movement.cycles),
      period: raw(movement.period), pause: raw(movement.pause), wristInfluence: raw(movement.wristInfluence),
      endState: option(movement.endState, Object.values(LOCAL_END)), easing: option(movement.easing, Object.values(LOCAL_EASING)),
    }
    for (const field of ['scale', 'scaleX', 'scaleY'] as const) if (movement[field] !== undefined) {
      if (draft.schemaVersion !== LOCAL_DRAFT_SCHEMA.AFFINE) throw invalid()
      motion[field] = raw(movement[field])
    }
    if (region.maskId !== undefined && !isUuid(region.maskId)) throw invalid()
    return { id, label: raw(region.label, 120), role: option(region.role, Object.values(LOCAL_ROLE)), selection, motion,
      ...(region.maskId !== undefined ? { maskId: region.maskId as string } : {}) }
  })
  return { schemaVersion: draft.schemaVersion, projectId, sourceVersion, normalizationVersion: 'working-image-v1', revision: revision(draft.revision),
    duration: raw(draft.duration), fps: raw(draft.fps), regions }
}
