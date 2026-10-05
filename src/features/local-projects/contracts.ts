export const LOCAL_IMAGE_MIME = {
  PNG: 'image/png',
  JPEG: 'image/jpeg',
  WEBP: 'image/webp',
} as const

export type LocalImageMime =
  (typeof LOCAL_IMAGE_MIME)[keyof typeof LOCAL_IMAGE_MIME]

export interface LocalProject {
  id: string
  name: string
  mimeType: LocalImageMime
  width: number
  height: number
  byteLength: number
  createdAt: string
}

export const LOCAL_MOTION = { STATIC: 'static', TRANSLATE: 'translate', ROTATE: 'rotate', REVEAL: 'reveal' } as const
export type LocalMotionType = (typeof LOCAL_MOTION)[keyof typeof LOCAL_MOTION]
export const LOCAL_AFFINE_MOTION = { ...LOCAL_MOTION, SCALE: 'scale', STRETCH: 'stretch' } as const
export type LocalAffineMotionType = (typeof LOCAL_AFFINE_MOTION)[keyof typeof LOCAL_AFFINE_MOTION]
export const LOCAL_DRAFT_SCHEMA = { LEGACY: 1, AFFINE: 2 } as const
export type LocalDraftSchemaVersion = (typeof LOCAL_DRAFT_SCHEMA)[keyof typeof LOCAL_DRAFT_SCHEMA]
export const LOCAL_RENDERER_VERSION = { LEGACY: 'legacy-a-v1', AFFINE: 'affine-a-v2' } as const
export type LocalRendererVersion = (typeof LOCAL_RENDERER_VERSION)[keyof typeof LOCAL_RENDERER_VERSION]
export const LOCAL_ROLE = { ACTOR: 'actor', PROTECTED: 'protected', FOREGROUND: 'foreground' } as const
export type LocalRegionRole = (typeof LOCAL_ROLE)[keyof typeof LOCAL_ROLE]
export const LOCAL_STROKE = { ADD: 'add', ERASE: 'erase' } as const
export type LocalStrokeMode = (typeof LOCAL_STROKE)[keyof typeof LOCAL_STROKE]
export const LOCAL_END = { HOLD: 'hold', RESET: 'reset' } as const
export type LocalEndState = (typeof LOCAL_END)[keyof typeof LOCAL_END]
export const LOCAL_EASING = { LINEAR: 'linear', SMOOTH: 'smooth', EASE_IN: 'ease-in' } as const
export type LocalEasing = (typeof LOCAL_EASING)[keyof typeof LOCAL_EASING]
export const LOCAL_JOB_STATUS = { QUEUED: 'queued', RUNNING: 'running', COMPLETED: 'completed', FAILED: 'failed', CANCELLED: 'cancelled' } as const
export type LocalJobStatus = (typeof LOCAL_JOB_STATUS)[keyof typeof LOCAL_JOB_STATUS]
export const LOCAL_VIDEO_MIME = { MP4: 'video/mp4', WEBM: 'video/webm' } as const
export type LocalVideoMime = (typeof LOCAL_VIDEO_MIME)[keyof typeof LOCAL_VIDEO_MIME]
export const LOCAL_ASSISTANCE_MODE = { SUGGEST: 'suggest', REFINE: 'refine' } as const
export type LocalAssistanceMode = (typeof LOCAL_ASSISTANCE_MODE)[keyof typeof LOCAL_ASSISTANCE_MODE]

export interface NormalizedPoint { x: number; y: number }
export interface RawMaskStroke { mode: LocalStrokeMode; radius: string; points: NormalizedPoint[] }
export interface RawSelection { x: string; y: string; width: string; height: string; strokes: RawMaskStroke[] }
export interface RawMotion {
  type: LocalAffineMotionType
  anchorX: string
  anchorY: string
  dx: string
  dy: string
  angle: string
  start: string
  duration: string
  cycles: string
  period: string
  pause: string
  wristInfluence: string
  endState: LocalEndState
  easing: LocalEasing
  scale?: string
  scaleX?: string
  scaleY?: string
}
export interface RawRegion { id: string; label: string; role: LocalRegionRole; selection: RawSelection; motion: RawMotion; maskId?: string }
export interface LocalDraft {
  schemaVersion: LocalDraftSchemaVersion
  projectId: string
  sourceVersion: string
  normalizationVersion: 'working-image-v1'
  revision: number
  duration: string
  fps: string
  regions: RawRegion[]
}
export interface LocalChapter { id: string; name: string; pageIds: string[]; revision: number; createdAt: string; updatedAt: string }
export interface LocalRenderArtifact {
  id: string
  projectId: string
  sourceVersion: string
  draftRevision: number
  normalizationVersion: 'working-image-v1'
  width: number
  height: number
  duration: number
  fps: number
  createdAt: string
  videoMime: LocalVideoMime
  rendererVersion?: LocalRendererVersion
  draftSchemaVersion?: LocalDraftSchemaVersion
}
export interface LocalFailure { code: string; message: string }
export interface LocalRenderJob {
  id: string
  projectId: string
  sourceVersion: string
  draftRevision: number
  status: LocalJobStatus
  error?: LocalFailure
  artifact?: LocalRenderArtifact
  rendererVersion?: LocalRendererVersion
  draftSchemaVersion?: LocalDraftSchemaVersion
}
export interface LocalSnapshotPage { projectId: string; name: string; artifact: LocalRenderArtifact }
export interface LocalSnapshot {
  id: string
  chapterId: string
  name: string
  revision: number
  createdAt: string
  pages: LocalSnapshotPage[]
}
export interface LocalAssistanceCapability { available: boolean; reason: string }
export interface LocalAssistanceCapabilities { suggestRegions: LocalAssistanceCapability; refineRegion: LocalAssistanceCapability }
export interface LocalAssistanceJob {
  id: string
  projectId: string
  sourceVersion: string
  draftRevision: number
  mode: LocalAssistanceMode
  status: LocalJobStatus
  reviewRequired: true
  error?: LocalFailure
  regions?: RawRegion[]
  maskId?: string
  regionId?: string
}
