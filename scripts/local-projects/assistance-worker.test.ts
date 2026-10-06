// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest'
import { mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import sharp from 'sharp'
import { LocalAssistanceService } from './assistance.ts'
import { LocalRenderService } from './render-service.ts'
import { createWorkingSource } from './working-source.ts'
import { draft } from './render-fixtures.ts'
const folders:string[]=[]
afterEach(async()=>{await Promise.all(folders.splice(0).map(p=>rm(p,{recursive:true,force:true})))})
/** Controlled CPU-only protocol fixture, never a fake live-model claim or model import. */
async function setup(behavior:string,timeoutMs?:number) {
 const root=await mkdtemp(join(tmpdir(),'manga-model-protocol-'));folders.push(root)
 const modelProject=join(root,'model-metadata'),base=join(modelProject,'experiments/segmentation-poc')
 await mkdir(join(base,'runtime/.venv/bin'),{recursive:true});await mkdir(join(base,'model-cache/ee5bba1d82bb8749febdf90f45e84b687142ba03'),{recursive:true});await mkdir(join(base,'audit'))
 await writeFile(join(base,'audit/model-manifest.json'),'{}')
 const script=`#!${process.execPath}\nimport fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';\nconst request=JSON.parse(fs.readFileSync(process.argv.at(-1),'utf8'));const output=request.outputDir;fs.mkdirSync(output);const sha=crypto.createHash('sha256').update(fs.readFileSync(request.sourcePath)).digest('hex');${behavior}\n`
 await writeFile(join(base,'runtime/.venv/bin/python'),script,{mode:0o700})
 const bytes=await sharp({create:{width:16,height:16,channels:3,background:'#112233'}}).png().toBuffer(),working=await createWorkingSource(bytes),d=draft(working.sourceVersion);d.projectId=randomUUID()
 return{root,modelProject,bytes,working,d,service:new LocalAssistanceService(root,{modelProject,timeoutMs})}
}
describe('model subprocess protocol, CPU-only synthetic fixture',()=>{
 it('verifies a successful binary mask, exact source ownership and render use',async()=>{
  const pixels=new Uint8Array(16*16);pixels[8*16+8]=255
  const png=await sharp(pixels,{raw:{width:16,height:16,channels:1}}).png().toBuffer()
  const fixture=await setup(`const mask=Buffer.from('${png.toString('base64')}','base64');fs.writeFileSync(path.join(output,'region-1-mask.png'),mask);fs.writeFileSync(path.join(output,'result.json'),JSON.stringify({status:'completed',source:{sha256:sha,width:16,height:16},regions:[{id:'region-1',maskPath:'region-1-mask.png',maskSha256:crypto.createHash('sha256').update(mask).digest('hex')}]}));`)
  const {root,service,d,bytes}=fixture,job=await service.start(d.projectId,d,bytes,'refine','region-1');await service.wait(job.id)
  const done=await service.get(d.projectId,job.id);expect(done.status).toBe('completed');expect(done.maskId).toBe(job.id)
  expect((await service.readMask(d.projectId,job.id,d.sourceVersion)).pixels).toEqual(Buffer.from(pixels))
  await expect(service.readMask(randomUUID(),job.id,d.sourceVersion)).rejects.toMatchObject({code:'not_found'})
  await expect(service.readMask(d.projectId,job.id,'f'.repeat(64))).rejects.toMatchObject({code:'not_found'})
  d.regions[0].maskId=job.id
  const render=new LocalRenderService(root,{readMask:(...args)=>service.readMask(...args)}),renderJob=await render.start(d.projectId,d,bytes)
  await render.wait(renderJob.id);expect((await render.get(d.projectId,renderJob.id)).status).toBe('completed')
 })
 it('returns only bounded failure codes and cleans all partial artifacts',async()=>{
  const {root,service,d,bytes}=await setup(`fs.writeFileSync(path.join(output,'result.json'),JSON.stringify({status:'failed-no-retry',publicFailure:{code:'runtime_incompatible'},error:'private local path /secret'}));process.exit(1);`)
  const job=await service.start(d.projectId,d,bytes,'refine','region-1');await service.wait(job.id);const done=await service.get(d.projectId,job.id)
  expect(done.status).toBe('failed');expect(done.error?.code).toBe('runtime_incompatible');expect(JSON.stringify(done)).not.toContain('/secret')
  expect(await readdir(join(root,'assistance/jobs',job.id))).toEqual(['job.json'])
 })
 it('serializes render/model admission and cancels only its owned process',async()=>{
  const {root,service,d,bytes}=await setup('setTimeout(()=>{},60000);')
  const job=await service.start(d.projectId,d,bytes,'refine','region-1')
  await expect(new LocalRenderService(root).start(d.projectId,d,bytes)).rejects.toMatchObject({code:'busy'})
  expect((await service.cancel(d.projectId,job.id)).status).toBe('cancelled');expect(await readdir(join(root,'assistance/jobs',job.id))).toEqual(['job.json'])
 })
 it('times out inference and never retries or publishes partial mask',async()=>{
  const {root,service,d,bytes}=await setup('setTimeout(()=>{},60000);',0)
  const job=await service.start(d.projectId,d,bytes,'refine','region-1');await service.wait(job.id)
  const done=await service.get(d.projectId,job.id);expect(done.status).toBe('failed');expect(done.error?.code).toBe('timeout')
  expect(await readdir(join(root,'assistance/jobs',job.id))).toEqual(['job.json'])
 })
})
