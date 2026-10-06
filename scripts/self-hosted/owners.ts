import { join } from 'node:path'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { LocalProjectStore, LocalProjectError } from '../local-projects/store.ts'
import type { LocalRenderService } from '../local-projects/render-service.ts'
import type { LocalAssistanceService } from '../local-projects/assistance.ts'
import { AccountRenderer,AccountAssistance } from './account-workers.ts'
import { StorageAdmission } from './quota.ts'
import { EditingStore } from '../local-projects/editing-store.ts'
import { createWorkingSource } from '../local-projects/working-source.ts'
import { createLocalProjectsHandler, type LocalBoundary } from '../local-projects/http.ts'
export interface OwnerServices {
  originals: LocalProjectStore
  editing: EditingStore
  renderer: LocalRenderService
  assistance: LocalAssistanceService
  handler: (req: IncomingMessage, res: ServerResponse) => Promise<void>
}
/** A cached bundle is essential: a new renderer per request would recover a live job as interrupted. */
export class OwnerServicesRegistry {
  private root: string
  private bundles = new Map<string, OwnerServices>()
  readonly quota: StorageAdmission
  private boundary: (boundary: LocalBoundary) => void
  constructor(root: string, boundary: (boundary: LocalBoundary) => void,quota=new StorageAdmission()) { this.root = root; this.boundary = boundary;this.quota=quota }
  get(ownerId: string): OwnerServices {
    if (!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(ownerId)) throw new LocalProjectError('authentication_required', 'Sign in to your workspace.', 401)
    const cached = this.bundles.get(ownerId)
    if (cached) return cached
    if (this.bundles.size >= 100) throw new LocalProjectError('account_limit', 'The bounded owner service limit has been reached.', 503)
    const root = join(this.root, 'owners', ownerId), originals = new LocalProjectStore(root), editing = new EditingStore(originals), assistance = new AccountAssistance(root,this.quota)
    const renderer = new AccountRenderer(root,this.quota,assistance)
    const handler = createLocalProjectsHandler(originals, { editing, renderer, assistance, workingSource: createWorkingSource }, this.boundary)
    const bundle = { originals, editing, renderer, assistance, handler }
    this.bundles.set(ownerId, bundle)
    return bundle
  }
  async shutdown() { await Promise.all([...this.bundles.values()].flatMap(owner => [owner.renderer.shutdown(), owner.assistance.shutdown()])) }
}
