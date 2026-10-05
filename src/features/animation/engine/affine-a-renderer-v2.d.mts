import type { LegacyContext, LegacyMotion, LegacyProject, LegacyRegion } from './legacy-a-renderer.mjs'
export interface AffineMotion extends LegacyMotion { scale?: number; scaleX?: number; scaleY?: number }
export interface AffineRegion extends LegacyRegion { motion: AffineMotion }
export interface AffineProject extends LegacyProject { regions: AffineRegion[] }
export interface AffineContext extends LegacyContext { regions: AffineRegion[] }
export interface AffinePose { dx: number; dy: number; angle: number; opacity: number; scaleX: number; scaleY: number }
export function validateProject(project: AffineProject): AffineProject
export function motionPose(motion: AffineMotion, time: number): AffinePose
export function preparePixels(input: { source: Buffer; width: number; height: number; regions: AffineRegion[]; protectMasks?: Uint8Array[]; foregroundMasks?: Uint8Array[] }): AffineContext
export function renderFrame(ctx: AffineContext, time: number, options?: { static?: boolean }): Buffer
