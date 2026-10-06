import { LocalRenderService } from '../local-projects/render-service.ts'
import { LocalAssistanceService } from '../local-projects/assistance.ts'
import type { StorageAdmission } from './quota.ts'
/** Conservative leases cover partial inputs, immutable output and model caches until the owned job exits. */
export class AccountRenderer extends LocalRenderService {
 private quota:StorageAdmission
 constructor(root:string,quota:StorageAdmission,assistance:LocalAssistanceService){super(root,{readMask:(...args)=>assistance.readMask(...args)});this.quota=quota}
 override async start(...args:Parameters<LocalRenderService['start']>){const release=await this.quota.reserve(this.root,96*1024*1024);try{const job=await super.start(...args);void this.wait(job.id).then(release,release);return job}catch(error){release();throw error}}
}
export class AccountAssistance extends LocalAssistanceService {
 private quota:StorageAdmission
 private ownerRoot:string
 constructor(root:string,quota:StorageAdmission){super(root);this.ownerRoot=root;this.quota=quota}
 override async start(...args:Parameters<LocalAssistanceService['start']>){const release=await this.quota.reserve(this.ownerRoot,64*1024*1024);try{const job=await super.start(...args);void this.wait(job.id).then(release,release);return job}catch(error){release();throw error}}
}
