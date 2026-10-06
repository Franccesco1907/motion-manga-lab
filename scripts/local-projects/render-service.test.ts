// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest'
import { mkdtemp, rm, readdir, mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import sharp from 'sharp'
import { LocalRenderService } from './render-service.ts'
import { createWorkingSource } from './working-source.ts'
import { draft } from './render-fixtures.ts'
const folders:string[]=[]
afterEach(async()=>{await Promise.all(folders.splice(0).map(p=>rm(p,{recursive:true,force:true})))})
async function setup(){const root=await mkdtemp(join(tmpdir(),'manga-render-'));folders.push(root);const bytes=await sharp({create:{width:16,height:16,channels:3,background:'#ff0022'}}).png().toBuffer();return {root,bytes,working:await createWorkingSource(bytes)}}
describe('bounded render jobs',()=>{
 it('publishes a finite playable WebM with exact source and draft metadata',async()=>{
  const {root,bytes,working}=await setup(),service=new LocalRenderService(root),d=draft(working.sourceVersion)
  const job=await service.start(d.projectId,d,bytes);expect(['queued','running']).toContain(job.status)
  await service.wait(job.id);const done=await service.get(d.projectId,job.id);expect(done.status).toBe('completed');expect(done.artifact?.draftRevision).toBe(1)
  expect((await service.readAsset(d.projectId,job.id,'poster')).bytes).toEqual(working.png)
  const video=await service.readAsset(d.projectId,job.id,'video');expect(video.mimeType).toBe('video/webm');expect(video.bytes.length).toBeGreaterThan(100)
  const decoded=spawnSync('/snap/bin/ffmpeg',['-v','error','-i','pipe:0','-f','framemd5','-'],{input:video.bytes,encoding:'utf8'})
  expect(decoded.stdout.split('\n').filter(l=>/^0,/.test(l))).toHaveLength(4)
  const metadata=spawnSync('/snap/bin/ffmpeg',['-hide_banner','-i','pipe:0','-f','null','-'],{input:video.bytes,encoding:'utf8'})
  expect(metadata.stderr).toMatch(/Duration: 00:00:01\.00/)
  expect((await service.latestCompleted(d.projectId))?.id).toBe(job.id)
  await expect(service.readAsset('wrong',job.id,'video')).rejects.toMatchObject({code:'not_found'})
 })
 it('fails closed when a supposedly immutable published artifact is corrupted',async()=>{
  const {root,bytes,working}=await setup(),service=new LocalRenderService(root),d=draft(working.sourceVersion)
  const job=await service.start(d.projectId,d,bytes);await service.wait(job.id)
  await writeFile(join(root,'jobs',job.id,'video.webm'),'corrupt')
  await expect(service.readAsset(d.projectId,job.id,'video')).rejects.toMatchObject({code:'not_found'})
 })
 it('rejects stale source and invalid active values before encoder admission',async()=>{
  const {root,bytes,working}=await setup(),service=new LocalRenderService(root),d=draft(working.sourceVersion)
  await expect(service.start(d.projectId,{...d,sourceVersion:'f'.repeat(64)},bytes)).rejects.toMatchObject({code:'invalid_render'})
  await expect(service.start(d.projectId,{...d,duration:''},bytes)).rejects.toMatchObject({code:'invalid_render'})
 })
 it('cancels the owned worker, releases admission and never publishes partial assets',async()=>{
  const {root,bytes,working}=await setup(),service=new LocalRenderService(root),d=draft(working.sourceVersion)
  const job=await service.start(d.projectId,d,bytes)
  await expect(service.start(d.projectId,d,bytes)).rejects.toMatchObject({code:'busy'})
  expect((await service.cancel(d.projectId,job.id)).status).toBe('cancelled');await service.wait(job.id)
  await expect(service.readAsset(d.projectId,job.id,'video')).rejects.toMatchObject({code:'not_found'})
  expect(await readdir(join(root,'jobs',job.id))).toEqual(['job.json'])
 })
 it('fails interrupted persisted jobs on restart without publishing or retry',async()=>{
  const {root,working}=await setup(),id='01999663-729b-4e5b-8129-24735b1fd61c',d=draft(working.sourceVersion)
  const folder=join(root,'jobs',id);await mkdir(folder,{recursive:true,mode:0o700});await writeFile(join(folder,'job.json'),JSON.stringify({id,projectId:d.projectId,sourceVersion:d.sourceVersion,draftRevision:1,status:'running'}));await writeFile(join(folder,'video.partial.webm'),'partial')
  const recovered=new LocalRenderService(root);expect((await recovered.get(d.projectId,id)).status).toBe('failed');expect((await recovered.get(d.projectId,id)).error?.code).toBe('interrupted');expect(await readdir(folder)).toEqual(['job.json'])
 })
 it('times out an owned job and cleans all partial inputs/output without retry',async()=>{
  const {root,bytes,working}=await setup(),service=new LocalRenderService(root,{timeoutMs:0}),d=draft(working.sourceVersion)
  const job=await service.start(d.projectId,d,bytes);await service.wait(job.id);const done=await service.get(d.projectId,job.id)
  expect(done.status).toBe('failed');expect(done.error?.code).toBe('timeout');expect(await readdir(join(root,'jobs',job.id))).toEqual(['job.json'])
 })
})
