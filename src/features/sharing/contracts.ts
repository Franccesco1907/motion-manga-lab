export interface OwnerShare { id: string; snapshotId: string; snapshotRevision: number; name: string; createdAt: string; revision: number; rightsConfirmed: true; rightsConfirmedAt: string; attribution: string }
export interface ShareCreation { share: OwnerShare; token: string; path: string }
export const SHARE_VIDEO_MIME = { WEBM: 'video/webm', MP4: 'video/mp4' } as const
export type ShareVideoMime = (typeof SHARE_VIDEO_MIME)[keyof typeof SHARE_VIDEO_MIME]
export interface SharedPage { index: number; name: string; width: number; height: number; duration: number; fps: number; posterPath: string; videoPath: string; videoMime: ShareVideoMime }
export interface SharedReading { name: string; revision: number; attribution: string; pages: SharedPage[] }
