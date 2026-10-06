// @vitest-environment node
import { afterEach,expect,it } from 'vitest'
import { mkdtemp,writeFile,rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { StorageAdmission } from './quota.ts'
const roots:string[]=[]
afterEach(async()=>{for(const root of roots.splice(0))await rm(root,{recursive:true,force:true})})
it('counts stored bytes and in-flight reservations and never silently deletes saved work',async()=>{
 const root=await mkdtemp(join(tmpdir(),'mml-quota-'));roots.push(root);await writeFile(join(root,'saved.bin'),Buffer.alloc(50))
 const quota=new StorageAdmission({maxProjects:2,maxBytes:100}),release=await quota.reserve(root,40)
 await expect(quota.reserve(root,20)).rejects.toMatchObject({code:'owner_quota_exceeded'})
 release();const next=await quota.reserve(root,20);next();await expect(quota.reserve(root,51)).rejects.toMatchObject({code:'owner_quota_exceeded'})
})

it('counts in-flight project slots before their directories are committed',async()=>{
 const root=await mkdtemp(join(tmpdir(),'mml-quota-projects-'));roots.push(root);const quota=new StorageAdmission({maxProjects:1,maxBytes:100})
 const release=await quota.reserve(root,10,1);await expect(quota.reserve(root,10,1)).rejects.toMatchObject({code:'owner_quota_exceeded'});release();const next=await quota.reserve(root,10,1);next()
})
