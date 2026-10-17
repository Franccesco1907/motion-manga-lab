import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { RawRegion } from './contracts'
import { newRegion, SELECTION_TOOL } from './draft-editing'
import { SelectionSurface } from './SelectionSurface'
import { SURFACE_INTERACTION, type SelectionInteraction } from './selection-geometry'

class TestPointerEvent extends MouseEvent {
  readonly pointerId: number
  readonly isPrimary: boolean
  constructor(type: string, init: PointerEventInit = {}) {
    super(type, init)
    this.pointerId = init.pointerId ?? 1
    this.isPrimary = init.isPrimary ?? true
  }
}
beforeEach(() => { vi.stubGlobal('PointerEvent', TestPointerEvent) })
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks() })

function setup(region = newRegion('part'), width = 591, height = 1280, tool = SELECTION_TOOL.ADD as typeof SELECTION_TOOL[keyof typeof SELECTION_TOOL], interaction: SelectionInteraction = SURFACE_INTERACTION.SELECT) {
  const onChange = vi.fn()
  const view = render(<SelectionSurface region={region} imageUrl="blob:working" tool={tool} radius="0.02" interaction={interaction} onChange={onChange} />)
  const image = screen.getByAltText('Working copy for manual selection')
  Object.defineProperties(image, { naturalWidth: { configurable: true, value: width }, naturalHeight: { configurable: true, value: height } })
  vi.spyOn(image, 'getBoundingClientRect').mockReturnValue({ x: 10, y: 20, left: 10, top: 20, width, height, right: 10 + width, bottom: 20 + height, toJSON: () => ({}) })
  const surface = screen.getByLabelText('Working image selection surface')
  vi.spyOn(surface, 'getBoundingClientRect').mockReturnValue(image.getBoundingClientRect())
  const capture = vi.fn(), release = vi.fn()
  Object.defineProperties(surface, { setPointerCapture: { value: capture }, releasePointerCapture: { value: release }, hasPointerCapture: { value: () => true } })
  fireEvent.load(image)
  return { ...view, image, surface, onChange, capture, release }
}

it.each([[591, 1280], [1280, 591]])('renders circular native brush geometry in a %i×%i image', (width, height) => {
  const region = newRegion('part')
  region.selection.strokes = [{ mode: 'add', radius: '0.02', points: [{ x: 0.4, y: 0.7 }] }]
  const { container } = setup(region, width, height)
  const svg = container.querySelector('svg')!
  expect(svg).toHaveAttribute('viewBox', `0 0 ${width} ${height}`)
  const stamp = svg.querySelector('mask circle')!
  expect(stamp).toHaveAttribute('stroke', 'none')
  expect(Number(stamp.getAttribute('r'))).toBeCloseTo(Math.min(width, height) * 0.02)
  expect(Number(stamp.getAttribute('cx'))).toBeCloseTo(width * 0.4)
  expect(Number(stamp.getAttribute('cy'))).toBeCloseTo(height * 0.7)
})

it('does not show a seed-rectangle outline as the bounds of a refined mask', () => {
  const region = newRegion('part')
  region.selection.strokes = [{ mode: 'add', radius: '0.02', points: [{ x: 0.9, y: 0.9 }] }]
  const { container } = setup(region)
  expect(container.querySelector('svg > rect[fill="none"]')).toBeNull()
})

it('refuses rectangle gestures that would silently erase a refined selection', () => {
  const region = newRegion('part')
  region.selection.strokes = [{ mode: 'add', radius: '0.02', points: [{ x: 0.9, y: 0.9 }] }]
  const { surface, onChange } = setup(region, 100, 200, SELECTION_TOOL.RECTANGLE)
  fireEvent.pointerDown(surface, { clientX: 20, clientY: 40, button: 0, pointerId: 1 })
  fireEvent.pointerUp(surface, { clientX: 80, clientY: 160, button: 0, pointerId: 1 })
  expect(onChange).not.toHaveBeenCalled()
})

