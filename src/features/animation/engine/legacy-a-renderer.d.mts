export interface LegacyMotion { type: string; anchor: number[]; dx: number; dy: number; angle: number; start: number; duration: number; cycles: number; endState: string; easing: string; period?: number; pause?: number; wristInfluence?: number }
export interface LegacyRegion { id: string; maskPath: string; motion: LegacyMotion; mask: Uint8Array; eraseMask?: Uint8Array; patchHint?: { dx: number; dy: number } }
export interface LegacyProject { sourcePath: string; duration: number; fps: number; regions: LegacyRegion[] }
export interface LegacyContext { source: Buffer; width: number; height: number; regions: LegacyRegion[]; protect: Uint8Array; support: Uint8Array }
export function validateProject(project: LegacyProject): LegacyProject
export function preparePixels(input: { source: Buffer; width: number; height: number; regions: LegacyRegion[]; protectMasks?: Uint8Array[]; foregroundMasks?: Uint8Array[] }): LegacyContext
export function renderFrame(ctx: LegacyContext, time: number, options?: { static?: boolean }): Buffer
