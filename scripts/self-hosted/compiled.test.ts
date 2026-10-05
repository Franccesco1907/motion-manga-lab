// @vitest-environment node
import { afterEach, beforeAll, expect, it } from 'vitest'
import { execFile, spawn, type ChildProcess } from 'node:child_process'
import { promisify } from 'node:util'
import { createServer } from 'node:net'
import { mkdtemp, mkdir, writeFile, readFile, readdir, rm, cp, symlink, lstat } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { setTimeout as delay } from 'node:timers/promises'
import { createHash,randomUUID } from 'node:crypto'
import sharp from 'sharp'
import type { AccountSession } from '../../src/features/accounts/contracts.ts'
import type { LocalProject,LocalDraft,LocalRenderJob,LocalChapter,LocalSnapshot } from '../../src/features/local-projects/contracts.ts'
import type { ShareCreation,SharedReading } from '../../src/features/sharing/contracts.ts'
const execute=promisify(execFile),roots:string[]=[],children:ChildProcess[]=[]
const cwd=process.cwd()
beforeAll(async()=>{await execute(process.execPath,[join(cwd,'node_modules/vite/bin/vite.js'),'build'],{timeout:20000});await execute(process.execPath,[join(cwd,'scripts/build-server.mjs')],{timeout:20000})},30000)
afterEach(async()=>{for(const child of children.splice(0)){child.kill('SIGTERM');await new Promise<void>(resolve=>{if(child.exitCode!==null)resolve();else child.once('exit',()=>resolve())})}for(const root of roots.splice(0))await rm(root,{recursive:true,force:true})})
async function account(username:string,password:string,env:NodeJS.ProcessEnv){
 await new Promise<void>((resolve,reject)=>{const child=spawn(process.execPath,[join(cwd,'dist-server/scripts/self-hosted/create-account.js'),username],{env,stdio:['pipe','pipe','pipe']});let stdout='',stderr='';child.stdout.on('data',b=>{stdout+=b});child.stderr.on('data',b=>{stderr+=b});child.once('error',reject);child.once('close',code=>{if(code!==0)reject(new Error(stderr));else if((stdout+stderr).includes(password))reject(new Error('Password leaked'));else resolve()});child.stdin.end(password+'\n')})
}
it('runs compiled entry and packaged encoder for two closed accounts plus anonymous frozen reading',async()=>{
 const root=await mkdtemp(join(tmpdir(),'mml-compiled-'));roots.push(root)
 const env={...process.env,HOME:root,MOTION_MANGA_ACCOUNT_DATA:join(root,'account-data')}
 await account('alice','a synthetic password only',env);await account('bob','b synthetic password only',env)
 const probe=createServer();await new Promise<void>(resolve=>probe.listen(0,'127.0.0.1',resolve));const address=probe.address();if(!address||typeof address==='string')throw Error('No port');const port=address.port;await new Promise<void>(resolve=>probe.close(()=>resolve()))
 const child=spawn(process.execPath,[join(cwd,'dist-server/scripts/self-hosted/start.js')],{env:{...env,PORT:String(port)},stdio:['ignore','pipe','pipe']});children.push(child);let stderr='';child.stderr!.on('data',b=>{stderr+=b});const origin=`http://127.0.0.1:${port}`
 let ready=false;for(let i=0;i<100;i++){try{ready=(await fetch(origin+'/api/runtime')).ok;if(ready)break}catch{/* Startup may not yet be listening. */}if(child.exitCode!==null)throw Error(stderr);await delay(20)}expect(ready).toBe(true);const built=await fetch(origin+'/');expect(built.status).toBe(200);expect(await built.text()).toContain('/assets/index-')
 async function login(username:string,password:string){const response=await fetch(origin+'/api/auth/login',{method:'POST',headers:{Origin:origin,'X-Motion-Manga-Local':'1','Content-Type':'application/json'},body:JSON.stringify({username,password})});expect(response.status).toBe(200);return{session:await response.json() as AccountSession,cookie:response.headers.get('set-cookie')!.split(';')[0]}}
 const alice=await login('alice','a synthetic password only'),bob=await login('bob','b synthetic password only')
 const headers=(user:typeof alice)=>({Cookie:user.cookie,Origin:origin,'X-Motion-Manga-Local':'1','X-Motion-Manga-CSRF':user.session.csrfToken!,'Content-Type':'application/json'})
 async function data<T>(path:string,body?:unknown,method='GET',user=alice):Promise<T>{const response=await fetch(origin+path,{method,headers:headers(user),...(body===undefined?{}:{body:JSON.stringify(body)})});expect(response.ok).toBe(true);return response.json() as Promise<T>}
 const bytes=await sharp({create:{width:16,height:16,channels:3,background:'#225577'}}).png().toBuffer()
 const imported=await fetch(origin+'/api/local-projects',{method:'POST',headers:{...headers(alice),'Content-Type':'application/octet-stream','X-File-Name':'compiled-synthetic.png'},body:new Uint8Array(bytes)});expect(imported.status).toBe(201);const {project}=await imported.json() as {project:LocalProject}
 const initial=await data<{draft:LocalDraft}>(`/api/local-projects/${project.id}/draft`),saved=await data<{draft:LocalDraft}>(`/api/local-projects/${project.id}/draft`,{expectedRevision:0,draft:{...initial.draft,schemaVersion:2,duration:'1',fps:'4',regions:[{id:'scale-fixture',label:'Scaled synthetic part',role:'actor',selection:{x:'.2',y:'.2',width:'.2',height:'.2',strokes:[]},motion:{type:'scale',scale:'1.1',anchorX:'.5',anchorY:'.5',dx:'0',dy:'0',angle:'0',start:'0',duration:'.5',cycles:'1',period:'',pause:'',wristInfluence:'',endState:'hold',easing:'smooth'}}]}},'PUT')
 const started=await data<{job:LocalRenderJob}>(`/api/local-projects/${project.id}/render`,{expectedRevision:saved.draft.revision},'POST')
 let job=started.job;for(let i=0;i<100&&['queued','running'].includes(job.status);i++){await delay(20);job=(await data<{job:LocalRenderJob}>(`/api/local-projects/${project.id}/jobs/${job.id}`)).job}expect(job.status).toBe('completed');expect(job.artifact?.rendererVersion).toBe('affine-a-v2')
 const {chapter}=await data<{chapter:LocalChapter}>('/api/local-projects/chapters',{name:'Compiled synthetic chapter',pageIds:[project.id]},'POST')
 const {snapshot}=await data<{snapshot:LocalSnapshot}>('/api/local-projects/snapshots',{chapterId:chapter.id,expectedChapterRevision:0,reviewed:true},'POST')
 const maskId=randomUUID(),sourceVersion=createHash('sha256').update(bytes).digest('hex'),folder=join(env.MOTION_MANGA_ACCOUNT_DATA,'owners',alice.session.user!.id,'assistance/jobs',maskId)
 // CPU-only registered-mask ownership fixture; not claimed as live model inference.
 await mkdir(folder,{recursive:true,mode:0o700});const pixels=new Uint8Array(256);pixels[100]=255;const mask=await sharp(pixels,{raw:{width:16,height:16,channels:1}}).png().toBuffer();await writeFile(join(folder,'mask.png'),mask,{mode:0o600});await writeFile(join(folder,'mask.json'),JSON.stringify({sha256:createHash('sha256').update(mask).digest('hex'),width:16,height:16}),{mode:0o600});await writeFile(join(folder,'job.json'),JSON.stringify({id:maskId,projectId:project.id,sourceVersion,draftRevision:1,mode:'refine',status:'completed',reviewRequired:true,regionId:'region-1',maskId}),{mode:0o600})
 for(const path of [`/${project.id}/original`,`/${project.id}/draft`,`/${project.id}/jobs/${job.id}`,`/${project.id}/masks/${maskId}?sourceVersion=${sourceVersion}`,`/chapters/${chapter.id}`,`/snapshots/${snapshot.id}`]){expect((await fetch(origin+'/api/local-projects'+path,{headers:headers(alice)})).status).toBe(200);expect((await fetch(origin+'/api/local-projects'+path,{headers:headers(bob)})).status).toBe(404);expect((await fetch(origin+'/api/local-projects'+path)).status).toBe(401)}
 const share=await data<ShareCreation>('/api/shares',{snapshotId:snapshot.id,expectedSnapshotRevision:0,reviewed:true,rightsConfirmed:true,attribution:'Synthetic fixture only'},'POST')
 const guest=await(await fetch(origin+`/api/read/${share.token}`)).json() as SharedReading;expect(guest.attribution).toBe('Synthetic fixture only');expect(JSON.stringify(guest)).not.toContain(project.id)
 const video=await fetch(origin+guest.pages[0].videoPath);expect(video.status).toBe(200);const videoBytes=Buffer.from(await video.arrayBuffer());const info=await new Promise<string>((resolve,reject)=>{const ffmpeg=spawn('/snap/bin/ffmpeg',['-hide_banner','-i','pipe:0','-f','null','-'],{stdio:['pipe','ignore','pipe']});let output='';ffmpeg.stderr.on('data',b=>{output+=b});ffmpeg.once('close',code=>code===0?resolve(output):reject(Error(output)));ffmpeg.stdin.end(videoBytes)});expect(info).toContain('Duration: 00:00:01.00')
 expect((await fetch(origin+guest.pages[0].posterPath)).status).toBe(200)
 await data('/api/shares/'+share.share.id,{expectedRevision:0},'DELETE');expect((await fetch(origin+guest.pages[0].videoPath)).status).toBe(404);expect((await fetch(origin+`/api/read/${share.token}`)).status).toBe(404)
 const sessionFiles=await readdir(join(env.MOTION_MANGA_ACCOUNT_DATA,'auth/sessions'));expect((await Promise.all(sessionFiles.map(f=>readFile(join(env.MOTION_MANGA_ACCOUNT_DATA,'auth/sessions',f),'utf8')))).join()).not.toContain(alice.cookie.split('=')[1])
},20000)

