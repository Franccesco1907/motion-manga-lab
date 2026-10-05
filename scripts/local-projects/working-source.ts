import { createHash } from 'node:crypto'
import sharp from 'sharp'
export const WORKING_SPACE = 'normalized-working-image-v1' as const
export interface WorkingSource { png: Buffer; pixels: Buffer; width: number; height: number; sourceVersion: string; coordinateSpace: typeof WORKING_SPACE }
export async function createWorkingSource(original: Buffer): Promise<WorkingSource> {
  const copy = Buffer.from(original)
  const { data: pixels, info } = await sharp(copy, { limitInputPixels: 20_000_000, failOn: 'warning' }).rotate().resize({ width: 1280, height: 1280, fit: 'inside', withoutEnlargement: true }).flatten({ background: '#ffffff' }).toColourspace('srgb').removeAlpha().raw().toBuffer({ resolveWithObject: true })
  if (info.width < 2 || info.height < 2 || info.channels !== 3) throw new Error('Working image minimum edge is 2 and requires RGB pixels')
  const png = await sharp(pixels, { raw: { width: info.width, height: info.height, channels: 3 } }).png({ compressionLevel: 9, adaptiveFiltering: false }).toBuffer()
  return { png, pixels, width: info.width, height: info.height, sourceVersion: createHash('sha256').update(copy).digest('hex'), coordinateSpace: WORKING_SPACE }
}
