import { readFile, writeFile, rename, stat, open } from 'node:fs/promises'
import { join } from 'node:path'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { createWorkingSource } from './working-source.ts'
import { prepareDraft, frameForDraft } from './masks.ts'
import type { LocalDraft } from '../../src/features/local-projects/contracts.ts'
const folder=process.argv[2]
const original=await readFile(join(folder,'original'))
const draft=JSON.parse(await readFile(join(folder,'draft.json'),'utf8')) as LocalDraft
const working=await createWorkingSource(original)
const modelMasks:Record<string,Uint8Array>={}
for(const region of draft.regions)if(region.maskId){if(!/^[a-f0-9-]{36}$/.test(region.maskId))throw new Error('Invalid mask identifier');modelMasks[region.maskId]=await readFile(join(folder,`mask-${region.maskId}`))}
const prepared=prepareDraft(working,draft,modelMasks)
const partial=join(folder,'video.partial.webm')
// Inherit only this server-created seekable descriptor: Snap cannot see native temp paths,
// while stdout streaming prevents WebM from finalizing accurate duration/seeking metadata.
const output=await open(partial,'wx',0o600)
const proc=spawn('/snap/bin/ffmpeg',['-hide_banner','-loglevel','error','-y','-f','rawvideo','-pix_fmt','rgb24','-s',`${working.width}x${working.height}`,'-r',String(prepared.fps),'-i','pipe:0','-an','-c:v','libvpx-vp9','-threads','1','-deadline','realtime','-cpu-used','6','-crf','24','-b:v','0','-pix_fmt','yuv420p','-fs',String(32*1024*1024),'-f','webm','/proc/self/fd/3'],{stdio:['pipe','ignore','pipe',output.fd]})
const input=proc.stdin,errors=proc.stderr
if(!input||!errors)throw new Error('Encoder pipe setup failed')
let problem:Error|undefined
let stderr=''
errors.on('data',(data:Buffer)=>{stderr=(stderr+data.toString()).slice(-2048)})
input.on('error',error=>{problem=error})
const completion=new Promise<void>((resolve,reject)=>{proc.once('error',reject);proc.once('close',code=>code===0?resolve():reject(new Error(`Encoder failed (${code}): ${stderr}`)))})
void completion.catch(()=>{})
const terminate=()=>{input.destroy();proc.kill('SIGTERM');const escalation=setTimeout(()=>proc.kill('SIGKILL'),1000);escalation.unref();proc.once('close',()=>clearTimeout(escalation))}
process.on('SIGTERM',()=>{problem=new Error('Cancelled');terminate()})
const timer=setTimeout(()=>{problem=new Error('Render timeout');terminate()},120_000)
try {
  for(let frame=0;frame<prepared.frameCount;frame++) {
    if(problem) throw problem
    const rgb=frameForDraft(prepared,frame/prepared.fps)
    if(!input.write(rgb)) await Promise.race([once(input,'drain'),completion.then(()=>{throw new Error('Encoder closed before all frames')})])
  }
  input.end();await completion;if(problem) throw problem
  const info=await stat(partial)
  if(!info.size||info.size>=32*1024*1024) throw new Error('Output byte limit exceeded')
  await writeFile(join(folder,'poster.png'),working.png,{flag:'wx',mode:0o600})
  await rename(partial,join(folder,'video.webm'))
  await writeFile(join(folder,'result.json'),JSON.stringify({width:working.width,height:working.height,duration:prepared.frameCount/prepared.fps,fps:prepared.fps,frames:prepared.frameCount,sourceVersion:working.sourceVersion,rendererVersion:prepared.rendererVersion,draftSchemaVersion:prepared.draftSchemaVersion}),{flag:'wx',mode:0o600})
} catch(error) {terminate();await completion.catch(()=>{});throw error}
finally {clearTimeout(timer);await output.close()}