it('compiled account bootstrap rejects public-tree and symlink aliases before any account write',async()=>{
 const root=await mkdtemp(join(tmpdir(),'mml-bootstrap-boundary-'));roots.push(root);const project=join(root,'isolated-project');await mkdir(join(project,'public/content'),{recursive:true});await writeFile(join(project,'package.json'),'{"type":"module"}');await symlink(join(cwd,'node_modules'),join(project,'node_modules'),'dir')
 // Only our compiled source adapters are copied; no public art, model assets or user projects.
 await cp(join(cwd,'dist-server'),join(project,'dist-server'),{recursive:true})
 const marker=join(project,'public/content/keep.txt');await writeFile(marker,'synthetic pre-existing content');const mode=(await lstat(marker)).mode;await symlink(join(project,'public/content'),join(project,'alias'),'dir')
 for(const data of [join(project,'public/content/private'),join(project,'alias/private'),join(project,'src/private'),join(project,'dist/private'),join(project,'dist-server/private')]){
  const result=await new Promise<{code:number|null;stdout:string;stderr:string}>(resolve=>{const child=spawn(process.execPath,[join(project,'dist-server/scripts/self-hosted/create-account.js'),'test-owner'],{env:{...process.env,HOME:root,MOTION_MANGA_ACCOUNT_DATA:data},stdio:['pipe','pipe','pipe']});let stdout='',stderr='';child.stdout.on('data',b=>{stdout+=b});child.stderr.on('data',b=>{stderr+=b});child.once('close',code=>resolve({code,stdout,stderr}));child.stdin.end('synthetic password only\n')})
  expect(result.code).toBe(1);expect(result.stderr).toContain('Private account storage');expect(result.stdout+result.stderr).not.toContain('synthetic password only');await expect(lstat(data)).rejects.toMatchObject({code:'ENOENT'})
 }
 expect(await readFile(marker,'utf8')).toBe('synthetic pre-existing content');expect((await lstat(marker)).mode).toBe(mode)
},10000)
