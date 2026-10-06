import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import { lstat, readFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { AuthStore } from './auth.ts'
import { assertTransport, cookieToken, localPolicy, serviceBoundary, sessionCookie } from './boundary.ts'
import { OwnerServicesRegistry } from './owners.ts'
import { ShareStore } from './shares.ts'
import { StorageAdmission,type OwnerStorageLimits } from './quota.ts'
import { LocalProjectError } from '../local-projects/store.ts'
import { assertPrivateStorage } from './storage-boundary.ts'
import { object } from '../local-projects/draft-validation.ts'
interface ServiceOptions { root: string; staticRoot: string; publicOrigin?: string;ownerLimits?:OwnerStorageLimits }
const MIME: Record<string,string> = { js:'text/javascript', css:'text/css', png:'image/png', webp:'image/webp', jpg:'image/jpeg', jpeg:'image/jpeg', svg:'image/svg+xml', woff:'font/woff', woff2:'font/woff2', html:'text/html' }
function json(res:ServerResponse,status:number,value:unknown){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(value))}
async function body(req:IncomingMessage){
  if(req.headers['content-type']?.split(';')[0].trim()!=='application/json')throw new LocalProjectError('unsupported_content_type','Send account and sharing requests as JSON.',415)
  const chunks:Buffer[]=[];let size=0
  for await(const part of req){size+=part.length;if(size>4096)throw new LocalProjectError('request_too_large','This request exceeds the bounded service limit.',413);chunks.push(Buffer.from(part))}
  try{return object(JSON.parse(Buffer.concat(chunks).toString('utf8')))}catch{throw new LocalProjectError('invalid_json','Provide a valid JSON object.',400)}
}

