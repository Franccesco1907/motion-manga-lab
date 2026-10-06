import { lstat,readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { LocalProjectError } from '../local-projects/store.ts'
export interface OwnerStorageLimits { maxProjects?:number;maxBytes?:number }
const exhausted=()=>new LocalProjectError('owner_quota_exceeded','Account storage limit reached. Saved work is unchanged; ask the operator to review retention or increase the configured limit.',409)
const unavailable=()=>new LocalProjectError('storage_unavailable','The private storage inventory is unavailable.',503)
function configured(name:string,fallback:number,max:number){const raw=process.env[name];if(raw===undefined)return fallback;if(!/^\d+$/.test(raw))throw new Error(`${name} requires a positive decimal integer.`);const value=Number(raw);if(!Number.isSafeInteger(value)||value<1||value>max)throw new Error(`${name} exceeds the bounded operator setting.`);return value}
export class StorageAdmission {
 readonly maxProjects:number
 readonly maxBytes:number
 private held=new Map<string,number>()
 private heldProjects=new Map<string,number>()
 private pending:Promise<void>=Promise.resolve()
 constructor(limits:OwnerStorageLimits={}){this.maxProjects=limits.maxProjects??configured('MOTION_MANGA_OWNER_MAX_PROJECTS',100,1000);this.maxBytes=limits.maxBytes??configured('MOTION_MANGA_OWNER_MAX_BYTES',256*1024*1024,4*1024**3)}
 private async inventory(root:string){
  let count=0,bytes=0,projects=0
  const walk=async(path:string,top=false):Promise<void>=>{
   const stat=await lstat(path).catch(error=>{if(error?.code==='ENOENT'&&top)return undefined;throw unavailable()});if(!stat)return
   if(stat.isSymbolicLink())throw unavailable()
   if(stat.isFile()){bytes+=stat.size;return}
   if(!stat.isDirectory())throw unavailable()
   for(const entry of await readdir(path,{withFileTypes:true})){if(++count>10000)throw exhausted();if(top&&entry.isDirectory()&&/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(entry.name))projects++;await walk(join(path,entry.name))}
  }
  await walk(root,true);return{bytes,projects}
 }
 async reserve(root:string,bytes:number,newProjects=0):Promise<()=>void>{
  const previous=this.pending;let unlock=()=>{};this.pending=new Promise<void>(resolve=>{unlock=resolve});await previous
  try{
   const stored=await this.inventory(root),held=this.held.get(root)??0
   if(stored.projects+(this.heldProjects.get(root)??0)+newProjects>this.maxProjects||stored.bytes+held+bytes>this.maxBytes)throw exhausted()
   this.held.set(root,held+bytes);this.heldProjects.set(root,(this.heldProjects.get(root)??0)+newProjects);let released=false
   return()=>{if(released)return;released=true;const next=(this.held.get(root)??0)-bytes;if(next>0)this.held.set(root,next);else this.held.delete(root);const projects=(this.heldProjects.get(root)??0)-newProjects;if(projects>0)this.heldProjects.set(root,projects);else this.heldProjects.delete(root)}
  }finally{unlock()}
 }
}
