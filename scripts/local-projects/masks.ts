import { validateProject, preparePixels, renderFrame, type LegacyContext, type LegacyMotion, type LegacyRegion } from '../../src/features/animation/engine/legacy-a-renderer.mjs'
import type { LocalDraft, RawMotion, RawSelection } from '../../src/features/local-projects/contracts.ts'
import type { WorkingSource } from './working-source.ts'
export function rawNumber(value: string, name: string, min: number, max: number): number {
  if (typeof value !== 'string' || !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(value.trim())) throw new Error(`${name} requires a finite decimal number`)
  const n = Number(value)
  if (!Number.isFinite(n) || n < min || n > max) throw new Error(`${name} is outside bounds [${min}, ${max}]`)
  return n
}
export function rasterizeSelection(selection: RawSelection, width: number, height: number, baseMask?:Uint8Array): Uint8Array {
  const x = rawNumber(selection.x,'x',0,1), y = rawNumber(selection.y,'y',0,1), w = rawNumber(selection.width,'width',Number.EPSILON,1), h = rawNumber(selection.height,'height',Number.EPSILON,1)
  if (x+w > 1+1e-12 || y+h > 1+1e-12) throw new Error('Rectangle leaves working image bounds')
  if (!Array.isArray(selection.strokes) || selection.strokes.length > 256) throw new Error('Too many brush strokes')
  if(baseMask && baseMask.length!==width*height) throw new Error('Model mask dimensions mismatch')
  const mask = baseMask ? Uint8Array.from(baseMask) : new Uint8Array(width*height)
  if(!baseMask) for (let yy=0;yy<height;yy++) for (let xx=0;xx<width;xx++) if ((xx+.5)/width >= x && (xx+.5)/width < x+w && (yy+.5)/height >= y && (yy+.5)/height < y+h) mask[yy*width+xx]=255
  let count=0,brushWork=0
  for (const stroke of selection.strokes) {
    const radius=rawNumber(stroke.radius,'brush radius',.001,.25)*Math.min(width,height)
    if (!['add','erase'].includes(stroke.mode) || !Array.isArray(stroke.points) || !stroke.points.length || (count+=stroke.points.length)>8192) throw new Error('Invalid or excessive brush points')
    for(const p of stroke.points) if(!Number.isFinite(p.x)||!Number.isFinite(p.y)||p.x<0||p.y<0||p.x>1||p.y>1) throw new Error('Brush point leaves bounds')
    // Distance to each line segment stamps a continuous circular brush, not isolated dots.
    for(let i=0;i<stroke.points.length;i++) {
      const a=stroke.points[Math.max(0,i-1)],b=stroke.points[i], ax=a.x*width,ay=a.y*height,bx=b.x*width,by=b.y*height, vx=bx-ax,vy=by-ay,len=vx*vx+vy*vy
      brushWork+=(Math.abs(bx-ax)+radius*2+2)*(Math.abs(by-ay)+radius*2+2)
      if(brushWork>2_000_000) throw new Error('Brush strokes exceed the bounded rasterization budget')
      for(let yy=Math.max(0,Math.floor(Math.min(ay,by)-radius));yy<Math.min(height,Math.ceil(Math.max(ay,by)+radius));yy++) for(let xx=Math.max(0,Math.floor(Math.min(ax,bx)-radius));xx<Math.min(width,Math.ceil(Math.max(ax,bx)+radius));xx++) {
        const t=len ? Math.max(0,Math.min(1,((xx+.5-ax)*vx+(yy+.5-ay)*vy)/len)) : 0
        if(Math.hypot(xx+.5-ax-t*vx,yy+.5-ay-t*vy)<=radius) mask[yy*width+xx]=stroke.mode==='add'?255:0
      }
    }
  }
  if(!mask.some(Boolean)) throw new Error('Region mask is empty')
  return mask
}
function translateMotion(raw: RawMotion): LegacyMotion {
  const base: LegacyMotion = { type:raw.type, anchor:[.5,.5], dx:0,dy:0,angle:0,start:0,duration:1,cycles:1,endState:raw.endState,easing:raw.easing }
  if(raw.type==='static') return base
  base.start=rawNumber(raw.start,'start',0,6); base.duration=rawNumber(raw.duration,'duration',.04,6)
  if(raw.type==='translate') { base.dx=rawNumber(raw.dx,'dx',-1,1);base.dy=rawNumber(raw.dy,'dy',-1,1) }
  if(raw.type==='rotate') { base.angle=rawNumber(raw.angle,'angle',-45,45);base.anchor=[rawNumber(raw.anchorX,'anchorX',0,1),rawNumber(raw.anchorY,'anchorY',0,1)] }
  if(raw.type==='rotate') {
    base.cycles=rawNumber(raw.cycles,'cycles',1,12)
    if(raw.period.trim()) base.period=rawNumber(raw.period,'period',.12,6)
    if(base.cycles>1 && base.period===undefined) throw new Error('Finite repetitions require a rotation gesture period')
    if(raw.pause.trim()) base.pause=rawNumber(raw.pause,'pause',0,6)
    if(raw.wristInfluence.trim()) base.wristInfluence=rawNumber(raw.wristInfluence,'wristInfluence',.001,1)
  }
  return base
}
export interface PreparedDraft { context: LegacyContext; duration: number; fps: number; frameCount: number }
export function prepareDraft(working: WorkingSource, draft: LocalDraft, modelMasks:Record<string,Uint8Array>={}, validateOnly=false): PreparedDraft {
  if(draft.sourceVersion!==working.sourceVersion || draft.normalizationVersion!=='working-image-v1') throw new Error('Draft source/version does not match immutable original')
  const regions: LegacyRegion[]=[], protectMasks:Uint8Array[]=[], foregroundMasks:Uint8Array[]=[]
  if(draft.regions.length>16) throw new Error('At most 16 regions are allowed')
  const ids=new Set<string>()
  for(const region of draft.regions) {
    if(!/^[a-zA-Z0-9_-]{1,64}$/.test(region.id)||ids.has(region.id)) throw new Error('Invalid or duplicate region identifier')
    ids.add(region.id)
    if(region.maskId && !modelMasks[region.maskId]) throw new Error('Model mask is missing or does not match source')
    const mask=rasterizeSelection(region.selection,working.width,working.height,region.maskId?modelMasks[region.maskId]:undefined)
    if(region.role==='protected') protectMasks.push(mask)
    else if(region.role==='foreground') foregroundMasks.push(mask)
    else if(region.role==='actor') regions.push({id:region.id,maskPath:`internal:${region.id}`,mask,motion:translateMotion(region.motion)})
    else throw new Error('Unknown region role')
  }
  const project=validateProject({sourcePath:'internal:working',duration:rawNumber(draft.duration,'duration',.1,6),fps:rawNumber(draft.fps,'fps',1,24),regions})
  const frameCount=Math.ceil(project.duration*project.fps)
  // Bound worst-case background completion CPU work before entering legacy preparation.
  const movingArea=regions.filter(r=>r.motion.type!=='static').reduce((n,r)=>n+r.mask.filter(Boolean).length,0)
  if(movingArea>200_000) throw new Error('Moving masks exceed the bounded local preparation budget (200000 pixels)')
  return { context:preparePixels({source:working.pixels,width:working.width,height:working.height,regions:validateOnly?[]:project.regions,protectMasks,foregroundMasks}),duration:project.duration,fps:project.fps,frameCount }
}
export function frameForDraft(prepared: PreparedDraft,time:number,staticOnly=false):Buffer { return renderFrame(prepared.context,time,{static:staticOnly}) }