it('commits one continuous brush gesture only at pointerup and releases capture', () => {
  const { surface, onChange, release } = setup(newRegion('part'), 100, 200)
  fireEvent.pointerDown(surface, { clientX: 30, clientY: 60, pointerId: 7 })
  fireEvent.pointerMove(surface, { clientX: 50, clientY: 100, pointerId: 7 })
  expect(onChange).not.toHaveBeenCalled()
  fireEvent.pointerUp(surface, { clientX: 70, clientY: 140, pointerId: 7 })
  expect(onChange).toHaveBeenCalledTimes(1)
  const next = onChange.mock.calls[0][0] as RawRegion
  expect(next.selection.strokes).toEqual([{ mode: 'add', radius: '0.02', points: [{ x: 0.2, y: 0.2 }, { x: 0.4, y: 0.4 }, { x: 0.6, y: 0.6 }] }])
  expect(release).toHaveBeenCalledWith(7)
})

it('keeps native add/erase order and rounds continuous brush segments in the preview', () => {
  const region = newRegion('part')
  region.selection.strokes = [
    { mode: 'add', radius: '0.04', points: [{ x: 0.1, y: 0.2 }, { x: 0.8, y: 0.6 }] },
    { mode: 'erase', radius: '0.02', points: [{ x: 0.5, y: 0.4 }] },
    { mode: 'add', radius: '0.01', points: [{ x: 0.5, y: 0.4 }] },
  ]
  const { container } = setup(region, 100, 200)
  const strokes = container.querySelectorAll('mask > g')
  expect([...strokes].map(stroke => stroke.getAttribute('fill'))).toEqual(['white', 'black', 'white'])
  const line = strokes[0].querySelector('polyline')!
  expect(line).toHaveAttribute('points', '10,40 80,120')
  expect(line).toHaveAttribute('stroke-width', '8')
  expect(line).toHaveAttribute('stroke-linecap', 'round')
  expect(line).toHaveAttribute('stroke-linejoin', 'round')
})

it.each(['cancel', 'blur', 'hidden', 'capture'] as const)('abandons an interrupted %s gesture without changing the selection', interrupt => {
  const { surface, onChange, release } = setup(newRegion('part'), 100, 200)
  fireEvent.pointerDown(surface, { clientX: 30, clientY: 60, pointerId: 7 })
  if (interrupt === 'cancel') fireEvent.pointerCancel(surface, { pointerId: 7 })
  if (interrupt === 'capture') fireEvent.lostPointerCapture(surface, { pointerId: 7 })
  if (interrupt === 'blur') fireEvent(window, new Event('blur'))
  if (interrupt === 'hidden') {
    vi.spyOn(document, 'hidden', 'get').mockReturnValue(true)
    fireEvent(document, new Event('visibilitychange'))
  }
  fireEvent.pointerUp(surface, { clientX: 70, clientY: 140, pointerId: 7 })
  expect(onChange).not.toHaveBeenCalled()
  expect(release).toHaveBeenCalledWith(7)
})

it('ignores unrelated pointers and commits only the primary contact', () => {
  const { surface, onChange } = setup(newRegion('part'), 100, 200)
  fireEvent.pointerDown(surface, { clientX: 30, clientY: 60, pointerId: 1 })
  fireEvent.pointerDown(surface, { clientX: 60, clientY: 80, pointerId: 2, isPrimary: false })
  fireEvent.pointerMove(surface, { clientX: 60, clientY: 100, pointerId: 2 })
  fireEvent.pointerUp(surface, { clientX: 70, clientY: 140, pointerId: 2 })
  expect(onChange).not.toHaveBeenCalled()
  fireEvent.pointerUp(surface, { clientX: 70, clientY: 140, pointerId: 1 })
  expect(onChange).toHaveBeenCalledTimes(1)
  const next = onChange.mock.calls[0][0] as RawRegion
  expect(next.selection.strokes[0].points).toEqual([{ x: 0.2, y: 0.2 }, { x: 0.6, y: 0.6 }])
})

