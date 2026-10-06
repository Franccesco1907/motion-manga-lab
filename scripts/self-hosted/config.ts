import { fileURLToPath } from 'node:url'
import { assertPrivateStorage } from './storage-boundary.ts'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
export function operatorDataRoot() { const root=resolve(process.env.MOTION_MANGA_ACCOUNT_DATA ?? join(homedir(), '.local/share/motion-manga-lab/self-hosted-v1'));assertPrivateStorage(root,fileURLToPath(new URL('../../../dist/',import.meta.url)));return root }
