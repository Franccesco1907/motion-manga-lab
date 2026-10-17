import { LOCAL_DRAFT_SCHEMA, type LocalDraft, type NormalizedPoint } from './contracts'
import { finiteRaw, selectMotion, updateRegion } from './draft-editing'

export const EDITOR_PRESET = { SWAY: 'rotate', PULSE: 'scale', MOVE: 'translate' } as const
export type EditorPreset = (typeof EDITOR_PRESET)[keyof typeof EDITOR_PRESET]
export const PRESET_LABELS = { rotate: 'Rotate / sway', scale: 'Pulse / scale', translate: 'Move' } as const
const rounded = (value: number) => String(Number(value.toFixed(6)))
export function applyPreset(draft: LocalDraft, id: string, preset: EditorPreset, intensity: number, speed: number, pivot?: NormalizedPoint, preserveDirection = false): LocalDraft {
  const scene = finiteRaw(draft.duration)
  if (scene === undefined || scene < .12 || scene > 6) throw new Error('Scene duration must be 0.12 to 6 seconds to apply a preset. Open Advanced to correct it; the raw value is kept.')
  const region = draft.regions.find(part => part.id === id)
  if (!region) throw new Error('Select a part before choosing movement.')
  const x = pivot?.x ?? finiteRaw(region.motion.anchorX), y = pivot?.y ?? finiteRaw(region.motion.anchorY)
  if (x === undefined || y === undefined || x < 0 || x > 1 || y < 0 || y > 1) throw new Error('Set a valid pivot on the canvas or in Advanced before applying movement.')
  const amount = Math.max(0, Math.min(100, intensity)) / 100
  const duration = Math.min(scene, speed <= 1 ? 2 : speed >= 3 ? .6 : 1.2)
  const dx = finiteRaw(region.motion.dx) ?? 0, dy = finiteRaw(region.motion.dy) ?? 0
  const distance = Math.hypot(dx, dy)
  const direction = preserveDirection && distance > 0 ? { x: dx / distance, y: dy / distance } : { x: 1, y: 0 }
  const angleSign = preserveDirection && Number(region.motion.angle) < 0 ? -1 : 1
  const scaleSign = preserveDirection && Number(region.motion.scale) < 1 ? -1 : 1
  const chosen = selectMotion(draft, id, preset)
  return updateRegion({ ...chosen, schemaVersion: preset === EDITOR_PRESET.PULSE ? LOCAL_DRAFT_SCHEMA.AFFINE : chosen.schemaVersion }, id, part => ({
    ...part,
    motion: { ...part.motion, type: preset, anchorX: rounded(x), anchorY: rounded(y),
      dx: preset === EDITOR_PRESET.MOVE ? rounded(.08 * amount * direction.x) : '0', dy: preset === EDITOR_PRESET.MOVE ? rounded(.08 * amount * direction.y) : '0',
      angle: preset === EDITOR_PRESET.SWAY ? rounded(15 * amount * angleSign) : '0',
      ...(preset === EDITOR_PRESET.PULSE ? { scale: rounded(1 + .15 * amount * scaleSign) } : {}),
      start: '0', duration: rounded(duration), cycles: '1', period: preset === EDITOR_PRESET.MOVE ? '' : rounded(duration), pause: '', wristInfluence: '', easing: 'smooth', endState: preset === EDITOR_PRESET.MOVE ? 'hold' : 'reset',
    },
  }))
}
export function currentPreset(draft: LocalDraft, id: string): EditorPreset | undefined {
  const type = draft.regions.find(part => part.id === id)?.motion.type
  return Object.values(EDITOR_PRESET).find(preset => preset === type)
}
