import { LOCAL_AFFINE_MOTION, LOCAL_DRAFT_SCHEMA, LOCAL_END, LOCAL_EASING, LOCAL_MOTION, LOCAL_ROLE, LOCAL_STROKE, type LocalDraft, type LocalAffineMotionType, type RawRegion } from './contracts'

const PREFIX = 'motion-manga-raw-draft:'
export const SELECTION_TOOL = { RECTANGLE: 'rectangle', ADD: 'add', ERASE: 'erase' } as const
export type SelectionTool = (typeof SELECTION_TOOL)[keyof typeof SELECTION_TOOL]
export function finiteRaw(raw: string) { return raw.trim() && Number.isFinite(Number(raw)) ? Number(raw) : undefined }
const MOTION_FIELDS = ['anchorX', 'anchorY', 'dx', 'dy', 'angle', 'start', 'duration', 'cycles', 'period', 'pause', 'wristInfluence'] as const
const SELECTION_FIELDS = ['x', 'y', 'width', 'height'] as const
const FACTOR_FIELDS = ['scale', 'scaleX', 'scaleY'] as const

export function newRegion(id: string = crypto.randomUUID()): RawRegion {
  return {
    id, label: 'New part', role: 'actor', selection: { x: '0.25', y: '0.25', width: '0.25', height: '0.25', strokes: [] },
    motion: { type: 'static', anchorX: '0.5', anchorY: '0.5', dx: '0', dy: '0', angle: '0', start: '0', duration: '1', cycles: '1', period: '', pause: '', wristInfluence: '', endState: 'hold', easing: 'smooth' },
  }
}

export function updateRegion(draft: LocalDraft, id: string, update: (region: RawRegion) => RawRegion): LocalDraft {
  return { ...draft, regions: draft.regions.map(region => region.id === id ? update(region) : region) }
}

export function selectMotion(draft: LocalDraft, id: string, type: LocalAffineMotionType): LocalDraft {
  const affine = type === LOCAL_AFFINE_MOTION.SCALE || type === LOCAL_AFFINE_MOTION.STRETCH
  return updateRegion({ ...draft, schemaVersion: affine ? LOCAL_DRAFT_SCHEMA.AFFINE : draft.schemaVersion }, id, region => ({
    ...region,
    motion: { ...region.motion, type,
      ...(type === LOCAL_AFFINE_MOTION.SCALE ? { scale: region.motion.scale ?? '1' } : {}),
      ...(type === LOCAL_AFFINE_MOTION.STRETCH ? { scaleX: region.motion.scaleX ?? '1', scaleY: region.motion.scaleY ?? '1' } : {}),
    },
  }))
}

function object(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value) }
function raw(value: unknown): value is string { return typeof value === 'string' && value.length <= 128 }
function member(values: Record<string, string>, value: unknown) { return Object.values(values).includes(String(value)) }

export function isLocalDraft(value: unknown): value is LocalDraft {
  if (!object(value) || (value.schemaVersion !== LOCAL_DRAFT_SCHEMA.LEGACY && value.schemaVersion !== LOCAL_DRAFT_SCHEMA.AFFINE) || typeof value.projectId !== 'string' || typeof value.sourceVersion !== 'string'
    || value.normalizationVersion !== 'working-image-v1' || !Number.isSafeInteger(value.revision) || Number(value.revision) < 0
    || !raw(value.duration) || !raw(value.fps) || !Array.isArray(value.regions) || value.regions.length > 16) return false
  return value.regions.every(region => {
    if (!object(region) || typeof region.id !== 'string' || typeof region.label !== 'string' || !member(LOCAL_ROLE, region.role)
      || !object(region.selection) || !object(region.motion)) return false
    const selection = region.selection, motion = region.motion
    return SELECTION_FIELDS.every(key => raw(selection[key])) && Array.isArray(selection.strokes)
      && selection.strokes.every(stroke => object(stroke) && member(LOCAL_STROKE, stroke.mode) && raw(stroke.radius)
        && Array.isArray(stroke.points) && stroke.points.every(point => object(point) && typeof point.x === 'number' && Number.isFinite(point.x) && typeof point.y === 'number' && Number.isFinite(point.y)))
      && MOTION_FIELDS.every(key => raw(motion[key])) && member(value.schemaVersion === LOCAL_DRAFT_SCHEMA.AFFINE ? LOCAL_AFFINE_MOTION : LOCAL_MOTION, motion.type)
      && FACTOR_FIELDS.every(key => motion[key] === undefined || (value.schemaVersion === LOCAL_DRAFT_SCHEMA.AFFINE && raw(motion[key])))
      && member(LOCAL_END, motion.endState) && member(LOCAL_EASING, motion.easing)
  })
}

function recoveryPrefix(ownerId: string) { return `${PREFIX}${encodeURIComponent(ownerId)}:` }
function recoveryKey(draft: LocalDraft, ownerId: string) { return `${recoveryPrefix(ownerId)}${encodeURIComponent(draft.projectId)}:${encodeURIComponent(draft.sourceVersion)}` }
export function backupDraft(draft: LocalDraft, ownerId = 'local') { localStorage.setItem(recoveryKey(draft, ownerId), JSON.stringify(draft)) }
export function clearBackup(projectId: string, ownerId = 'local') {
  const prefix = `${recoveryPrefix(ownerId)}${encodeURIComponent(projectId)}:`
  for (const key of Object.keys(localStorage)) if (key.startsWith(prefix)) localStorage.removeItem(key)
}
export function clearOwnerRecovery(ownerId: string) {
  for (const key of Object.keys(localStorage)) if (key.startsWith(recoveryPrefix(ownerId))) localStorage.removeItem(key)
}

export function recoverDraft(saved: LocalDraft, ownerId = 'local'): { draft: LocalDraft; conflict: boolean } | undefined {
  const text = localStorage.getItem(recoveryKey(saved, ownerId))
  if (!text) return
  let value: unknown
  try { value = JSON.parse(text) } catch { return }
  if (!isLocalDraft(value) || value.projectId !== saved.projectId || value.sourceVersion !== saved.sourceVersion || value.normalizationVersion !== saved.normalizationVersion) return
  return { draft: value, conflict: value.revision !== saved.revision }
}
