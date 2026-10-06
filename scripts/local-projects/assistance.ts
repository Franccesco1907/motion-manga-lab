import { randomUUID,createHash } from 'node:crypto'
import { spawn,execFile,type ChildProcess } from 'node:child_process'
import { promisify } from 'node:util'
import { access,lstat,mkdir,readFile,readdir,rename,rm,writeFile } from 'node:fs/promises'
import { constants } from 'node:fs'
import { join,resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'
import type { LocalDraft,RawRegion,LocalAssistanceJob,LocalAssistanceCapabilities } from '../../src/features/local-projects/contracts.ts'
import { LocalProjectError } from './store.ts'
import { createWorkingSource } from './working-source.ts'
import { rasterizeSelection,rawNumber } from './masks.ts'
import { localHeavyJobs,type HeavyJobGate } from './heavy-job.ts'
const exec=promisify(execFile)
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/
const MODEL_MODES={SUGGEST:'suggest',REFINE:'refine'} as const
type Mode=(typeof MODEL_MODES)[keyof typeof MODEL_MODES]
interface Options { modelProject?:string;gate?:HeavyJobGate;timeoutMs?:number }
interface Attempt { process?:ChildProcess;promise:Promise<void>;cancelled:boolean;failure?:string }
interface Prediction { id:string;label:string;kind:string;bbox:number[];maskPath?:string;maskSha256?:string }
interface Report { status:string;source:{sha256:string;width:number;height:number};regions:Prediction[];publicFailure?:{code:string} }
const missing=()=>new LocalProjectError('not_found','The immutable local model mask or job is unavailable.',404)
export class LocalAssistanceService {
 readonly root:string
 readonly modelProject:string
 private options:Options
 private active=new Map<string,Attempt>()
 private initialized?:Promise<void>
 private gate:HeavyJobGate
 constructor(root:string,options:Options={}){this.root=resolve(root,'assistance');this.modelProject=resolve(options.modelProject??process.env.MOTION_MANGA_MODEL_PROJECT??fileURLToPath(new URL('../../',import.meta.url)));this.options=options;this.gate=options.gate??localHeavyJobs}
 private folder(id:string){if(!UUID.test(id))throw missing();return join(this.root,'jobs',id)}
 private async persist(job:LocalAssistanceJob){const folder=this.folder(job.id);await writeFile(join(folder,'job.partial.json'),JSON.stringify(job),{mode:0o600});await rename(join(folder,'job.partial.json'),join(folder,'job.json'))}
 private async clean(id:string){for(const name of await readdir(this.folder(id)))if(name!=='job.json')await rm(join(this.folder(id),name),{recursive:true,force:true})}
 private async initialize(){this.initialized??=(async()=>{await mkdir(join(this.root,'jobs'),{recursive:true,mode:0o700});await mkdir(join(this.root,'projects'),{recursive:true,mode:0o700});for(const p of [this.root,join(this.root,'jobs'),join(this.root,'projects')]){const s=await lstat(p);if(!s.isDirectory()||s.isSymbolicLink()||(s.mode&0o077)!==0)throw new LocalProjectError('storage_unavailable','Local model storage unavailable.',503)}for(const id of await readdir(join(this.root,'jobs')))if(UUID.test(id)){try{const j=await this.record(id);if(j.status==='queued'||j.status==='running'){j.status='failed';j.error={code:'interrupted',message:'Local inference interrupted. No automatic retry.'};await this.clean(id);await this.persist(j)}}catch{/* Invalid artifacts are not published. */}}})();await this.initialized}
 private async record(id:string):Promise<LocalAssistanceJob>{const folder=this.folder(id);for(const p of [folder,join(folder,'job.json')]){const s=await lstat(p).catch(()=>{throw missing()});if(s.isSymbolicLink()||(p===folder?!s.isDirectory():!s.isFile()||s.size>65536))throw missing()}const value:unknown=JSON.parse(await readFile(join(folder,'job.json'),'utf8'));if(!value||typeof value!=='object'||!('id'in value)||value.id!==id||!('projectId'in value)||typeof value.projectId!=='string')throw missing();return value as LocalAssistanceJob}
 private runtime(mode:Mode){return join(this.modelProject,'experiments',mode==='suggest'?'magi-evaluation':'segmentation-poc','runtime','.venv','bin','python')}
 async capabilities():Promise<LocalAssistanceCapabilities>{
  const check=async(mode:Mode)=>{try{
   await access(this.runtime(mode),constants.X_OK)
   if(mode==='suggest') {const base=join(this.modelProject,'experiments/magi-evaluation');const gate=JSON.parse(await readFile(join(base,'audit/execution-gate.json'),'utf8')) as {v3:{revision:string;code_gate:string}};if(gate.v3.revision!=='49c73a225122d53adbaa26d53868be81a57706e2'||!gate.v3.code_gate.startsWith('GO'))throw new Error('Audit gate unavailable');await access(join(base,'model-cache/magiv3',gate.v3.revision));await access(join(base,'audit/source-manifest.json'));await access(join(base,'model-cache/download-manifest.json'))}
   else {const base=join(this.modelProject,'experiments/segmentation-poc');await access(join(base,'model-cache/ee5bba1d82bb8749febdf90f45e84b687142ba03'));await access(join(base,'audit/model-manifest.json'))}
   return {available:true,reason:'Pinned local runtime present. Explicit inference verifies hashes, GPU and resource headroom; results require human review.'}
  }catch{return {available:false,reason:'Audited local runtime, gate or pinned model assets are missing. No download or fallback will run.'}}}
  return {suggestRegions:await check('suggest'),refineRegion:await check('refine')}
 }
 async start(projectId:string,draft:LocalDraft,original:Buffer,mode:Mode,regionId?:string):Promise<LocalAssistanceJob>{
  await this.initialize()
  const invalid=(message:string)=>new LocalProjectError('invalid_assistance',message,422)
  if(original.length>10*1024*1024)throw invalid('Original exceeds local assistance byte limit.')
  if(!UUID.test(projectId)||draft.projectId!==projectId||!Number.isInteger(draft.revision)||draft.revision<0||!Object.values(MODEL_MODES).includes(mode))throw invalid('Invalid project, revision or assistance mode.')
  const working=await createWorkingSource(original)
  if(draft.sourceVersion!==working.sourceVersion||draft.normalizationVersion!=='working-image-v1')throw invalid('Draft source/version does not match immutable original.')
  let region:RawRegion|undefined
  if(mode==='refine') {region=draft.regions.find(r=>r.id===regionId);if(!region)throw invalid('Select an existing region to refine.');try{rasterizeSelection(region.selection,working.width,working.height)}catch(error){throw invalid(error instanceof Error?error.message:'Invalid region geometry')}}
  const caps=await this.capabilities();if(!(mode==='suggest'?caps.suggestRegions:caps.refineRegion).available)throw new LocalProjectError('local_assets_missing','Pinned audited local model runtime is unavailable. Manual masks remain available.',503)
  const id=randomUUID();this.gate.acquire(id)
  const job:LocalAssistanceJob={id,projectId,sourceVersion:working.sourceVersion,draftRevision:draft.revision,mode,status:'queued',reviewRequired:true,...(regionId?{regionId}:{})}
  try{
   const folder=this.folder(id);await mkdir(folder,{mode:0o700});await this.persist(job)
   const sourceFolder=join(this.root,'projects',projectId);await mkdir(sourceFolder,{mode:0o700}).catch(async()=>{const s=await lstat(sourceFolder);if(!s.isDirectory()||s.isSymbolicLink()||(s.mode&0o077)!==0)throw missing()})
   const sourcePath=join(sourceFolder,'source.png')
   try{await writeFile(sourcePath,working.png,{flag:'wx',mode:0o600})}catch(error){if(!error||typeof error!=='object'||!('code'in error)||error.code!=='EEXIST')throw error;const s=await lstat(sourcePath);if(!s.isFile()||s.isSymbolicLink()||!(await readFile(sourcePath)).equals(working.png))throw invalid('Stored working source does not match original.')}
   const regions=region?[{id:region.id,label:region.label,kind:'manual',bbox:[rawNumber(region.selection.x,'x',0,1)*working.width,rawNumber(region.selection.y,'y',0,1)*working.height,(rawNumber(region.selection.x,'x',0,1)+rawNumber(region.selection.width,'width',0,1))*working.width,(rawNumber(region.selection.y,'y',0,1)+rawNumber(region.selection.height,'height',0,1))*working.height],points:[]}]:[]
   const request=join(folder,'request.json');await writeFile(request,JSON.stringify({sourcePath,outputDir:join(folder,'output'),regions}),{flag:'wx',mode:0o600})
   const attempt:Attempt={promise:Promise.resolve(),cancelled:false};this.active.set(id,attempt)
   attempt.promise=this.execute(job,attempt,request,createHash('sha256').update(working.png).digest('hex')).finally(()=>{this.gate.release(id);this.active.delete(id)});void attempt.promise.catch(()=>{})
   return {...job}
  }catch(error){this.gate.release(id);throw error}
 }
 private kill(child:ChildProcess){if(!child.pid)return;try{process.kill(-child.pid,'SIGTERM')}catch{/* Exited. */}const escalation=setTimeout(()=>{try{process.kill(-child.pid!,'SIGKILL')}catch{/* Exited. */}},1000);escalation.unref();child.once('close',()=>clearTimeout(escalation))}
 private async execute(job:LocalAssistanceJob,attempt:Attempt,request:string,workingHash:string){
  let monitor:ReturnType<typeof setTimeout>|undefined,timeout:ReturnType<typeof setTimeout>|undefined
  try{
   job.status='running';await this.persist(job);if(attempt.cancelled)throw new Error('Cancelled')
   const child=spawn(this.runtime(job.mode),['-B',fileURLToPath(new URL('./model-worker.py',import.meta.url)),job.mode==='suggest'?'detect':'segment','--request',request],{stdio:['ignore','ignore','pipe'],detached:true,env:{...process.env,LOCAL_MODEL_PROJECT:this.modelProject,LOCAL_ASSISTANCE_DATA:this.root,HF_HUB_OFFLINE:'1',TRANSFORMERS_OFFLINE:'1',PYTHONDONTWRITEBYTECODE:'1'}})
   attempt.process=child;child.stderr?.on('data',()=>{/* Never expose stack traces or local runtime paths. */})
   let closed=false
   const done=new Promise<void>((resolve,reject)=>{child.once('error',reject);child.once('close',code=>{closed=true;if(code===0)resolve();else reject(new Error('Model worker failed'))})});void done.catch(()=>{})
   const sample=async()=>{if(closed)return;try{const memory=await readFile('/proc/meminfo','utf8'),available=Number(memory.match(/^MemAvailable:\s+(\d+)/m)?.[1])*1024;const gpu=await exec('/usr/bin/nvidia-smi',['--id=0','--query-gpu=memory.free','--format=csv,noheader,nounits'],{timeout:3000,maxBuffer:4096});const free=Number(gpu.stdout.trim())*1024**2;if(!Number.isFinite(available)||!Number.isFinite(free)||available<1.5*1024**3||free<400*1024**2){attempt.failure='insufficient_memory';this.kill(child)}}catch{attempt.failure='resource_check_failed';this.kill(child)}if(!closed)monitor=setTimeout(()=>{void sample()},1000)}
   monitor=setTimeout(()=>{void sample()},1000)
   timeout=setTimeout(()=>{attempt.failure='timeout';this.kill(child)},this.options.timeoutMs??245_000)
   if(attempt.cancelled)this.kill(child)
   await done
   if(attempt.cancelled||attempt.failure)throw new Error('Cancelled or resource failure')
   const report=await this.report(job.id)
   if(report.status!=='completed'||report.source.sha256!==workingHash||!Array.isArray(report.regions)||report.regions.length>16)throw new Error('Invalid model report')
   if(job.mode==='suggest')job.regions=report.regions.map(p=>this.proposal(p,report.source.width,report.source.height))
   else {
    const p=report.regions[0]
    if(report.regions.length!==1||p.id!==job.regionId||p.maskPath!==`${job.regionId}-mask.png`||!p.maskSha256)throw new Error('Invalid mask result')
    const path=join(this.folder(job.id),'output',p.maskPath);const info=await lstat(path);if(!info.isFile()||info.isSymbolicLink()||info.size>10*1024*1024)throw new Error('Invalid mask file')
    const bytes=await readFile(path);if(createHash('sha256').update(bytes).digest('hex')!==p.maskSha256)throw new Error('Mask integrity error')
    const decoded=await sharp(bytes,{limitInputPixels:1280*1280}).removeAlpha().greyscale().raw().toBuffer({resolveWithObject:true});if(decoded.info.width!==report.source.width||decoded.info.height!==report.source.height||decoded.data.some(v=>v!==0&&v!==255)||!decoded.data.some(Boolean))throw new Error('Empty or invalid binary model mask')
    await writeFile(join(this.folder(job.id),'mask.png'),bytes,{flag:'wx',mode:0o600});await writeFile(join(this.folder(job.id),'mask.json'),JSON.stringify({sha256:p.maskSha256,width:report.source.width,height:report.source.height}),{flag:'wx',mode:0o600});job.maskId=job.id
   }
   job.status='completed';await this.persist(job)
  }catch{
   job.status=attempt.cancelled?'cancelled':'failed';delete job.maskId;delete job.regions
   if(!attempt.cancelled){let code=attempt.failure??'worker_failed';try{const report=await this.report(job.id);if(report.publicFailure&&/^[a-z_]{1,64}$/.test(report.publicFailure.code))code=report.publicFailure.code}catch{/* Interrupted workers may have no report. */}job.error={code,message:code==='insufficient_memory'?'Insufficient local memory for assistance. Keep manual masks or try explicitly after freeing resources.':'Local model assistance failed. No automatic retry; manual masks remain available.'}}
   await this.clean(job.id);await this.persist(job)
  }finally{if(monitor)clearTimeout(monitor);if(timeout)clearTimeout(timeout)}
 }
 private async report(id:string):Promise<Report>{const path=join(this.folder(id),'output/result.json'),info=await lstat(path);if(!info.isFile()||info.isSymbolicLink()||info.size>2*1024*1024)throw new Error('Invalid report');return JSON.parse(await readFile(path,'utf8')) as Report}
 private proposal(p:Prediction,width:number,height:number):RawRegion{if(!/^[a-zA-Z0-9_-]{1,64}$/.test(p.id)||typeof p.label!=='string'||p.label.length>120||!Array.isArray(p.bbox)||p.bbox.length!==4||p.bbox.some(v=>!Number.isFinite(v))||p.bbox[0]<0||p.bbox[1]<0||p.bbox[2]>width||p.bbox[3]>height||p.bbox[2]<=p.bbox[0]||p.bbox[3]<=p.bbox[1])throw new Error('Invalid suggestion');return{id:p.id,label:p.label,role:p.kind==='text'?'protected':'actor',selection:{x:String(p.bbox[0]/width),y:String(p.bbox[1]/height),width:String((p.bbox[2]-p.bbox[0])/width),height:String((p.bbox[3]-p.bbox[1])/height),strokes:[]},motion:{type:'static',anchorX:'.5',anchorY:'.5',dx:'0',dy:'0',angle:'0',start:'0',duration:'1',cycles:'1',period:'',pause:'',wristInfluence:'',endState:'hold',easing:'smooth'}}}
 async get(projectId:string,id:string):Promise<LocalAssistanceJob>{await this.initialize();const j=await this.record(id);if(j.projectId!==projectId)throw missing();return j}
 async cancel(projectId:string,id:string){const j=await this.get(projectId,id),a=this.active.get(id);if(a&&(j.status==='queued'||j.status==='running')){a.cancelled=true;if(a.process)this.kill(a.process);await a.promise;return this.get(projectId,id)}return j}
 async wait(id:string){await this.active.get(id)?.promise}
 async readMask(projectId:string,id:string,sourceVersion:string):Promise<{bytes:Buffer;pixels:Uint8Array;width:number;height:number}>{const j=await this.get(projectId,id);if(j.status!=='completed'||j.maskId!==id||j.sourceVersion!==sourceVersion)throw missing();const path=join(this.folder(id),'mask.png'),info=await lstat(path).catch(()=>{throw missing()});if(!info.isFile()||info.isSymbolicLink()||info.size>10*1024*1024)throw missing();const integrityPath=join(this.folder(id),'mask.json'),integrityInfo=await lstat(integrityPath).catch(()=>{throw missing()});if(!integrityInfo.isFile()||integrityInfo.isSymbolicLink()||integrityInfo.size>1024)throw missing();const integrity=JSON.parse(await readFile(integrityPath,'utf8')) as {sha256:string;width:number;height:number};const bytes=await readFile(path);if(createHash('sha256').update(bytes).digest('hex')!==integrity.sha256)throw missing();const decoded=await sharp(bytes,{limitInputPixels:1280*1280}).removeAlpha().greyscale().raw().toBuffer({resolveWithObject:true});if(decoded.info.width!==integrity.width||decoded.info.height!==integrity.height||decoded.data.some(v=>v!==0&&v!==255))throw missing();return{bytes,pixels:decoded.data,width:decoded.info.width,height:decoded.info.height}}
 async shutdown(){await Promise.all([...this.active.keys()].map(async id=>{const j=await this.record(id);await this.cancel(j.projectId,id)}))}
}