it('uses the displayed image geometry rather than surrounding-container dimensions', () => {
  const { surface, onChange } = setup(newRegion('part'), 100, 200)
  vi.mocked(surface.getBoundingClientRect).mockReturnValue({ x: 0, y: 0, left: 0, top: 0, width: 500, height: 500, right: 500, bottom: 500, toJSON: () => ({}) })
  fireEvent.pointerDown(surface, { clientX: 60, clientY: 120, pointerId: 1 })
  fireEvent.pointerUp(surface, { clientX: 60, clientY: 120, pointerId: 1 })
  const next = onChange.mock.calls[0][0] as RawRegion
  expect(next.selection.strokes[0].points[0]).toEqual({ x: 0.5, y: 0.5 })
})

it('preserves model pixels while refusing rectangle replacement and offering a missing-preview notice', () => {
  const region = { ...newRegion('part'), maskId: 'assisted-mask' }
  const { surface, onChange, container } = setup(region, 100, 200, SELECTION_TOOL.RECTANGLE)
  expect(screen.getByText(/Model mask preview unavailable/)).toBeInTheDocument()
  expect(container.querySelector('svg > rect[fill="none"]')).toBeNull()
  fireEvent.pointerDown(surface, { clientX: 30, clientY: 60, pointerId: 1 })
  fireEvent.pointerUp(surface, { clientX: 70, clientY: 140, pointerId: 1 })
  expect(onChange).not.toHaveBeenCalled()
})

it('exposes decoded working dimensions and keeps failed images static and noneditable', () => {
  const onChange = vi.fn(), onDimensions = vi.fn()
  render(<SelectionSurface region={newRegion('part')} imageUrl="blob:working" tool={SELECTION_TOOL.ADD} radius="0.02" onChange={onChange} onDimensions={onDimensions} />)
  const image = screen.getByAltText('Working copy for manual selection')
  const surface = screen.getByLabelText('Working image selection surface')
  fireEvent.pointerDown(surface, { clientX: 30, clientY: 60, pointerId: 1 })
  fireEvent.pointerUp(surface, { clientX: 70, clientY: 140, pointerId: 1 })
  expect(onChange).not.toHaveBeenCalled()
  Object.defineProperties(image, { naturalWidth: { configurable: true, value: 591 }, naturalHeight: { configurable: true, value: 1280 } })
  fireEvent.load(image)
  expect(onDimensions).toHaveBeenCalledWith({ width: 591, height: 1280 })
  fireEvent.error(image)
  expect(screen.getByRole('alert')).toHaveTextContent('Your selection is unchanged')
  expect(surface.querySelector('svg')).toBeNull()
  expect(image).toBeInTheDocument()
})

it('moves and resizes only rectangle geometry without changing motion or crossing image edges', () => {
  const region = newRegion('part')
  const view = setup(region, 100, 200, SELECTION_TOOL.RECTANGLE, SURFACE_INTERACTION.MOVE)
  fireEvent.pointerDown(view.surface, { clientX: 50, clientY: 100, pointerId: 1 })
  fireEvent.pointerUp(view.surface, { clientX: 110, clientY: 220, pointerId: 1 })
  const moved = view.onChange.mock.calls[0][0] as RawRegion
  expect(moved.selection).toEqual({ ...region.selection, x: '0.75', y: '0.75' })
  expect(moved.motion).toEqual(region.motion)
  view.unmount()
  const resized = setup(region, 100, 200, SELECTION_TOOL.RECTANGLE, SURFACE_INTERACTION.RESIZE)
  fireEvent.pointerDown(resized.surface, { clientX: 60, clientY: 120, pointerId: 1 })
  fireEvent.pointerUp(resized.surface, { clientX: 80, clientY: 180, pointerId: 1 })
  expect((resized.onChange.mock.calls[0][0] as RawRegion).selection).toEqual({ ...region.selection, width: '0.45', height: '0.55' })
})

