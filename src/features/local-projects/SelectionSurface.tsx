import { useEffect, useId, useRef, useState, type PointerEvent } from 'react'
import type { NormalizedPoint, RawRegion } from './contracts'
import { finiteRaw, SELECTION_TOOL, type SelectionTool } from './draft-editing'
interface SelectionSurfaceProps {
  region: RawRegion
  imageUrl: string
  maskUrl?: string
  tool: SelectionTool
  radius: string
  onChange: (region: RawRegion) => void
}
interface Gesture { pointerId: number; points: NormalizedPoint[] }

export function SelectionSurface({ region, imageUrl, maskUrl, tool, radius, onChange }: SelectionSurfaceProps) {
  const maskId = useId()
  const [gesture, setGesture] = useState<Gesture>()
  const active = useRef<Gesture | undefined>(undefined)
  const surface = useRef<HTMLDivElement>(null)
  useEffect(() => {
    function cancel() { active.current = undefined; setGesture(undefined) }
    window.addEventListener('blur', cancel)
    document.addEventListener('visibilitychange', cancel)
    return () => { window.removeEventListener('blur', cancel); document.removeEventListener('visibilitychange', cancel) }
  }, [])

  function point(event: PointerEvent<HTMLDivElement>): NormalizedPoint {
    const box = event.currentTarget.getBoundingClientRect()
    return { x: Math.max(0, Math.min(1, (event.clientX - box.left) / box.width)), y: Math.max(0, Math.min(1, (event.clientY - box.top) / box.height)) }
  }
  function down(event: PointerEvent<HTMLDivElement>) {
    if (event.button !== 0 || event.isPrimary === false || active.current) return
    const rect = event.currentTarget.getBoundingClientRect()
    if (!rect.width || !rect.height) return
    active.current = { pointerId: event.pointerId, points: [point(event)] }
    setGesture(active.current)
    event.currentTarget.setPointerCapture?.(event.pointerId)
  }
  function move(event: PointerEvent<HTMLDivElement>) {
    if (!active.current || active.current.pointerId !== event.pointerId) return
    active.current = { ...active.current, points: [...active.current.points, point(event)] }
    setGesture(active.current)
  }
  function up(event: PointerEvent<HTMLDivElement>) {
    if (!active.current || active.current.pointerId !== event.pointerId) return
    const points = [...active.current.points, point(event)], start = points[0], end = points[points.length - 1]
    if (tool === SELECTION_TOOL.RECTANGLE) {
      const width = Math.abs(end.x - start.x), height = Math.abs(end.y - start.y)
      if (width > 0 && height > 0) onChange({ ...region, maskId: undefined, selection: { x: String(Math.min(start.x, end.x)), y: String(Math.min(start.y, end.y)), width: String(Number(width.toFixed(6))), height: String(Number(height.toFixed(6))), strokes: [] } })
    } else onChange({ ...region, selection: { ...region.selection, strokes: [...region.selection.strokes, { mode: tool, radius, points }] } })
    active.current = undefined
    setGesture(undefined)
    event.currentTarget.releasePointerCapture?.(event.pointerId)
  }
  const x = finiteRaw(region.selection.x), y = finiteRaw(region.selection.y), width = finiteRaw(region.selection.width), height = finiteRaw(region.selection.height)
  return <div ref={surface} className="selection-surface" aria-label="Working image selection surface"
    onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={() => { active.current = undefined; setGesture(undefined) }}>
    <img src={imageUrl} alt="Working copy for manual selection" draggable={false} />
    <svg viewBox="0 0 1 1" preserveAspectRatio="none" aria-hidden="true">
      <defs><mask id={maskId} maskUnits="userSpaceOnUse" x="0" y="0" width="1" height="1">
        {region.maskId ? (maskUrl && <image href={maskUrl} width="1" height="1" preserveAspectRatio="none" />)
          : <rect x={x} y={y} width={width} height={height} fill="white" />}
        {region.selection.strokes.map((stroke, index) => {
          const r = finiteRaw(stroke.radius)
          if (r === undefined || r <= 0) return null
          return <g key={index} fill={stroke.mode === 'add' ? 'white' : 'black'} stroke={stroke.mode === 'add' ? 'white' : 'black'}>
            <polyline points={stroke.points.map(p => `${p.x},${p.y}`).join(' ')} fill="none" strokeWidth={r * 2} strokeLinecap="round" strokeLinejoin="round" />
            {stroke.points.map((p, i) => <circle key={i} cx={p.x} cy={p.y} r={r} />)}
          </g>
        })}
      </mask></defs>
      <rect width="1" height="1" fill="#7564ff" opacity="0.45" mask={`url(#${maskId})`} />
      {!region.maskId && <rect x={x} y={y} width={width} height={height} fill="none" stroke="#5143c7" strokeWidth="0.004" />}
      {gesture && <polyline points={gesture.points.map(p => `${p.x},${p.y}`).join(' ')} fill="none" stroke="#f5f8fb" strokeWidth="0.006" />}
    </svg>
  </div>
}
