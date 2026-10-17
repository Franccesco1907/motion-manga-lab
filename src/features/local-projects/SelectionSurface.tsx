import { useEffect, useId, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import type { NormalizedPoint, RawRegion } from './contracts'
import { finiteRaw, SELECTION_TOOL, type SelectionTool } from './draft-editing'
import { SURFACE_INTERACTION, type SelectionInteraction, type SelectionImageSize } from './selection-geometry'
export type { SelectionInteraction } from './selection-geometry'
import './SelectionSurface.css'

interface SelectionSurfaceProps {
  region: RawRegion
  imageUrl: string
  maskUrl?: string
  tool: SelectionTool
  radius: string
  interaction?: SelectionInteraction
  onDimensions?: (size: SelectionImageSize) => void
  onChange: (region: RawRegion) => void
}
interface LoadedImage extends SelectionImageSize { url: string }
interface Gesture {
  pointerId: number
  points: NormalizedPoint[]
  region: RawRegion
  interaction: SelectionInteraction
  tool: SelectionTool
  radius: string
}

const clamp = (value: number, min = 0, max = 1) => Math.max(min, Math.min(max, value))
const raw = (value: number) => String(Number(value.toFixed(6)))
function rectangle(region: RawRegion) {
  const x = finiteRaw(region.selection.x), y = finiteRaw(region.selection.y)
  const width = finiteRaw(region.selection.width), height = finiteRaw(region.selection.height)
  if (x === undefined || y === undefined || width === undefined || height === undefined || x < 0 || y < 0 || width <= 0 || height <= 0 || x + width > 1 + 1e-12 || y + height > 1 + 1e-12) return
  return { x, y, width, height }
}
function pivot(region: RawRegion): NormalizedPoint | undefined {
  const x = finiteRaw(region.motion.anchorX), y = finiteRaw(region.motion.anchorY)
  return x !== undefined && y !== undefined && x >= 0 && x <= 1 && y >= 0 && y <= 1 ? { x, y } : undefined
}
function guideNumber(value: string | undefined, min: number, max: number): number | undefined {
  if (value === undefined || !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(value.trim())) return
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed >= min && parsed <= max ? parsed : undefined
}
function movementGuide(region: RawRegion, size: SelectionImageSize) {
  const x = guideNumber(region.motion.anchorX, 0, 1), y = guideNumber(region.motion.anchorY, 0, 1)
  if (x === undefined || y === undefined) return
  let angle = 0, scaleX = 1, scaleY = 1, summary: string
  if (region.motion.type === 'rotate') {
    const value = guideNumber(region.motion.angle, -45, 45)
    if (value === undefined) return
    angle = value; summary = `Rotate ${raw(angle)}°`
  } else if (region.motion.type === 'scale') {
    const value = guideNumber(region.motion.scale, 0.75, 1.25)
    if (value === undefined) return
    scaleX = value; scaleY = value; summary = `Scale ${raw(value * 100)}%`
  } else if (region.motion.type === 'stretch') {
    const horizontal = guideNumber(region.motion.scaleX, 0.75, 1.25), vertical = guideNumber(region.motion.scaleY, 0.75, 1.25)
    if (horizontal === undefined || vertical === undefined) return
    scaleX = horizontal; scaleY = vertical; summary = `Stretch ${raw(horizontal * 100)}% × ${raw(vertical * 100)}%`
  } else return
  const origin = `translate(${x * size.width} ${y * size.height})`
  return { origin, transform: `${origin} rotate(${angle}) scale(${scaleX} ${scaleY})`, radius: Math.min(size.width, size.height) * 0.14, summary }
}
function updateGesture(gesture: Gesture): RawRegion {
  const start = gesture.points[0], end = gesture.points[gesture.points.length - 1], region = gesture.region
  if (gesture.interaction === SURFACE_INTERACTION.PIVOT) return { ...region, motion: { ...region.motion, anchorX: raw(end.x), anchorY: raw(end.y) } }
  if (gesture.interaction === SURFACE_INTERACTION.DIRECTION) {
    const origin = pivot(region)
    return origin ? { ...region, motion: { ...region.motion, dx: raw(end.x - origin.x), dy: raw(end.y - origin.y) } } : region
  }
  if (gesture.interaction === SURFACE_INTERACTION.SELECT && gesture.tool !== SELECTION_TOOL.RECTANGLE) {
    return { ...region, selection: { ...region.selection, strokes: [...region.selection.strokes, { mode: gesture.tool, radius: gesture.radius, points: gesture.points }] } }
  }
  const box = rectangle(region)
  let x = Math.min(start.x, end.x), y = Math.min(start.y, end.y), width = Math.abs(end.x - start.x), height = Math.abs(end.y - start.y)
  if (gesture.interaction === SURFACE_INTERACTION.MOVE && box) {
    x = clamp(box.x + end.x - start.x, 0, 1 - box.width); y = clamp(box.y + end.y - start.y, 0, 1 - box.height)
    width = box.width; height = box.height
  }
  if (gesture.interaction === SURFACE_INTERACTION.RESIZE && box) {
    x = box.x; y = box.y; width = clamp(end.x - x, 0, 1 - x); height = clamp(end.y - y, 0, 1 - y)
  }
  if (width <= 0 || height <= 0) return region
  return { ...region, selection: { x: raw(x), y: raw(y), width: raw(width), height: raw(height), strokes: [] } }
}

export function SelectionSurface({ region, imageUrl, maskUrl, tool, radius, interaction = SURFACE_INTERACTION.SELECT, onDimensions, onChange }: SelectionSurfaceProps) {
  const maskId = useId(), arrowId = useId(), helpId = useId(), selectedId = useId(), guideId = useId()
  const [gesture, setGesture] = useState<Gesture>()
  const [loaded, setLoaded] = useState<LoadedImage>()
  const [failedUrl, setFailedUrl] = useState('')
  const active = useRef<Gesture | undefined>(undefined)
  const surface = useRef<HTMLDivElement>(null)
  const image = useRef<HTMLImageElement>(null)
  const dimensionsCallback = useRef(onDimensions)
  useEffect(() => { dimensionsCallback.current = onDimensions }, [onDimensions])
  const size = loaded?.url === imageUrl && failedUrl !== imageUrl ? loaded : undefined
  const simpleRectangle = !region.maskId && region.selection.strokes.length === 0

  function release(pointerId: number) {
    const element = surface.current
    if (element?.hasPointerCapture?.(pointerId)) element.releasePointerCapture?.(pointerId)
  }
  function cancel() {
    const current = active.current
    active.current = undefined
    setGesture(undefined)
    if (current) release(current.pointerId)
  }
  useEffect(() => {
    const element = surface.current
    function abandon() {
      const current = active.current
      active.current = undefined
      setGesture(undefined)
      if (current && element?.hasPointerCapture?.(current.pointerId)) element.releasePointerCapture?.(current.pointerId)
    }
    function visibility() { if (document.hidden) abandon() }
    window.addEventListener('blur', abandon)
    document.addEventListener('visibilitychange', visibility)
    return () => { abandon(); window.removeEventListener('blur', abandon); document.removeEventListener('visibilitychange', visibility) }
  }, [region.id, imageUrl, interaction, tool, radius])

  function imageLoaded() {
    const element = image.current
    if (!element || !element.naturalWidth || !element.naturalHeight) return
    const dimensions = { width: element.naturalWidth, height: element.naturalHeight }
    setFailedUrl('')
    setLoaded({ ...dimensions, url: imageUrl })
    dimensionsCallback.current?.(dimensions)
  }
  function point(event: PointerEvent<HTMLElement>): NormalizedPoint | undefined {
    const box = image.current?.getBoundingClientRect()
    if (!box?.width || !box.height) return
    return { x: clamp((event.clientX - box.left) / box.width), y: clamp((event.clientY - box.top) / box.height) }
  }
  function down(event: PointerEvent<HTMLElement>, mode = interaction) {
    if (event.button !== 0 || event.isPrimary === false || active.current || !size) return
    if ((mode === SURFACE_INTERACTION.MOVE || mode === SURFACE_INTERACTION.RESIZE || (mode === SURFACE_INTERACTION.SELECT && tool === SELECTION_TOOL.RECTANGLE)) && !simpleRectangle) return
    if ((mode === SURFACE_INTERACTION.MOVE || mode === SURFACE_INTERACTION.RESIZE) && !rectangle(region)) return
    if (mode === SURFACE_INTERACTION.DIRECTION && (region.motion.type !== 'translate' || !pivot(region))) return
    const position = point(event)
    if (!position) return
    active.current = { pointerId: event.pointerId, points: [position], region, interaction: mode, tool, radius }
    setGesture(active.current)
    surface.current?.setPointerCapture?.(event.pointerId)
  }
  function move(event: PointerEvent<HTMLElement>) {
    const position = point(event)
    if (!active.current || active.current.pointerId !== event.pointerId || !position) return
    active.current = { ...active.current, points: [...active.current.points, position] }
    setGesture(active.current)
  }
  function up(event: PointerEvent<HTMLElement>) {
    const current = active.current, position = point(event)
    if (!current || current.pointerId !== event.pointerId || !position) return
    const next = updateGesture({ ...current, points: [...current.points, position] })
    active.current = undefined
    setGesture(undefined)
    release(event.pointerId)
    if (next !== current.region) onChange(next)
  }
  function keyboard(event: KeyboardEvent<HTMLButtonElement>, mode: SelectionInteraction) {
    const offsets: Record<string, NormalizedPoint> = { ArrowLeft: { x: -1, y: 0 }, ArrowRight: { x: 1, y: 0 }, ArrowUp: { x: 0, y: -1 }, ArrowDown: { x: 0, y: 1 } }
    const offset = offsets[event.key]
    if (!offset || !size) return
    event.preventDefault()
    const step = event.shiftKey ? 0.025 : 0.005
    const origin = pivot(region)
    if (mode === SURFACE_INTERACTION.PIVOT && origin) onChange({ ...region, motion: { ...region.motion, anchorX: raw(clamp(origin.x + offset.x * step)), anchorY: raw(clamp(origin.y + offset.y * step)) } })
    if (mode === SURFACE_INTERACTION.DIRECTION) {
      const dx = finiteRaw(region.motion.dx), dy = finiteRaw(region.motion.dy)
      if (dx !== undefined && dy !== undefined) onChange({ ...region, motion: { ...region.motion, dx: raw(clamp(dx + offset.x * step, -1, 1)), dy: raw(clamp(dy + offset.y * step, -1, 1)) } })
    }
    const box = simpleRectangle ? rectangle(region) : undefined
    if (box && mode === SURFACE_INTERACTION.MOVE) onChange({ ...region, selection: { ...region.selection, x: raw(clamp(box.x + offset.x * step, 0, 1 - box.width)), y: raw(clamp(box.y + offset.y * step, 0, 1 - box.height)) } })
    if (box && mode === SURFACE_INTERACTION.RESIZE) onChange({ ...region, selection: { ...region.selection, width: raw(clamp(box.width + offset.x * step, 0.001, 1 - box.x)), height: raw(clamp(box.height + offset.y * step, 0.001, 1 - box.y)) } })
  }
  const preview = gesture ? updateGesture(gesture) : region
  const box = rectangle(preview), anchor = pivot(preview)
  const dx = finiteRaw(preview.motion.dx), dy = finiteRaw(preview.motion.dy)
  const endpoint = anchor && dx !== undefined && dy !== undefined ? { x: anchor.x + dx, y: anchor.y + dy } : undefined
  const showPivot = interaction === SURFACE_INTERACTION.PIVOT || ['rotate', 'scale', 'stretch'].includes(region.motion.type)
  const showDirection = region.motion.type === 'translate' && endpoint
  const rectangleBlocked = !simpleRectangle && (interaction === SURFACE_INTERACTION.MOVE || interaction === SURFACE_INTERACTION.RESIZE || (interaction === SURFACE_INTERACTION.SELECT && tool === SELECTION_TOOL.RECTANGLE))
  const imageWidth = size?.width ?? 1, imageHeight = size?.height ?? 1
  const brushes = preview.selection.strokes
  const hasGuide = preview.role === 'actor' && ['rotate', 'scale', 'stretch'].includes(preview.motion.type)
  const guide = hasGuide && size ? movementGuide(preview, size) : undefined

  return <div className="selection-surface-group">
    <p id={selectedId} className="selection-surface-selected">Selected part: {region.label.trim() || 'Untitled part'}</p>
    <div ref={surface} className={`selection-surface selection-surface--${interaction}`} aria-label="Working image selection surface" aria-describedby={`${selectedId} ${helpId}${hasGuide ? ` ${guideId}` : ''}`}
      onPointerDown={event => down(event)} onPointerMove={move} onPointerUp={up} onPointerCancel={cancel} onLostPointerCapture={cancel}>
      <img ref={image} src={imageUrl} alt="Working copy for manual selection" draggable={false} onLoad={imageLoaded} onError={() => { cancel(); setFailedUrl(imageUrl) }} />
      {size && <svg viewBox={`0 0 ${imageWidth} ${imageHeight}`} preserveAspectRatio="none" aria-hidden="true">
        <defs>
          <mask id={maskId} maskUnits="userSpaceOnUse" maskContentUnits="userSpaceOnUse" x="0" y="0" width={imageWidth} height={imageHeight} style={{ maskType: 'luminance' }}>
            {region.maskId ? (maskUrl && <image href={maskUrl} width={imageWidth} height={imageHeight} preserveAspectRatio="none" />)
              : box && <rect x={box.x * imageWidth} y={box.y * imageHeight} width={box.width * imageWidth} height={box.height * imageHeight} fill="white" />}
            {brushes.map((stroke, index) => {
              const ratio = finiteRaw(stroke.radius)
              if (ratio === undefined || ratio <= 0) return null
              const r = ratio * Math.min(imageWidth, imageHeight)
              return <g key={index} fill={stroke.mode === 'add' ? 'white' : 'black'} stroke={stroke.mode === 'add' ? 'white' : 'black'}>
                <polyline points={stroke.points.map(p => `${p.x * imageWidth},${p.y * imageHeight}`).join(' ')} fill="none" strokeWidth={r * 2} strokeLinecap="round" strokeLinejoin="round" />
                {stroke.points.map((p, i) => <circle key={i} cx={p.x * imageWidth} cy={p.y * imageHeight} r={r} stroke="none" />)}
              </g>
            })}
          </mask>
          <marker id={arrowId} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="var(--cobalt, #3158c9)" /></marker>
        </defs>
        <rect width={imageWidth} height={imageHeight} fill="var(--cobalt, #3158c9)" opacity="0.34" mask={`url(#${maskId})`} />
        {simpleRectangle && box && <rect x={box.x * imageWidth} y={box.y * imageHeight} width={box.width * imageWidth} height={box.height * imageHeight} fill="none" stroke="var(--cobalt, #3158c9)" strokeWidth="2" vectorEffect="non-scaling-stroke" />}
        {guide && <>
          <g className="selection-movement-reference" transform={guide.origin}>
            <path d={`M ${-guide.radius} 0 H ${guide.radius} M 0 ${-guide.radius} V ${guide.radius}`} vectorEffect="non-scaling-stroke" />
          </g>
          <g className="selection-movement-guide" transform={guide.transform}>
            <line x1={-guide.radius} y1="0" x2={guide.radius} y2="0" vectorEffect="non-scaling-stroke" markerEnd={`url(#${arrowId})`} />
            <line x1="0" y1={guide.radius} x2="0" y2={-guide.radius} vectorEffect="non-scaling-stroke" markerEnd={`url(#${arrowId})`} />
          </g>
        </>}
        {showDirection && anchor && <line x1={anchor.x * imageWidth} y1={anchor.y * imageHeight} x2={endpoint.x * imageWidth} y2={endpoint.y * imageHeight} stroke="var(--cobalt, #3158c9)" strokeWidth="2" vectorEffect="non-scaling-stroke" markerEnd={`url(#${arrowId})`} />}
      </svg>}
      {size && showPivot && anchor && <button className="selection-gizmo selection-gizmo--pivot" type="button" aria-label="Move motion pivot" style={{ left: `${anchor.x * 100}%`, top: `${anchor.y * 100}%` }}
        onPointerDown={event => { event.stopPropagation(); down(event, SURFACE_INTERACTION.PIVOT) }} onKeyDown={event => keyboard(event, SURFACE_INTERACTION.PIVOT)}>+</button>}
      {size && showDirection && endpoint && endpoint.x >= 0 && endpoint.x <= 1 && endpoint.y >= 0 && endpoint.y <= 1 && <button className="selection-gizmo selection-gizmo--direction" type="button" aria-label="Move motion direction" style={{ left: `${endpoint.x * 100}%`, top: `${endpoint.y * 100}%` }}
        onPointerDown={event => { event.stopPropagation(); down(event, SURFACE_INTERACTION.DIRECTION) }} onKeyDown={event => keyboard(event, SURFACE_INTERACTION.DIRECTION)}>↗</button>}
      {size && simpleRectangle && box && interaction === SURFACE_INTERACTION.MOVE && <button className="selection-gizmo" type="button" aria-label="Move rectangle selection" style={{ left: `${(box.x + box.width / 2) * 100}%`, top: `${(box.y + box.height / 2) * 100}%` }}
        onPointerDown={event => { event.stopPropagation(); down(event, SURFACE_INTERACTION.MOVE) }} onKeyDown={event => keyboard(event, SURFACE_INTERACTION.MOVE)}>↔</button>}
      {size && simpleRectangle && box && interaction === SURFACE_INTERACTION.RESIZE && <button className="selection-gizmo" type="button" aria-label="Resize rectangle selection" style={{ left: `${(box.x + box.width) * 100}%`, top: `${(box.y + box.height) * 100}%` }}
        onPointerDown={event => { event.stopPropagation(); down(event, SURFACE_INTERACTION.RESIZE) }} onKeyDown={event => keyboard(event, SURFACE_INTERACTION.RESIZE)}>↘</button>}
    </div>
    {hasGuide && <div id={guideId} className="selection-movement-caption" title="Pivot axes only; the selection stays unchanged.">
      <strong>Movement guide — not rendered preview</strong>
      {guide ? <span>· <span>{guide.summary}</span></span>
        : size ? <span>Enter valid pivot and movement values to show the guide.</span> : null}
    </div>}
    <p id={helpId} className="selection-surface-help">{rectangleBlocked ? 'This mask has refinements. Use Add or Erase, or explicitly replace it before editing a rectangle.' : 'Drag to edit. Focus a handle and use arrow keys; Shift makes larger adjustments. Exact values are available in Advanced.'}</p>
    {!size && failedUrl !== imageUrl && <p role="status">Loading working image. Selection editing starts after its dimensions are available.</p>}
    {failedUrl === imageUrl && <p role="alert">Working image could not be displayed. Your selection is unchanged; reload the editor or use the original view.</p>}
    {region.maskId && !maskUrl && <p role="status">Model mask preview unavailable. Its bounds are unknown; the selection is preserved.</p>}
  </div>
}
