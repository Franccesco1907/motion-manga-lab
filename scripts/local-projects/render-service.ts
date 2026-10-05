import { createHash, randomUUID } from 'node:crypto'
import { spawn, type ChildProcess } from 'node:child_process'
import { lstat, mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { LocalDraft, LocalRenderArtifact, LocalRenderJob } from '../../src/features/local-projects/contracts.ts'
import { LocalProjectError } from './store.ts'
import { createWorkingSource } from './working-source.ts'
import { prepareDraft } from './masks.ts'
import { localHeavyJobs, type HeavyJobGate } from './heavy-job.ts'
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/
const missing=()=>new LocalProjectError('not_found','The immutable local artifact or job is unavailable.',404)
interface RenderOptions { timeoutMs?:number;gate?:HeavyJobGate;readMask?:(projectId:string,maskId:string,sourceVersion:string)=>Promise<{pixels:Uint8Array;width:number;height:number}> }
interface ActiveRender { process?: ChildProcess; promise:Promise<void>; cancelled:boolean }
export class LocalRenderService {
 readonly root:string
 private active=new Map<string,ActiveRender>()
 private initialized?:Promise<void>
 private gate:HeavyJobGate
 private options:RenderOptions
 constructor(root:string,options:RenderOptions={}){this.root=resolve(root);this.options=options;this.gate=options.gate??localHeavyJobs}
 private folder(id:string){if(!UUID.test(id)) throw missing();return join(this.root,'jobs',id)}
 private async persist(job:LocalRenderJob){const folder=this.folder(job.id);await writeFile(join(folder,'job.partial.json'),JSON.stringify(job),{mode:0o600});await rename(join(folder,'job.partial.json'),join(folder,'job.json'))}
 private async initialize(){
  this.initialized??=(async()=>{
   await mkdir(join(this.root,'jobs'),{recursive:true,mode:0o700})
   for(const p of [this.root,join(this.root,'jobs')]) {const s=await lstat(p);if(!s.isDirectory()||s.isSymbolicLink()||(s.mode&0o077)!==0) throw new LocalProjectError('storage_unavailable','Render storage is unavailable.',503)}
   for(const id of await readdir(join(this.root,'jobs'))) if(UUID.test(id)) {
    try { const job=await this.readJob(id);if(job.status==='queued'||job.status==='running'){job.status='failed';job.error={code:'interrupted',message:'Local process stopped before completion. No automatic retry.'};await this.clean(id);await this.persist(job)} }catch{/* Corrupt/partial records are never published. */}
   }
  })();await this.initialized
 }
 private async readJob(id:string):Promise<LocalRenderJob>{
  const folder=this.folder(id)
  for(const p of [folder,join(folder,'job.json')]) {const s=await lstat(p).catch(()=>{throw missing()});if(s.isSymbolicLink()||(p===folder?!s.isDirectory():!s.isFile()||s.size>65536)) throw missing()}
  const value:unknown=JSON.parse(await readFile(join(folder,'job.json'),'utf8'))
  if(!value||typeof value!=='object'||!('id'in value)||value.id!==id||!('projectId'in value)||typeof value.projectId!=='string')throw missing()
  return value as LocalRenderJob
 }
 private async clean(id:string){const folder=this.folder(id);for(const name of await readdir(folder))if(name!=='job.json')await rm(join(folder,name),{recursive:true,force:true})}
 async start(projectId:string,draft:LocalDraft,original:Buffer):Promise<LocalRenderJob>{
  await this.initialize()
  if(original.length>10*1024*1024) throw new LocalProjectError('invalid_render','Original exceeds the bounded byte limit.',422)
  if(draft.projectId!==projectId||!Number.isInteger(draft.revision)||draft.revision<0) throw new LocalProjectError('invalid_render','Draft does not match this project.',422)
  const modelMasks:Record<string,Uint8Array>={}
  try { const working=await createWorkingSource(original);for(const region of draft.regions)if(region.maskId){if(!this.options.readMask)throw new Error('Model masks unavailable');const mask=await this.options.readMask(projectId,region.maskId,draft.sourceVersion);if(mask.width!==working.width||mask.height!==working.height)throw new Error('Model mask dimensions mismatch');modelMasks[region.maskId]=mask.pixels}prepareDraft(working,draft,modelMasks,true) }catch(error){throw new LocalProjectError('invalid_render',error instanceof Error?error.message:'Invalid local render request.',422)}
  const id=randomUUID();this.gate.acquire(id)
  const job:LocalRenderJob={id,projectId,sourceVersion:draft.sourceVersion,draftRevision:draft.revision,status:'queued'}
  try{
   const folder=this.folder(id);await mkdir(folder,{mode:0o700});await this.persist(job)
   await writeFile(join(folder,'original'),original,{flag:'wx',mode:0o600});await writeFile(join(folder,'draft.json'),JSON.stringify(draft),{flag:'wx',mode:0o600})
   for(const [maskId,pixels]of Object.entries(modelMasks)){if(!UUID.test(maskId))throw new LocalProjectError('invalid_render','Invalid opaque mask identifier.',422);await writeFile(join(folder,`mask-${maskId}`),pixels,{flag:'wx',mode:0o600})}
   const active:ActiveRender={promise:Promise.resolve(),cancelled:false};this.active.set(id,active)
   active.promise=this.execute(job,active).finally(()=>{this.gate.release(id);this.active.delete(id)})
   void active.promise.catch(()=>{})
   return {...job}
  }catch(error){this.gate.release(id);throw error}
 }
 private async execute(job:LocalRenderJob,active:ActiveRender){
  const folder=this.folder(job.id)
  let timeout=false
  try{
   job.status='running';await this.persist(job)
   if(active.cancelled)throw new Error('Cancelled')
   const child=spawn(process.execPath,['--max-old-space-size=256','--experimental-strip-types',fileURLToPath(new URL('./render-worker.ts',import.meta.url)),folder],{stdio:['ignore','ignore','pipe'],detached:true})
   active.process=child
   const timer=setTimeout(()=>{timeout=true;this.kill(child)},this.options.timeoutMs??125_000)
   const done=new Promise<void>((resolve,reject)=>{child.once('error',reject);child.once('close',code=>{clearTimeout(timer);if(code===0)resolve();else reject(new Error('Render worker failed'))})})
   child.stderr?.on('data',()=>{/* Runtime exception/path details remain private. */})
   if(active.cancelled)this.kill(child)
   await done
   if(active.cancelled)throw new Error('Cancelled')
   const result=JSON.parse(await readFile(join(folder,'result.json'),'utf8')) as {width:number;height:number;duration:number;fps:number;frames:number;sourceVersion:string}
   if(result.sourceVersion!==job.sourceVersion||!Number.isInteger(result.frames)||result.frames<1||result.frames>144)throw new Error('Invalid worker output')
   job.artifact={id:job.id,projectId:job.projectId,sourceVersion:job.sourceVersion,draftRevision:job.draftRevision,normalizationVersion:'working-image-v1',width:result.width,height:result.height,duration:result.duration,fps:result.fps,createdAt:new Date().toISOString(),videoMime:'video/webm'}
   // Remove private worker inputs before publishing the atomic completed record.
   await rm(join(folder,'original'),{force:true});await rm(join(folder,'draft.json'),{force:true});await rm(join(folder,'result.json'),{force:true});for(const name of await readdir(folder))if(name.startsWith('mask-'))await rm(join(folder,name),{force:true})
   const assets={poster:createHash('sha256').update(await readFile(join(folder,'poster.png'))).digest('hex'),video:createHash('sha256').update(await readFile(join(folder,'video.webm'))).digest('hex')}
   await writeFile(join(folder,'assets.json'),JSON.stringify(assets),{flag:'wx',mode:0o600})
   job.status='completed';await this.persist(job)
  }catch{
   job.status=active.cancelled?'cancelled':'failed';delete job.artifact
   if(!active.cancelled)job.error={code:timeout?'timeout':'render_failed',message:timeout?'Render exceeded the bounded local time limit. No automatic retry.':'Local render failed. Check the regions and try explicitly again.'}
   await this.clean(job.id);await this.persist(job)
  }
 }
 private kill(child:ChildProcess){if(!child.pid)return;try{process.kill(-child.pid,'SIGTERM')}catch{/* Already exited. */}const escalation=setTimeout(()=>{try{process.kill(-child.pid!,'SIGKILL')}catch{/* Already exited. */}},1000);escalation.unref();child.once('close',()=>clearTimeout(escalation))}
 async get(projectId:string,jobId:string):Promise<LocalRenderJob>{await this.initialize();const job=await this.readJob(jobId);if(job.projectId!==projectId)throw missing();return job}
 async cancel(projectId:string,jobId:string):Promise<LocalRenderJob>{const job=await this.get(projectId,jobId);const active=this.active.get(jobId);if(active&&(job.status==='queued'||job.status==='running')){active.cancelled=true;if(active.process)this.kill(active.process);await active.promise;return this.get(projectId,jobId)}return job}
 async wait(jobId:string):Promise<void>{await this.active.get(jobId)?.promise}
 async latestCompleted(projectId:string):Promise<LocalRenderArtifact|undefined>{await this.initialize();const artifacts:LocalRenderArtifact[]=[];for(const id of await readdir(join(this.root,'jobs')))if(UUID.test(id)){try{const job=await this.get(projectId,id);if(job.status==='completed'&&job.artifact)artifacts.push(job.artifact)}catch{/* Other owner/invalid record. */}}return artifacts.sort((a,b)=>b.createdAt.localeCompare(a.createdAt)||b.id.localeCompare(a.id))[0]}
 async readAsset(projectId:string,artifactId:string,kind:'poster'|'video'):Promise<{bytes:Buffer;mimeType:string}>{const job=await this.get(projectId,artifactId);if(job.status!=='completed'||!job.artifact||!['poster','video'].includes(kind))throw missing();const path=join(this.folder(artifactId),kind==='poster'?'poster.png':'video.webm');const info=await lstat(path).catch(()=>{throw missing()});if(!info.isFile()||info.isSymbolicLink()||info.size>32*1024*1024)throw missing();const hashesPath=join(this.folder(artifactId),'assets.json');const hashesInfo=await lstat(hashesPath).catch(()=>{throw missing()});if(!hashesInfo.isFile()||hashesInfo.isSymbolicLink()||hashesInfo.size>1024)throw missing();const hashes=JSON.parse(await readFile(hashesPath,'utf8')) as Record<string,string>;const bytes=await readFile(path);if(createHash('sha256').update(bytes).digest('hex')!==hashes[kind])throw missing();return{bytes,mimeType:kind==='poster'?'image/png':'video/webm'}}
 async artifactDigest(projectId:string,artifactId:string){return createHash('sha256').update((await this.readAsset(projectId,artifactId,'video')).bytes).digest('hex')}
 async shutdown(){await Promise.all([...this.active.entries()].map(async([id])=>{const j=await this.readJob(id);await this.cancel(j.projectId,id)}))}
}
