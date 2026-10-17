import { LOCAL_DRAFT_SCHEMA, type LocalDraft, type NormalizedPoint, type RawMotion } from './contracts'
import { finiteRaw, selectMotion, updateRegion } from './draft-editing'

export const EDITOR_PRESET = { SWAY: 'rotate', PULSE: 'scale', MOVE: 'translate' } as const
export type EditorPreset = (typeof EDITOR_PRESET)[keyof typeof EDITOR_PRESET]
export const PRESET_LABELS = { rotate: 'Rotate / sway', scale: 'Pulse / scale', translate: 'Move' } as const
const rounded = (value: number) => String(Number(value.toFixed(6)))
const presetDuration = (scene: number, speed: number) => Math.min(scene, speed <= 1 ? 2 : speed >= 3 ? .6 : 1.2)
function sceneDuration(draft: LocalDraft) {
  const scene = finiteRaw(draft.duration)
  if (scene === undefined || scene < .12 || scene > 6) throw new Error('Scene duration must be 0.12 to 6 seconds to apply movement. Open Advanced to correct it; the raw value is kept.')
  return scene
}
export function isRepeatMovementEnabled(motion: RawMotion): boolean {
  const cycles = finiteRaw(motion.cycles), period = finiteRaw(motion.period)
  return motion.repeat === true || ((motion.type === 'rotate' || motion.type === 'scale') && period !== undefined && period > 0 && cycles !== undefined && Number.isInteger(cycles) && cycles > 1)
}
function repeatCycles(draft: LocalDraft, motion: RawMotion, period: number): string {
  const scene = sceneDuration(draft), start = finiteRaw(motion.start), duration = finiteRaw(motion.duration)
  const pause = motion.pause.trim() ? finiteRaw(motion.pause) : 0
  if (start === undefined || start < 0 || start > scene || duration === undefined || duration < .04 || duration > 6 || pause === undefined || pause < 0 || pause > 6 || !Number.isFinite(period) || period < .12 || period > 6) {
    throw new Error('Movement start, duration, period and pause must be valid. Open Advanced to correct them; raw values are kept.')
  }
  const cycles = Math.min(12, Math.floor((scene - start + 1e-6) / (period + pause)))
  if (cycles < 1 || start + duration > scene + 1e-6) throw new Error('One complete movement must fit after Movement start in this clip. Open Advanced to correct the timing; raw values are kept.')
  return String(cycles)
}
export function setRepeatMovement(draft: LocalDraft, id: string, enabled: boolean): LocalDraft {
  const region = draft.regions.find(part => part.id === id)
  if (!region || !currentPreset(draft, id)) throw new Error('Select Move, Rotate / sway or Pulse / scale before changing repetition.')
  const motion = region.motion
  const period = motion.type === 'translate' && !motion.repeat ? motion.duration : motion.period.trim() ? motion.period : motion.duration
  const cycles = enabled ? repeatCycles(draft, motion, finiteRaw(period) ?? NaN) : '1'
  return updateRegion(draft, id, part => ({ ...part, motion: { ...part.motion, repeat: enabled, cycles,
    ...(part.motion.type === 'translate' ? { period: enabled ? period : '', endState: enabled ? 'reset' : 'hold' } : enabled ? { period } : {}),
  } }))
}
export function setPresetSpeed(draft: LocalDraft, id: string, speed: number): LocalDraft {
  const region = draft.regions.find(part => part.id === id)
  if (!region || !currentPreset(draft, id)) throw new Error('Select a movement before changing Speed.')
  const repeat = isRepeatMovementEnabled(region.motion), duration = rounded(presetDuration(sceneDuration(draft), speed))
  const motion: RawMotion = { ...region.motion, duration, period: region.motion.type !== 'translate' || repeat ? duration : '', cycles: '1',
    ...(repeat ? { repeat: true } : {}),
  }
  if (repeat) motion.cycles = repeatCycles(draft, motion, Number(duration))
  return updateRegion(draft, id, part => ({ ...part, motion }))
}
export function applyPreset(draft: LocalDraft, id: string, preset: EditorPreset, intensity: number, speed: number, pivot?: NormalizedPoint, preserveDirection = false): LocalDraft {
  const scene = sceneDuration(draft)
  const region = draft.regions.find(part => part.id === id)
  if (!region) throw new Error('Select a part before choosing movement.')
  const x = pivot?.x ?? finiteRaw(region.motion.anchorX), y = pivot?.y ?? finiteRaw(region.motion.anchorY)
  if (x === undefined || y === undefined || x < 0 || x > 1 || y < 0 || y > 1) throw new Error('Set a valid pivot on the canvas or in Advanced before applying movement.')
  const amount = Math.max(0, Math.min(100, intensity)) / 100
  const duration = presetDuration(scene, speed), repeat = isRepeatMovementEnabled(region.motion)
  const dx = finiteRaw(region.motion.dx) ?? 0, dy = finiteRaw(region.motion.dy) ?? 0
  const distance = Math.hypot(dx, dy)
  const direction = preserveDirection && distance > 0 ? { x: dx / distance, y: dy / distance } : { x: 1, y: 0 }
  const angleSign = preserveDirection && Number(region.motion.angle) < 0 ? -1 : 1
  const scaleSign = preserveDirection && Number(region.motion.scale) < 1 ? -1 : 1
  const chosen = selectMotion(draft, id, preset)
  const next = updateRegion({ ...chosen, schemaVersion: preset === EDITOR_PRESET.PULSE ? LOCAL_DRAFT_SCHEMA.AFFINE : chosen.schemaVersion }, id, part => ({
    ...part,
    motion: { ...part.motion, type: preset, anchorX: rounded(x), anchorY: rounded(y),
      dx: preset === EDITOR_PRESET.MOVE ? rounded(.08 * amount * direction.x) : '0', dy: preset === EDITOR_PRESET.MOVE ? rounded(.08 * amount * direction.y) : '0',
      angle: preset === EDITOR_PRESET.SWAY ? rounded(15 * amount * angleSign) : '0',
      ...(preset === EDITOR_PRESET.PULSE ? { scale: rounded(1 + .15 * amount * scaleSign) } : {}),
      start: repeat ? part.motion.start : '0', duration: rounded(duration), cycles: '1', period: preset === EDITOR_PRESET.MOVE && !repeat ? '' : rounded(duration), pause: repeat ? part.motion.pause : '', wristInfluence: '', easing: 'smooth', endState: preset === EDITOR_PRESET.MOVE && !repeat ? 'hold' : 'reset',
      ...(repeat ? { repeat: true } : {}),
    },
  }))
  return repeat ? setRepeatMovement(next, id, true) : next
}
export function currentPreset(draft: LocalDraft, id: string): EditorPreset | undefined {
  const type = draft.regions.find(part => part.id === id)?.motion.type
  return Object.values(EDITOR_PRESET).find(preset => preset === type)
}
