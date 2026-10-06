// @vitest-environment node
import { afterEach,expect,it } from 'vitest'
import { mkdtemp,mkdir,writeFile,readFile,symlink,lstat,rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { assertPrivateStorage } from './storage-boundary.ts'
const roots:string[]=[]
afterEach(async()=>{for(const root of roots.splice(0))await rm(root,{recursive:true,force:true})})
it('rejects real-path aliases into public inputs without changing existing content or permissions',async()=>{
 const root=await mkdtemp(join(tmpdir(),'mml-boundary-'));roots.push(root);await mkdir(join(root,'public/content'),{recursive:true});const marker=join(root,'public/content/keep.txt');await writeFile(marker,'synthetic pre-existing content');const mode=(await lstat(marker)).mode
 await symlink(join(root,'public/content'),join(root,'alias'),'dir')
 expect(()=>assertPrivateStorage(join(root,'alias/private'),join(root,'dist'))).toThrow(/Private account storage/)
 expect(()=>assertPrivateStorage(join(root,'public/content/private'),join(root,'dist'))).toThrow(/Private account storage/)
 expect(await readFile(marker,'utf8')).toBe('synthetic pre-existing content');expect((await lstat(marker)).mode).toBe(mode)
 expect(()=>assertPrivateStorage(join(root,'src/private'),join(root,'dist'))).toThrow(/Private account storage/)
 expect(()=>assertPrivateStorage(join(root,'scripts/private'),join(root,'dist'))).toThrow(/Private account storage/)
 expect(()=>assertPrivateStorage(join(root,'dist-server/private'),join(root,'dist'))).toThrow(/Private account storage/)
 expect(()=>assertPrivateStorage(join(root,'safe-private'),join(root,'dist'))).not.toThrow()
})