it('edits a visual pivot once per gesture and supports arrow-key equivalents without changing the mask', () => {
  const region = newRegion('part')
  region.motion.type = 'rotate'
  const { surface, onChange } = setup(region, 100, 200, SELECTION_TOOL.RECTANGLE, SURFACE_INTERACTION.PIVOT)
  const handle = screen.getByRole('button', { name: 'Move motion pivot' })
  fireEvent.pointerDown(handle, { clientX: 60, clientY: 120, pointerId: 1 })
  fireEvent.pointerMove(surface, { clientX: 80, clientY: 180, pointerId: 1 })
  expect(onChange).not.toHaveBeenCalled()
  fireEvent.pointerUp(surface, { clientX: 80, clientY: 180, pointerId: 1 })
  const next = onChange.mock.calls[0][0] as RawRegion
  expect(next.motion.anchorX).toBe('0.7')
  expect(next.motion.anchorY).toBe('0.8')
  expect(next.selection).toEqual(region.selection)
  fireEvent.keyDown(handle, { key: 'ArrowRight' })
  expect((onChange.mock.calls[1][0] as RawRegion).motion.anchorX).toBe('0.505')
})

it('edits translation direction from the current pivot and preserves raw unrelated fields', () => {
  const region = newRegion('part')
  region.motion = { ...region.motion, type: 'translate', duration: '-', anchorX: '0.3', anchorY: '0.4', dx: '0.1', dy: '0.1' }
  const { surface, onChange } = setup(region, 100, 200, SELECTION_TOOL.ADD, SURFACE_INTERACTION.DIRECTION)
  const handle = screen.getByRole('button', { name: 'Move motion direction' })
  fireEvent.pointerDown(handle, { clientX: 50, clientY: 120, pointerId: 1 })
  fireEvent.pointerUp(surface, { clientX: 80, clientY: 180, pointerId: 1 })
  const next = onChange.mock.calls[0][0] as RawRegion
  expect(next.motion).toEqual({ ...region.motion, dx: '0.4', dy: '0.4' })
  expect(next.selection).toEqual(region.selection)
  fireEvent.keyDown(handle, { key: 'ArrowUp', shiftKey: true })
  expect((onChange.mock.calls[1][0] as RawRegion).motion.dy).toBe('0.075')
})

it('identifies the selected part immediately when the selection changes', () => {
  const region = { ...newRegion('hair'), label: 'Hair' }
  const { rerender, onChange } = setup(region)
  expect(screen.getByText('Selected part: Hair')).toBeInTheDocument()
  rerender(<SelectionSurface region={{ ...region, id: 'scarf', label: 'Scarf' }} imageUrl="blob:working" tool={SELECTION_TOOL.ADD} radius="0.02" onChange={onChange} />)
  expect(screen.getByText('Selected part: Scarf')).toBeInTheDocument()
  expect(screen.queryByText('Selected part: Hair')).not.toBeInTheDocument()
  expect(onChange).not.toHaveBeenCalled()
})

it.each([
  { type: 'rotate' as const, initial: { angle: '10' }, next: { angle: '-20' }, initialText: 'Rotate 10°', nextText: 'Rotate -20°', nextTransform: 'translate(50 100) rotate(-20) scale(1 1)' },
  { type: 'scale' as const, initial: { scale: '1.05' }, next: { scale: '1.2' }, initialText: 'Scale 105%', nextText: 'Scale 120%', nextTransform: 'translate(50 100) rotate(0) scale(1.2 1.2)' },
  { type: 'stretch' as const, initial: { scaleX: '1.1', scaleY: '0.95' }, next: { scaleX: '0.8', scaleY: '1.25' }, initialText: 'Stretch 110% × 95%', nextText: 'Stretch 80% × 125%', nextTransform: 'translate(50 100) rotate(0) scale(0.8 1.25)' },
])('updates the static $type guide immediately without changing artwork or selection', ({ type, initial, next, initialText, nextText, nextTransform }) => {
  const region = newRegion('part')
  region.motion = { ...region.motion, type, ...initial }
  const { container, rerender, onChange, image } = setup(region, 100, 200)
  const mask = container.querySelector('mask')!.innerHTML
  const transform = container.querySelector('.selection-movement-guide')!.getAttribute('transform')
  expect(screen.getByText('Movement guide — not rendered preview')).toBeInTheDocument()
  expect(screen.getByText(initialText)).toBeInTheDocument()
  rerender(<SelectionSurface region={{ ...region, motion: { ...region.motion, ...next } }} imageUrl="blob:working" tool={SELECTION_TOOL.ADD} radius="0.02" onChange={onChange} />)
  expect(screen.getByText(nextText)).toBeInTheDocument()
  expect(container.querySelector('.selection-movement-guide')!.getAttribute('transform')).not.toBe(transform)
  expect(container.querySelector('.selection-movement-guide')).toHaveAttribute('transform', nextTransform)
  expect(container.querySelector('mask')!.innerHTML).toBe(mask)
  expect(image).not.toHaveAttribute('style')
  expect(container.querySelector('animate, animateTransform')).toBeNull()
  expect(onChange).not.toHaveBeenCalled()
})

