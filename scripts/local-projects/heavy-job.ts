import { LocalProjectError } from './store.ts'
/** Render and model workers share admission; no queue silently launches a second heavy job. */
export class HeavyJobGate {
  private active?: string
  acquire(id:string) { if(this.active) throw new LocalProjectError('busy','Another local render or assistance job is running.',409); this.active=id }
  release(id:string) { if(this.active===id) this.active=undefined }
}
export const localHeavyJobs = new HeavyJobGate()
