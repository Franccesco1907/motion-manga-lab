// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import sharp from 'sharp'
import { LocalAssistanceService } from './assistance.ts'
import { createWorkingSource } from './working-source.ts'
import { draft } from './render-fixtures.ts'
const folders:string[]=[]
afterEach(async()=>{await Promise.all(folders.splice(0).map(p=>rm(p,{recursive:true,force:true})))})
describe('explicit offline assistance boundary',()=>{
 it('reports unavailable audited runtimes from metadata without importing models',async()=>{
  const root=await mkdtemp(join(tmpdir(),'manga-assist-'));folders.push(root)
  const service=new LocalAssistanceService(root,{modelProject:join(root,'absent')})
  const caps=await service.capabilities();expect(caps.suggestRegions.available).toBe(false);expect(caps.refineRegion.available).toBe(false)
 })
 it('validates exact source/revision and region geometry before unavailable runtime error',async()=>{
  const root=await mkdtemp(join(tmpdir(),'manga-assist-'));folders.push(root)
  const service=new LocalAssistanceService(root,{modelProject:join(root,'absent')}),bytes=await sharp({create:{width:16,height:16,channels:3,background:'white'}}).png().toBuffer(),working=await createWorkingSource(bytes),d=draft(working.sourceVersion);d.projectId=randomUUID()
  await expect(service.start(d.projectId,{...d,sourceVersion:'f'.repeat(64)},bytes,'suggest')).rejects.toMatchObject({code:'invalid_assistance'})
  await expect(service.start(d.projectId,d,bytes,'refine','absent')).rejects.toMatchObject({code:'invalid_assistance'})
  await expect(service.start(d.projectId,d,bytes,'suggest')).rejects.toMatchObject({code:'local_assets_missing'})
 })
 it('refuses unknown, traversal or cross-project model masks',async()=>{
  const root=await mkdtemp(join(tmpdir(),'manga-assist-'));folders.push(root)
  const service=new LocalAssistanceService(root,{modelProject:join(root,'absent')})
  await expect(service.readMask(randomUUID(),'../../weights','f'.repeat(64))).rejects.toMatchObject({code:'not_found'})
 })
})
