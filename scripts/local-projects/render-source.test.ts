// @vitest-environment node
import { describe, expect, it } from 'vitest'
import sharp from 'sharp'
import { createWorkingSource } from './working-source.ts'
import { rasterizeSelection, prepareDraft, frameForDraft } from './masks.ts'
import { region, draft } from './render-fixtures.ts'
describe('working source and manual masks', () => {
  it('derives deterministic EXIF-oriented RGB PNG without mutating originals', async () => {
    const original = await sharp({ create: { width: 1600, height: 800, channels: 3, background: '#ff2233' } }).jpeg().withMetadata({ orientation: 6 }).toBuffer()
    const copy = Buffer.from(original), a = await createWorkingSource(original), b = await createWorkingSource(original)
    expect([a.width, a.height]).toEqual([640,1280]); expect(a.pixels.length).toBe(640*1280*3)
    expect(a.png).toEqual(b.png); expect(original).toEqual(copy); expect(a.sourceVersion).toMatch(/^[a-f0-9]{64}$/)
  })
  it('rasterizes rectangles and continuous add/erase brushes using normalized working fractions', () => {
    const mask = rasterizeSelection({ x: '.1', y: '.1', width: '.3', height: '.3', strokes: [{ mode: 'erase', radius: '.09', points: [{ x: .2, y: .2 }] }, { mode: 'add', radius: '.05', points: [{ x: .5,y: .5 }, { x: .8,y:.5 }] }] }, 20,20)
    expect(mask[4*20+4]).toBe(0); expect(mask[10*20+13]).toBe(255); expect(mask[0]).toBe(0)
    expect(() => rasterizeSelection({ x: '.9', y: '.1', width: '.2', height: '.1', strokes: [] },20,20)).toThrow(/bounds/)
  })
  it('rejects empty/nonfinite raw values, source mismatches and unsafe geometry', async () => {
    const w = await createWorkingSource(await sharp({create:{width:16,height:16,channels:3,background:'white'}}).png().toBuffer())
    for (const value of ['', ' ', 'NaN', 'Infinity', '0x10']) expect(() => prepareDraft(w,{ ...draft(w.sourceVersion), duration:value })).toThrow()
    expect(() => prepareDraft(w,draft('f'.repeat(64)))).toThrow(/source/)
    expect(() => prepareDraft(w,draft(w.sourceVersion,[region({ selection:{x:'0',y:'0',width:'0',height:'.1',strokes:[]} })]))).toThrow()
  })
  it('uses an immutable binary model mask as the base rather than pretending its box is a cutout', async () => {
    const w = await createWorkingSource(await sharp({create:{width:20,height:20,channels:3,background:'white'}}).png().toBuffer())
    const r=region(),id='01999663-729b-4e5b-8129-24735b1fd61c';r.maskId=id
    const model=new Uint8Array(400);model[10*20+10]=255
    expect(()=>prepareDraft(w,draft(w.sourceVersion,[r]))).toThrow(/missing/)
    const prepared=prepareDraft(w,draft(w.sourceVersion,[r]),{[id]:model})
    expect(prepared.context.regions[0].mask.filter(Boolean)).toHaveLength(1)
    expect(prepared.context.regions[0].mask[10*20+10]).toBe(255)
    expect(prepared.context.regions[0].mask[5*20+5]).toBe(0)
  })
  it('rejects invalid active motion, noninteger cycles/fps and overflowing timing',async()=>{
    const w=await createWorkingSource(await sharp({create:{width:20,height:20,channels:3,background:'white'}}).png().toBuffer())
    for(const change of [{dx:''},{dx:'Infinity'},{start:'.9',duration:'.5'}]){
      const r=region();r.motion={...r.motion,type:'translate',...change}
      expect(()=>prepareDraft(w,draft(w.sourceVersion,[r]))).toThrow()
    }
    expect(()=>prepareDraft(w,{...draft(w.sourceVersion),fps:'1.5'})).toThrow()
    for(const cycles of ['1.5','2']){const r=region();r.motion={...r.motion,type:'rotate',cycles};expect(()=>prepareDraft(w,draft(w.sourceVersion,[r]))).toThrow()}
  })
  it('preserves exact static RGB and protected pixels during motion', async () => {
    const pixels = Buffer.from(Array.from({length:24*24*3},(_,i)=>i%255)), w = await createWorkingSource(await sharp(pixels,{raw:{width:24,height:24,channels:3}}).png().toBuffer())
    const moving=region(); moving.motion.type='translate'; moving.motion.dx='.1'
    const protect=region({id:'protected',role:'protected'})
    const ctx = prepareDraft(w,draft(w.sourceVersion,[moving,protect]))
    expect(frameForDraft(ctx,0,true)).toEqual(w.pixels)
    const out=frameForDraft(ctx,.5); const mask=rasterizeSelection(protect.selection,24,24)
    for(let p=0;p<mask.length;p++) if(mask[p]) expect(out.subarray(p*3,p*3+3)).toEqual(w.pixels.subarray(p*3,p*3+3))
  })
})