it.each([
  { type: 'rotate' as const, angle: '' },
  { type: 'rotate' as const, angle: '-' },
  { type: 'rotate' as const, angle: 'Infinity' },
  { type: 'rotate' as const, angle: '46' },
  { type: 'rotate' as const, angle: '10', anchorX: '' },
  { type: 'scale' as const, scale: undefined },
  { type: 'scale' as const, scale: '0' },
  { type: 'scale' as const, scale: '1.26' },
  { type: 'stretch' as const, scaleX: '1.1', scaleY: '-' },
])('omits invalid or incomplete movement geometry: %j', motion => {
  const region = newRegion('part')
  region.motion = { ...region.motion, ...motion }
  const { container, onChange } = setup(region)
  expect(container.querySelector('.selection-movement-guide')).toBeNull()
  expect(screen.getByText('Enter valid pivot and movement values to show the guide.')).toBeInTheDocument()
  expect(container.querySelector('svg')!.outerHTML).not.toMatch(/NaN|Infinity/)
  expect(onChange).not.toHaveBeenCalled()
})

it('keeps model-mask pixels and refinements while showing axes without claiming mask bounds', () => {
  const region = { ...newRegion('hair'), label: 'Hair', maskId: 'actual-model-mask' }
  region.motion = { ...region.motion, type: 'scale', scale: '1.1' }
  region.selection.strokes = [{ mode: 'erase', radius: '0.02', points: [{ x: 0.4, y: 0.7 }] }]
  const { container, rerender, onChange } = setup(region)
  rerender(<SelectionSurface region={region} imageUrl="blob:working" maskUrl="blob:actual-mask" tool={SELECTION_TOOL.ADD} radius="0.02" onChange={onChange} />)
  expect(screen.getByTitle('Pivot axes only; the selection stays unchanged.')).toBeInTheDocument()
  expect(container.querySelector('mask image')).toHaveAttribute('href', 'blob:actual-mask')
  expect(container.querySelector('mask > g')).toHaveAttribute('fill', 'black')
  expect(container.querySelector('svg > rect[fill="none"]')).toBeNull()
  expect(container.querySelector('.selection-movement-guide rect')).toBeNull()
  expect(container.querySelector('.selection-movement-guide')).not.toBeNull()
  expect(onChange).not.toHaveBeenCalled()
})


it('keeps a valid geometric guide available while timing is incomplete, then omits it on image failure', () => {
  const region = newRegion('part')
  region.motion = { ...region.motion, type: 'rotate', angle: '0', duration: '-' }
  const { container, image, onChange } = setup(region)
  expect(screen.getByText('Rotate 0°')).toBeInTheDocument()
  expect(container.querySelector('.selection-movement-guide')).not.toBeNull()
  fireEvent.error(image)
  expect(container.querySelector('.selection-movement-guide')).toBeNull()
  expect(image).toBeInTheDocument()
  expect(onChange).not.toHaveBeenCalled()
})

it('does not suggest motion for static or protected parts', () => {
  const region = newRegion('part')
  const { container, rerender, onChange } = setup(region)
  expect(screen.queryByText('Movement guide — not rendered preview')).not.toBeInTheDocument()
  rerender(<SelectionSurface region={{ ...region, role: 'protected', motion: { ...region.motion, type: 'rotate', angle: '12' } }} imageUrl="blob:working" tool={SELECTION_TOOL.ADD} radius="0.02" onChange={onChange} />)
  expect(container.querySelector('.selection-movement-guide')).toBeNull()
  expect(screen.queryByText('Movement guide — not rendered preview')).not.toBeInTheDocument()
})
