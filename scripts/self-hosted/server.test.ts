// @vitest-environment node
import { request } from 'node:http'
import { afterEach, describe, expect, it } from 'vitest'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { AddressInfo } from 'node:net'
import sharp from 'sharp'
import { createHash, randomUUID } from 'node:crypto'
import type { LocalProject, LocalDraft, LocalRenderJob, LocalChapter, LocalSnapshot } from '../../src/features/local-projects/contracts.ts'
import type { ShareCreation, SharedReading } from '../../src/features/sharing/contracts.ts'
import { createSelfHostedService } from './server.ts'
import type { AccountSession } from '../../src/features/accounts/contracts.ts'
const roots:string[]=[]
const running:ReturnType<typeof createSelfHostedService>[]=[]
afterEach(async()=>{for(const service of running.splice(0))await service.close();for(const root of roots.splice(0))await rm(root,{recursive:true,force:true})})
async function setup(ownerLimits?:{maxProjects:number;maxBytes:number}){const root=await mkdtemp(join(tmpdir(),'mml-http-'));roots.push(root);const staticRoot=join(root,'built');await mkdir(staticRoot);await writeFile(join(staticRoot,'index.html'),'<html><body>Built app fixture</body></html>');const service=createSelfHostedService({root:join(root,'private'),staticRoot,ownerLimits});running.push(service);await service.auth.createUser('alice','a synthetic password only');await service.auth.createUser('bob','b synthetic password only');await new Promise<void>(resolve=>service.server.listen(0,'127.0.0.1',resolve));const origin=`http://127.0.0.1:${(service.server.address() as AddressInfo).port}`
 async function login(username:string,password:string){const response=await fetch(origin+'/api/auth/login',{method:'POST',headers:{Origin:origin,'X-Motion-Manga-Local':'1','Content-Type':'application/json'},body:JSON.stringify({username,password})});expect(response.status).toBe(200);const session=await response.json() as AccountSession;return{cookie:response.headers.get('set-cookie')!.split(';')[0],csrf:session.csrfToken!,user:session.user!}}
 return{service,origin,login}}