export function createSelfHostedService(options:ServiceOptions){
  const root=resolve(options.root),staticRoot=resolve(options.staticRoot)
  assertPrivateStorage(root,staticRoot)
  if(options.publicOrigin)serviceBoundary(options.publicOrigin)
  const auth=new AuthStore(root)
  let importing=false,preparingImage=false,mediaReads=0
  const boundary=()=>serviceBoundary(options.publicOrigin??`http://127.0.0.1:${(server.address() as AddressInfo).port}`)
  const owners=new OwnerServicesRegistry(root,value=>localPolicy(boundary())(value),new StorageAdmission(options.ownerLimits)),shares=new ShareStore(root,owners)
  async function staticAsset(req:IncomingMessage,res:ServerResponse,path:string){
    if(req.method!=='GET'&&req.method!=='HEAD')throw new LocalProjectError('not_found','This resource does not exist.',404)
    const index=path==='/'||/^\/read\/[a-zA-Z0-9_-]{43}$/.test(path)
    if(!index&&!/^\/(?:assets|content)\/(?:[a-zA-Z0-9_-][a-zA-Z0-9_.-]*\/)*[a-zA-Z0-9_-][a-zA-Z0-9_.-]*$/.test(path))throw new LocalProjectError('not_found','This resource does not exist.',404)
    const parts=index?['index.html']:path.slice(1).split('/')
    let file=staticRoot
    const base=await lstat(file).catch(()=>{throw new LocalProjectError('frontend_unavailable','Build the frontend before starting the service.',503)})
    if(!base.isDirectory()||base.isSymbolicLink())throw new LocalProjectError('frontend_unavailable','Built frontend unavailable.',503)
    for(const part of parts){if(part==='.'||part==='..')throw new LocalProjectError('not_found','This resource does not exist.',404);file=join(file,part);const info=await lstat(file).catch(()=>{throw new LocalProjectError('not_found','This resource does not exist.',404)});if(info.isSymbolicLink())throw new LocalProjectError('not_found','This resource does not exist.',404)}
    const info=await lstat(file),ext=file.split('.').at(-1)!,type=MIME[ext]
    if(!info.isFile()||info.size>32*1024*1024||!type)throw new LocalProjectError('not_found','This resource does not exist.',404)
    res.writeHead(200,{'Content-Type':`${type}${['html','js','css'].includes(ext)?'; charset=utf-8':''}`,'Content-Length':info.size});res.end(req.method==='HEAD'?undefined:await readFile(file))
  }
  async function handler(req:IncomingMessage,res:ServerResponse){
    res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('Cross-Origin-Resource-Policy','same-origin');res.setHeader('X-Frame-Options','DENY')
    res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' blob:; media-src 'self' blob:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'")
    try{
      const path=req.url??'',method=req.method??'',mutation=!['GET','HEAD'].includes(method),policy=boundary()
      assertTransport(req,policy,mutation)
      if(path==='/api/runtime'&&method==='GET'){json(res,200,{mode:'accounts'});return}
      if(path==='/api/auth/session'&&method==='GET'){
        try{json(res,200,(await auth.session(cookieToken(req,policy.cookieName))).session)}catch(error){if(error instanceof LocalProjectError&&error.status===401){res.setHeader('Set-Cookie',sessionCookie('',policy,true));json(res,200,{user:null,csrfToken:null})}else throw error}return
      }
      if(path==='/api/auth/login'&&method==='POST'){
        if(req.headers['x-motion-manga-local']!=='1')throw new LocalProjectError('same_origin_required','Use the configured sign-in form.',403)
        const value=await body(req),signed=await auth.login(value.username as string,value.password as string,req.socket.remoteAddress??'')
        // Rotate away any previous authenticated session rather than accepting session fixation.
        await auth.logout(cookieToken(req,policy.cookieName));res.setHeader('Set-Cookie',sessionCookie(signed.token,policy));json(res,200,signed.session);return
      }
      const guest=/^\/api\/read\/([a-zA-Z0-9_-]{43})(?:\/pages\/(\d+)\/(poster|video))?$/.exec(path)
      if(guest&&method==='GET'){
        if(guest[2]===undefined)json(res,200,await shares.read(guest[1]))
        else{if(mediaReads>=2)throw new LocalProjectError('busy','Two derived media reads are already active. Retry explicitly.',409);mediaReads++;let released=false;const release=()=>{if(!released){released=true;mediaReads--}};res.once('finish',release);res.once('close',release);let asset;try{asset=await shares.asset(guest[1],Number(guest[2]),guest[3] as 'poster'|'video')}catch(error){release();throw error}res.writeHead(200,{'Content-Type':asset.mimeType,'Content-Length':asset.bytes.length});res.end(asset.bytes)}return
      }
      const privateRoute=path==='/api/auth/logout'||path==='/api/shares'||/^\/api\/shares\/[a-f0-9-]{36}$/.test(path)||path==='/api/local-projects'||path.startsWith('/api/local-projects/')
      if(privateRoute){
        const token=cookieToken(req,policy.cookieName),signed=mutation?await auth.requireCsrf(token,typeof req.headers['x-motion-manga-csrf']==='string'?req.headers['x-motion-manga-csrf']:''):await auth.session(token),ownerId=signed.session.user!.id
        if(path==='/api/auth/logout'&&method==='POST'){await body(req);await auth.logout(token);res.setHeader('Set-Cookie',sessionCookie('',policy,true));json(res,200,{ok:true});return}
        if(path==='/api/shares'){
          if(method==='GET'){json(res,200,{shares:await shares.list(ownerId)});return}
          if(method==='POST'){const value=await body(req);json(res,201,await shares.create(ownerId,String(value.snapshotId),value.expectedSnapshotRevision,value.reviewed,value.rightsConfirmed,value.attribution));return}
        }
        const share=/^\/api\/shares\/([a-f0-9-]{36})$/.exec(path)
        if(share&&['PUT','DELETE'].includes(method)){const value=await body(req);if(method==='PUT'){json(res,200,await shares.replace(ownerId,share[1],value.expectedRevision,String(value.snapshotId),value.expectedSnapshotRevision,value.reviewed,value.rightsConfirmed,value.attribution));return}if(method==='DELETE'){await shares.revoke(ownerId,share[1],value.expectedRevision);json(res,200,{ok:true});return}}
        if(path==='/api/local-projects'||path.startsWith('/api/local-projects/')){
          const importingOriginal=path==='/api/local-projects'&&method==='POST'
          if(importingOriginal&&importing)throw new LocalProjectError('busy','Another original import is being prepared. Try again.',409)
          const preparing=/\/(working|render|assistance)$/.test(path)
          if(preparing&&preparingImage)throw new LocalProjectError('busy','Another bounded image preparation is running. Try explicitly again.',409)
          const owner=owners.get(ownerId)
          let release=()=>{}
          if(mutation&&!/\/(render|assistance)$/.test(path)){const length=req.headers['content-length'];const reservation=importingOriginal?(typeof length==='string'&&/^\d+$/.test(length)?Math.min(Number(length),10*1024*1024):10*1024*1024):512*1024;release=await owners.quota.reserve(owner.originals.root,reservation,importingOriginal?1:0)}
          if(importingOriginal&&importing){release();throw new LocalProjectError('busy','Another original import is being prepared. Try again.',409)}
          if(importingOriginal)importing=true
          if(preparing)preparingImage=true
          try{await owner.handler(req,res)}finally{release();if(importingOriginal)importing=false;if(preparing)preparingImage=false}return
        }
      }
      if(path.startsWith('/api/'))throw new LocalProjectError('not_found','This resource does not exist.',404)
      await staticAsset(req,res,path)
    }catch(error){
      const failure=error instanceof LocalProjectError?error:new LocalProjectError('service_unavailable','The account service request failed. Try explicitly again.',503)
      if(!req.complete){res.setHeader('Connection','close');res.once('finish',()=>req.destroy())}
      if(failure.status===429)res.setHeader('Retry-After','60')
      if(failure.status===401)res.setHeader('Set-Cookie',sessionCookie('',boundary(),true))
      if(!res.headersSent&&!res.destroyed)json(res,failure.status,{error:{code:failure.code,message:failure.message}})
    }
  }
  const server=createServer((req,res)=>{void handler(req,res)})
  server.requestTimeout=30_000;server.headersTimeout=10_000;server.keepAliveTimeout=5000;server.maxHeadersCount=32;server.maxConnections=64;server.maxRequestsPerSocket=100
  return{server,auth,owners,shares,async close(){
    // Stop accepting requests before cancelling workers; draining requests may have just started a job.
    if(server.listening){const closed=new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()));const timeout=setTimeout(()=>server.closeAllConnections(),5000);timeout.unref();try{await closed}finally{clearTimeout(timeout)}}
    await owners.shutdown()
  }}
}
