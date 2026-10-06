// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest'
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { AuthStore } from './auth.ts'
const roots:string[]=[]
afterEach(async()=>{for(const root of roots.splice(0))await rm(root,{recursive:true,force:true})})
async function setup(){const root=await mkdtemp(join(tmpdir(),'mml-auth-'));roots.push(root);let now=1000;const store=new AuthStore(root,{now:()=>now,idleMs:100,absoluteMs:1000});return{root,store,tick:(n:number)=>{now+=n}}}
describe('closed operator accounts and opaque sessions',()=>{
 it('salts real native scrypt hashes, persists no password/session bearer and rejects bad/unknown credentials',async()=>{
  const {root,store}=await setup(),password='a synthetic password only'
  const a=await store.createUser('alice',password),b=await store.createUser('bob',password);expect(a.id).not.toBe(b.id)
  const files=await readdir(join(root,'auth/users')),records=await Promise.all(files.map(file=>readFile(join(root,'auth/users',file),'utf8')))
  expect(records.join()).not.toContain(password);expect(JSON.parse(records[0]).salt).not.toBe(JSON.parse(records[1]).salt)
  const login=await store.login('alice',password,'127.0.0.1');expect(login.session.user).toEqual(a)
  const sessionFiles=await readdir(join(root,'auth/sessions'));expect(sessionFiles).toHaveLength(1)
  expect(await readFile(join(root,'auth/sessions',sessionFiles[0]),'utf8')).not.toContain(login.token)
  expect((await store.session(login.token)).session.user?.id).toBe(a.id)
  await expect(store.login('alice','wrong','127.0.0.1')).rejects.toMatchObject({code:'invalid_credentials'})
  await expect(store.login('absent','wrong','127.0.0.1')).rejects.toMatchObject({code:'invalid_credentials'})
 },10000)
 it('requires matching session CSRF, expires idle and absolute sessions, and logout revokes bearer',async()=>{
  const {store,tick}=await setup();await store.createUser('alice','a synthetic password only');const first=await store.login('alice','a synthetic password only','127.0.0.1')
  await expect(store.requireCsrf(first.token,'wrong')).rejects.toMatchObject({code:'csrf_required'})
  expect((await store.requireCsrf(first.token,first.session.csrfToken!)).session.user?.username).toBe('alice')
  tick(101);await expect(store.session(first.token)).rejects.toMatchObject({code:'authentication_required'})
  const next=await store.login('alice','a synthetic password only','127.0.0.1');await store.logout(next.token);await expect(store.session(next.token)).rejects.toMatchObject({code:'authentication_required'})
 },10000)
 it('bounds credential attempts without exposing account existence',async()=>{
  const {store}=await setup();for(let i=0;i<5;i++)await expect(store.login('absent','wrong','127.0.0.1')).rejects.toMatchObject({code:'invalid_credentials'})
  await expect(store.login('absent','wrong','127.0.0.1')).rejects.toMatchObject({code:'rate_limited'})
 },10000)
 it('keeps KDF admission bounded and honors absolute expiry despite recent use',async()=>{
  const {store,tick}=await setup();const attempts=await Promise.allSettled([store.login('unknown-one','wrong','127.0.0.1'),store.login('unknown-two','wrong','127.0.0.1')]);const codes=attempts.map(result=>result.status==='rejected'?(result.reason as {code:string}).code:'success');expect(codes.sort()).toEqual(['invalid_credentials','rate_limited'])
  await store.createUser('alice','a synthetic password only');const login=await store.login('alice','a synthetic password only','127.0.0.1')
  for(let i=0;i<10;i++){tick(90);await store.session(login.token)}tick(99);await store.session(login.token);tick(2);await expect(store.session(login.token)).rejects.toMatchObject({code:'authentication_required'})
 },10000)

})