it('refuses account storage inside frontend build inputs before any private data is created',()=>{
 expect(()=>createSelfHostedService({root:'/tmp/operator-project/public/content/private-accounts',staticRoot:'/tmp/operator-project/dist'})).toThrow(/Private account storage/)
})
describe('standalone native HTTP accounts and owner boundaries',()=>{
 it('serves the built app, rejects traversal/host/Origin/proxy spoofing and exposes no public registration',async()=>{
  const {origin}=await setup();expect(await(await fetch(origin+'/')).text()).toContain('Built app fixture');expect(await(await fetch(origin+'/api/runtime')).json()).toEqual({mode:'accounts'})
  for(const path of ['/api/auth/register','/api/users','/%2e%2e%2fprivate','/assets/%2e%2e%2fsecret'])expect((await fetch(origin+path)).status).toBe(404)
  const spoofed=await new Promise<number>(resolve=>{const req=request(origin+'/api/runtime',{headers:{Host:'attacker.invalid'}},res=>{res.resume();res.on('end',()=>resolve(res.statusCode!))});req.end()});expect(spoofed).toBe(403)
  expect((await fetch(origin+'/api/runtime',{headers:{'X-Forwarded-Host':'attacker.invalid'}})).status).toBe(403)
  expect((await fetch(origin+'/api/auth/login',{method:'POST',headers:{Origin:'https://attacker.invalid','X-Motion-Manga-Local':'1','Content-Type':'application/json'},body:'{}'})).status).toBe(403)
 },10000)
 it('authenticates two real users and isolates original/draft/working/mask/job/chapter/snapshot endpoints',async()=>{
  const {origin,login}=await setup(),alice=await login('alice','a synthetic password only'),bob=await login('bob','b synthetic password only')
  const headers=(u:typeof alice)=>({Cookie:u.cookie,Origin:origin,'X-Motion-Manga-Local':'1','X-Motion-Manga-CSRF':u.csrf})
  const bytes=await sharp({create:{width:16,height:16,channels:3,background:'white'}}).png().toBuffer()
  const uploaded=await fetch(origin+'/api/local-projects',{method:'POST',headers:{...headers(alice),'Content-Type':'application/octet-stream','X-File-Name':'synthetic.png'},body:new Uint8Array(bytes)});expect(uploaded.status).toBe(201);const {project}=await uploaded.json() as {project:{id:string}}
  expect((await fetch(origin+'/api/local-projects',{headers:headers(bob)})).status).toBe(200)
  expect(await(await fetch(origin+'/api/local-projects',{headers:headers(bob)})).json()).toEqual({projects:[]})
  const id='01999663-729b-4e5b-8129-24735b1fd61c'
  for(const path of [`/${project.id}/original`,`/${project.id}/working`,`/${project.id}/draft`,`/${project.id}/jobs/${id}`,`/${project.id}/masks/${id}?sourceVersion=${'f'.repeat(64)}`,`/${project.id}/artifacts/latest`,`/chapters/${id}`,`/snapshots/${id}`]) {
   expect((await fetch(origin+'/api/local-projects'+path,{headers:headers(bob)})).status).toBe(404)
   expect((await fetch(origin+'/api/local-projects'+path,{headers:{'X-Motion-Manga-Local':'1'}})).status).toBe(401)
  }
  expect((await fetch(origin+`/api/local-projects/${project.id}/original`,{headers:headers(alice)})).status).toBe(200)
  const denied=await fetch(origin+'/api/local-projects/chapters',{method:'POST',headers:{Cookie:alice.cookie,Origin:origin,'X-Motion-Manga-Local':'1','Content-Type':'application/json'},body:'{"name":"Denied","pageIds":[]}'});expect(denied.status).toBe(403)
  expect((await fetch(origin+'/api/auth/logout',{method:'POST',headers:{...headers(alice),'Content-Type':'application/json'},body:'{}'})).status).toBe(200)
  expect((await fetch(origin+'/api/local-projects',{headers:headers(alice)})).status).toBe(401)
 },10000)
 it('delivers real encoded guest derivatives while denying every valid cross-owner reference and revoking all URLs',async()=>{
  const {origin,login,service}=await setup(),alice=await login('alice','a synthetic password only'),bob=await login('bob','b synthetic password only')
  const headers=(u:typeof alice)=>({Cookie:u.cookie,Origin:origin,'X-Motion-Manga-Local':'1','X-Motion-Manga-CSRF':u.csrf,'Content-Type':'application/json'})
  const requestJson=async(path:string,value:unknown,method='POST',user=alice)=>{const response=await fetch(origin+path,{method,headers:headers(user),body:JSON.stringify(value)});expect(response.ok).toBe(true);return response.json() as Promise<unknown>}
  const bytes=await sharp({create:{width:16,height:16,channels:3,background:'#334455'}}).png().toBuffer()
  const upload=await fetch(origin+'/api/local-projects',{method:'POST',headers:{...headers(alice),'Content-Type':'application/octet-stream','X-File-Name':'synthetic.png'},body:new Uint8Array(bytes)});const {project}=await upload.json() as {project:LocalProject}
  const {draft}=await(await fetch(origin+`/api/local-projects/${project.id}/draft`,{headers:headers(alice)})).json() as {draft:LocalDraft}
  const saved=await requestJson(`/api/local-projects/${project.id}/draft`,{expectedRevision:0,draft:{...draft,duration:'1',fps:'4'}},'PUT') as {draft:LocalDraft}
  const {job}=await requestJson(`/api/local-projects/${project.id}/render`,{expectedRevision:saved.draft.revision}) as {job:LocalRenderJob}
  await service.owners.get(alice.user.id).renderer.wait(job.id)
  const status=await(await fetch(origin+`/api/local-projects/${project.id}/jobs/${job.id}`,{headers:headers(alice)})).json() as {job:LocalRenderJob};expect(status.job.status).toBe('completed')
  const {chapter}=await requestJson('/api/local-projects/chapters',{name:'Reviewed synthetic chapter',pageIds:[project.id]}) as {chapter:LocalChapter}
  const {snapshot}=await requestJson('/api/local-projects/snapshots',{chapterId:chapter.id,expectedChapterRevision:0,reviewed:true}) as {snapshot:LocalSnapshot}
  // A controlled permission fixture, not model-inference evidence: valid source-bound binary mask.
  const maskId=randomUUID(),sourceVersion=createHash('sha256').update(bytes).digest('hex'),folder=join(service.owners.get(alice.user.id).assistance.root,'jobs',maskId)
  await mkdir(folder,{recursive:true,mode:0o700});const pixels=new Uint8Array(256);pixels[100]=255;const mask=await sharp(pixels,{raw:{width:16,height:16,channels:1}}).png().toBuffer()
  await writeFile(join(folder,'job.json'),JSON.stringify({id:maskId,projectId:project.id,sourceVersion,draftRevision:1,mode:'refine',status:'completed',reviewRequired:true,regionId:'region-1',maskId}),{mode:0o600})
  await writeFile(join(folder,'mask.png'),mask,{mode:0o600});await writeFile(join(folder,'mask.json'),JSON.stringify({sha256:createHash('sha256').update(mask).digest('hex'),width:16,height:16}),{mode:0o600})
  const paths=[`/${project.id}/original`,`/${project.id}/working`,`/${project.id}/draft`,`/${project.id}/jobs/${job.id}`,`/${project.id}/artifacts/${job.id}/poster`,`/${project.id}/artifacts/${job.id}/video`,`/${project.id}/masks/${maskId}?sourceVersion=${sourceVersion}`,`/chapters/${chapter.id}`,`/snapshots/${snapshot.id}`,`/snapshots/${snapshot.id}/pages/${project.id}/poster?revision=0`]
  for(const path of paths){expect((await fetch(origin+'/api/local-projects'+path,{headers:headers(alice)})).status).toBe(200);expect((await fetch(origin+'/api/local-projects'+path,{headers:headers(bob)})).status).toBe(404);expect((await fetch(origin+'/api/local-projects'+path)).status).toBe(401)}
  const created=await requestJson('/api/shares',{snapshotId:snapshot.id,expectedSnapshotRevision:0,reviewed:true,rightsConfirmed:true,attribution:'Synthetic test creator'}) as ShareCreation
  const guest=await(await fetch(origin+`/api/read/${created.token}`)).json() as SharedReading
  expect(JSON.stringify(guest)).not.toMatch(new RegExp(`${project.id}|${snapshot.id}|${alice.user.id}`));expect(guest.pages).toHaveLength(1)
  for(const path of [guest.pages[0].posterPath,guest.pages[0].videoPath])expect((await fetch(origin+path)).status).toBe(200)
  expect((await fetch(origin+`/api/shares/${created.share.id}`,{method:'DELETE',headers:headers(bob),body:'{"expectedRevision":0}'})).status).toBe(404)
  await requestJson(`/api/local-projects/chapters/${chapter.id}`,{expectedRevision:0,name:'Replacement synthetic chapter',pageIds:[project.id]},'PUT')
  await requestJson(`/api/local-projects/snapshots/${snapshot.id}`,{expectedRevision:0,chapterId:chapter.id,expectedChapterRevision:1,reviewed:true},'PUT')
  expect((await(await fetch(origin+`/api/read/${created.token}`)).json() as SharedReading).name).toBe('Reviewed synthetic chapter')
  const replaced=await requestJson(`/api/shares/${created.share.id}`,{expectedRevision:0,snapshotId:snapshot.id,expectedSnapshotRevision:1,reviewed:true,rightsConfirmed:true,attribution:'Synthetic test creator'},'PUT') as ShareCreation
  expect((await fetch(origin+`/api/read/${created.token}`)).status).toBe(404);expect((await fetch(origin+guest.pages[0].videoPath)).status).toBe(404)
  await requestJson(`/api/shares/${replaced.share.id}`,{expectedRevision:1},'DELETE');expect((await fetch(origin+`/api/read/${replaced.token}`)).status).toBe(404)
  expect((await fetch(origin+`/api/local-projects/${project.id}/original`,{headers:headers(alice)})).status).toBe(200)
 },15000)

 it('enforces provisional per-owner project admission without deleting the first saved original',async()=>{
  const {origin,login}=await setup({maxProjects:1,maxBytes:256*1024*1024}),alice=await login('alice','a synthetic password only')
  const bytes=await sharp({create:{width:16,height:16,channels:3,background:'white'}}).png().toBuffer(),headers={Cookie:alice.cookie,Origin:origin,'X-Motion-Manga-Local':'1','X-Motion-Manga-CSRF':alice.csrf,'Content-Type':'application/octet-stream','X-File-Name':'quota-fixture.png'}
  expect((await fetch(origin+'/api/local-projects',{method:'POST',headers,body:new Uint8Array(bytes)})).status).toBe(201)
  const denied=await fetch(origin+'/api/local-projects',{method:'POST',headers,body:new Uint8Array(bytes)});expect(denied.status).toBe(409);expect((await denied.json() as {error:{code:string}}).error.code).toBe('owner_quota_exceeded')
  const saved=await(await fetch(origin+'/api/local-projects',{headers})).json() as {projects:LocalProject[]};expect(saved.projects).toHaveLength(1)
 },10000)

 it('bounds anonymous media admission until each response finishes and releases capacity',async()=>{
  const {origin,service}=await setup();let entered=0,signal=()=>{},release=()=>{}
  const ready=new Promise<void>(resolve=>{signal=resolve}),gate=new Promise<void>(resolve=>{release=resolve})
  // Controlled response fixture tests admission only; it is not playable-media or model evidence.
  service.shares.asset=async()=>{if(++entered===2)signal();await gate;return{bytes:Buffer.from('synthetic fixture'),mimeType:'image/png'}}
  const path=origin+'/api/read/'+'a'.repeat(43)+'/pages/0/poster',first=fetch(path),second=fetch(path);await ready
  expect((await fetch(path)).status).toBe(409);release();expect((await first).status).toBe(200);expect((await second).status).toBe(200);expect((await fetch(path)).status).toBe(200)
 },10000)

})
