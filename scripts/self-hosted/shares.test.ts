// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest'
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import sharp from 'sharp'
import { ShareStore } from './shares.ts'
import { OwnerServicesRegistry } from './owners.ts'
import { localPolicy,serviceBoundary } from './boundary.ts'
const roots:string[]=[]
afterEach(async()=>{for(const root of roots.splice(0))await rm(root,{recursive:true,force:true})})
async function setup(){const root=await mkdtemp(join(tmpdir(),'mml-shares-'));roots.push(root);const owners=new OwnerServicesRegistry(root,localPolicy(serviceBoundary('http://127.0.0.1:8000'))),ownerId=randomUUID(),owner=owners.get(ownerId)
 const bytes=await sharp({create:{width:16,height:16,channels:3,background:'#223344'}}).png().toBuffer(),project=await owner.originals.import(bytes,'synthetic.png');let draft=await owner.editing.getDraft(project.id);draft=await owner.editing.saveDraft(project.id,0,{...draft,duration:'1',fps:'4'});const job=await owner.renderer.start(project.id,draft,bytes);await owner.renderer.wait(job.id);const chapter=await owner.editing.createChapter('Synthetic chapter',[project.id]),snapshot=await owner.editing.createSnapshot(chapter.id,0,true,owner.renderer)
 return{root,owners,ownerId,owner,project,snapshot,shares:new ShareStore(root,owners)}}
describe('explicit read-only frozen sharing',()=>{
 it('returns a copy-once bearer token while persisting only its hash and exposing sanitized derivative endpoints',async()=>{
  const {root,shares,ownerId,snapshot,project}=await setup();const created=await shares.create(ownerId,snapshot.id,0,true,true,'Synthetic test creator')
  expect(created.path).toBe(`/read/${created.token}`);const manifest=await shares.read(created.token)
  expect(manifest.attribution).toBe('Synthetic test creator');expect(created.share.rightsConfirmed).toBe(true);expect(manifest.pages).toHaveLength(1);expect(JSON.stringify(manifest)).not.toContain(ownerId);expect(JSON.stringify(manifest)).not.toContain(project.id);expect(JSON.stringify(manifest)).not.toContain(snapshot.id)
  expect((await shares.asset(created.token,0,'poster')).mimeType).toBe('image/png');expect((await shares.asset(created.token,0,'video')).mimeType).toBe('video/webm')
  const files=await readdir(join(root,'sharing/records'));const contents=(await Promise.all(files.map(p=>readFile(join(root,'sharing/records',p),'utf8')))).join();expect(contents).not.toContain(created.token)
  await expect(shares.read('x'.repeat(43))).rejects.toMatchObject({code:'not_found'});await expect(shares.asset(created.token,1,'poster')).rejects.toMatchObject({code:'not_found'})
 })
 it('keeps the captured snapshot revision frozen, rotates on explicit replacement and revokes all old URLs',async()=>{
  const {shares,ownerId,owner,snapshot}=await setup();const first=await shares.create(ownerId,snapshot.id,0,true,true,'Synthetic test creator')
  const chapter=await owner.editing.getChapter(snapshot.chapterId);await owner.editing.saveChapter(chapter.id,0,'New chapter name',chapter.pageIds);await owner.editing.replaceSnapshot(snapshot.id,0,chapter.id,1,true,owner.renderer)
  expect((await shares.read(first.token)).name).toBe('Synthetic chapter')
  const next=await shares.replace(ownerId,first.share.id,0,snapshot.id,1,true,true,'New test credits')
  expect((await shares.read(next.token)).name).toBe('New chapter name');await expect(shares.read(first.token)).rejects.toMatchObject({code:'not_found'})
  await expect(shares.revoke(randomUUID(),next.share.id,1)).rejects.toMatchObject({code:'not_found'})
  await shares.revoke(ownerId,next.share.id,1);await expect(shares.read(next.token)).rejects.toMatchObject({code:'not_found'});await expect(shares.asset(next.token,0,'video')).rejects.toMatchObject({code:'not_found'})
 })
 it('requires explicit review and ownership and fails guest reads if the source snapshot is withdrawn',async()=>{
  const {shares,ownerId,owner,snapshot}=await setup()
  await expect(shares.create(ownerId,snapshot.id,0,false)).rejects.toMatchObject({code:'review_required'})
  await expect(shares.create(ownerId,snapshot.id,0,true)).rejects.toMatchObject({code:'publication_permission_required'})
  await expect(shares.create(randomUUID(),snapshot.id,0,true,true)).rejects.toMatchObject({code:'not_found'})
  const created=await shares.create(ownerId,snapshot.id,0,true,true,'Synthetic test creator');await owner.editing.unpublishSnapshot(snapshot.id,0);await expect(shares.read(created.token)).rejects.toMatchObject({code:'not_found'})
 })
})
