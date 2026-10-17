import { StrictMode } from 'react'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { LocalPlayback } from './LocalPlayback'

const play = vi.fn().mockResolvedValue(undefined)
const pause = vi.fn()
const revoke = vi.fn()
let reduced = false
let listener: ((event: MediaQueryListEvent) => void) | undefined

beforeEach(() => {
  reduced = false
  play.mockReset().mockResolvedValue(undefined)
  pause.mockClear()
  revoke.mockClear()
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: reduced, addEventListener: (_: string, next: typeof listener) => { listener = next }, removeEventListener: vi.fn() })))
  Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: vi.fn(() => 'blob:video') })
  Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: revoke })
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(play)
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(pause)
})

afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals() })

it('never autoplays and supports finite play, restart, static and ended fallback', async () => {
  const load = vi.fn().mockResolvedValue(new Blob(['webm'], { type: 'video/webm' }))
  const view = render(<LocalPlayback name="page" originalUrl="blob:original" loadVideo={load} />)
  expect(screen.getByRole('img', { name: 'Static original: page' })).toBeVisible()
  expect(load).not.toHaveBeenCalled()
  await userEvent.click(screen.getByRole('button', { name: 'Play' }))
  const video = await screen.findByLabelText('Animated page: page') as HTMLVideoElement
  expect(play).toHaveBeenCalledTimes(1)
  expect(video.autoplay).toBe(false)
  expect(video.loop).toBe(false)
  expect(video.controls).toBe(true)
  video.currentTime = 2
  await userEvent.click(screen.getByRole('button', { name: 'Restart' }))
  expect(video.currentTime).toBe(0)
  expect(load).toHaveBeenCalledTimes(1)
  await userEvent.click(screen.getByRole('button', { name: 'Static' }))
  expect(screen.getByRole('img', { name: 'Static original: page' })).toBeVisible()
  await userEvent.click(screen.getByRole('button', { name: 'Play' }))
  fireEvent.ended(video)
  expect(screen.getByRole('img', { name: 'Static original: page' })).toBeVisible()
  view.unmount()
  expect(revoke).toHaveBeenCalledWith('blob:video')
})

it('keeps reduced-motion reading completely static and responds to preference changes', async () => {
  reduced = true
  const load = vi.fn().mockResolvedValue(new Blob(['webm'], { type: 'video/webm' }))
  render(<LocalPlayback name="page" originalUrl="blob:original" loadVideo={load} />)
  expect(screen.getByRole('button', { name: 'Play' })).toBeDisabled()
  expect(load).not.toHaveBeenCalled()
  expect(screen.getByRole('img')).toBeVisible()
  await act(async () => listener?.({ matches: false } as MediaQueryListEvent))
  await userEvent.click(screen.getByRole('button', { name: 'Play' }))
  await screen.findByLabelText('Animated page: page')
  await act(async () => listener?.({ matches: true } as MediaQueryListEvent))
  expect(screen.getByRole('img')).toBeVisible()
  expect(pause).toHaveBeenCalled()
})

it('keeps the original readable after failed media and retries only explicitly', async () => {
  const load = vi.fn().mockRejectedValueOnce(new Error('Output missing.')).mockResolvedValue(new Blob(['webm'], { type: 'video/webm' }))
  render(<LocalPlayback name="page" originalUrl="blob:original" loadVideo={load} />)
  await userEvent.click(screen.getByRole('button', { name: 'Play' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Output missing')
  expect(screen.getByRole('img')).toBeVisible()
  expect(load).toHaveBeenCalledTimes(1)
  await userEvent.click(screen.getByRole('button', { name: 'Play' }))
  const video = await screen.findByLabelText('Animated page: page')
  fireEvent.error(video)
  expect(screen.getByRole('alert')).toHaveTextContent('could not be played')
  expect(screen.getByRole('img')).toBeVisible()
})

it('loops an explicitly requested preview exactly three plays using one media fetch, then returns to static', async () => {
  const load = vi.fn().mockResolvedValue(new Blob(['webm'], { type: 'video/webm' }))
  render(<LocalPlayback name="page" originalUrl="blob:original" loadVideo={load} />)
  expect(play).not.toHaveBeenCalled()
  await userEvent.click(screen.getByRole('button', { name: 'Loop preview (3 plays)' }))
  const video = screen.getByLabelText('Animated page: page') as HTMLVideoElement
  expect(video.loop).toBe(false)
  expect(video.autoplay).toBe(false)
  for (let ended = 1; ended <= 3; ended++) {
    video.currentTime = 6
    await act(async () => fireEvent.ended(video))
    expect(play).toHaveBeenCalledTimes(Math.min(ended + 1, 3))
    if (ended < 3) { expect(video.currentTime).toBe(0); expect(video).toBeVisible() }
  }
  expect(screen.getByRole('img')).toBeVisible()
  expect(load).toHaveBeenCalledTimes(1)
  fireEvent.ended(video)
  expect(play).toHaveBeenCalledTimes(3)
})

it('cancels preview repetitions with Static and keeps ordinary Play and Restart one-shot', async () => {
  const load = vi.fn().mockResolvedValue(new Blob(['webm']))
  render(<LocalPlayback name="page" originalUrl="blob:original" loadVideo={load} />)
  await userEvent.click(screen.getByRole('button', { name: 'Loop preview (3 plays)' }))
  const video = screen.getByLabelText('Animated page: page')
  await act(async () => fireEvent.ended(video))
  await userEvent.click(screen.getByRole('button', { name: 'Static' }))
  fireEvent.ended(video)
  expect(play).toHaveBeenCalledTimes(2)
  expect(screen.getByRole('img')).toBeVisible()
  await userEvent.click(screen.getByRole('button', { name: 'Play' }))
  await act(async () => fireEvent.ended(video))
  expect(play).toHaveBeenCalledTimes(3)
  expect(screen.getByRole('img')).toBeVisible()
  await userEvent.click(screen.getByRole('button', { name: 'Loop preview (3 plays)' }))
  await userEvent.click(screen.getByRole('button', { name: 'Restart' }))
  const beforeEnd = play.mock.calls.length
  await act(async () => fireEvent.ended(video))
  expect(play).toHaveBeenCalledTimes(beforeEnd)
  expect(screen.getByRole('img')).toBeVisible()
})

it('never creates video for reduced motion and cancels a preview without resuming when motion is restored', async () => {
  reduced = true
  const load = vi.fn().mockResolvedValue(new Blob(['webm']))
  render(<LocalPlayback name="page" originalUrl="blob:original" loadVideo={load} />)
  expect(screen.getByRole('button', { name: 'Loop preview (3 plays)' })).toBeDisabled()
  expect(screen.queryByLabelText('Animated page: page')).not.toBeInTheDocument()
  expect(load).not.toHaveBeenCalled()
  await act(async () => listener?.({ matches: false } as MediaQueryListEvent))
  await userEvent.click(screen.getByRole('button', { name: 'Loop preview (3 plays)' }))
  expect(play).toHaveBeenCalledTimes(1)
  await act(async () => listener?.({ matches: true } as MediaQueryListEvent))
  expect(screen.queryByLabelText('Animated page: page')).not.toBeInTheDocument()
  expect(screen.getByRole('img')).toBeVisible()
  await act(async () => listener?.({ matches: false } as MediaQueryListEvent))
  fireEvent.ended(screen.getByLabelText('Animated page: page'))
  expect(play).toHaveBeenCalledTimes(1)
  expect(screen.getByRole('img')).toBeVisible()
})

it('falls back to static after a blocked repeat and never retries it automatically', async () => {
  const load = vi.fn().mockResolvedValue(new Blob(['webm']))
  render(<LocalPlayback name="page" originalUrl="blob:original" loadVideo={load} />)
  await userEvent.click(screen.getByRole('button', { name: 'Loop preview (3 plays)' }))
  play.mockRejectedValueOnce(new Error('Playback blocked.'))
  await act(async () => fireEvent.ended(screen.getByLabelText('Animated page: page')))
  expect(await screen.findByRole('alert')).toHaveTextContent('Playback was blocked')
  expect(screen.getByRole('img')).toBeVisible()
  fireEvent.ended(screen.getByLabelText('Animated page: page'))
  expect(play).toHaveBeenCalledTimes(2)
  expect(load).toHaveBeenCalledTimes(1)
})

it('cancels a pending preview load with Static without allocating an animation URL', async () => {
  let resolve!: (blob: Blob) => void
  const load = vi.fn().mockImplementation(() => new Promise<Blob>(complete => { resolve = complete }))
  render(<LocalPlayback name="page" originalUrl="blob:original" loadVideo={load} />)
  await userEvent.click(screen.getByRole('button', { name: 'Loop preview (3 plays)' }))
  const signal = load.mock.calls[0][0] as AbortSignal
  await userEvent.click(screen.getByRole('button', { name: 'Static' }))
  await act(async () => resolve(new Blob(['webm'])))
  expect(signal.aborted).toBe(true)
  expect(URL.createObjectURL).not.toHaveBeenCalled()
  expect(play).not.toHaveBeenCalled()
  expect(screen.getByRole('img')).toBeVisible()
})

it('ignores a pending play rejection after Static and pauses and revokes the preview on unmount', async () => {
  const load = vi.fn().mockResolvedValue(new Blob(['webm']))
  const view = render(<LocalPlayback name="page" originalUrl="blob:original" loadVideo={load} />)
  await userEvent.click(screen.getByRole('button', { name: 'Loop preview (3 plays)' }))
  let reject!: (error: Error) => void
  play.mockImplementationOnce(() => new Promise<void>((_, fail) => { reject = fail }))
  fireEvent.ended(screen.getByLabelText('Animated page: page'))
  await userEvent.click(screen.getByRole('button', { name: 'Static' }))
  await act(async () => reject(new Error('Cancelled playback.')))
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'Loop preview (3 plays)' }))
  const beforeUnmount = pause.mock.calls.length
  view.unmount()
  expect(pause).toHaveBeenCalledTimes(beforeUnmount + 1)
  expect(revoke).toHaveBeenCalledWith('blob:video')
})

it('cancels a preview after failed media and explicitly retries with ordinary one-shot Play', async () => {
  const load = vi.fn().mockResolvedValue(new Blob(['webm']))
  render(<LocalPlayback name="page" originalUrl="blob:original" loadVideo={load} />)
  await userEvent.click(screen.getByRole('button', { name: 'Loop preview (3 plays)' }))
  const video = screen.getByLabelText('Animated page: page')
  fireEvent.error(video)
  fireEvent.ended(video)
  expect(play).toHaveBeenCalledTimes(1)
  expect(screen.getByRole('img')).toBeVisible()
  expect(revoke).toHaveBeenCalledWith('blob:video')
  await userEvent.click(screen.getByRole('button', { name: 'Play' }))
  await act(async () => fireEvent.ended(video))
  expect(play).toHaveBeenCalledTimes(2)
  expect(load).toHaveBeenCalledTimes(2)
  expect(screen.getByRole('img')).toBeVisible()
})


it('consumes an explicit automatic request once, uses native one-shot play and retries only explicitly', async () => {
  const load = vi.fn().mockResolvedValue(new Blob(['webm']))
  const props = { name: 'page', originalUrl: 'blob:original', loadVideo: load, autoPlayRequest: 'preview-1' }
  const view = render(<LocalPlayback {...props} />)
  await act(async () => {})
  expect(load).toHaveBeenCalledTimes(1)
  expect(play).toHaveBeenCalledTimes(1)
  const video = screen.getByLabelText('Animated page: page') as HTMLVideoElement
  expect(video).toBeVisible()
  expect(video.autoplay).toBe(false)
  expect(video.loop).toBe(false)
  await act(async () => fireEvent.ended(video))
  expect(screen.getByRole('img')).toBeVisible()
  view.rerender(<LocalPlayback {...props} />)
  await act(async () => {})
  expect(play).toHaveBeenCalledTimes(1)
  await userEvent.click(screen.getByRole('button', { name: 'Play' }))
  expect(play).toHaveBeenCalledTimes(2)
})

it('loads a fresh clip for a replacement request and never resumes a revoked request', async () => {
  let resolve!: (blob: Blob) => void
  const oldLoad = vi.fn().mockImplementation(() => new Promise<Blob>(done => { resolve = done }))
  const nextLoad = vi.fn().mockResolvedValue(new Blob(['next']))
  const view = render(<LocalPlayback name="page" originalUrl="blob:original" loadVideo={oldLoad} autoPlayRequest="before" />)
  await act(async () => {})
  expect(oldLoad).toHaveBeenCalledTimes(1)
  const signal = oldLoad.mock.calls[0][0] as AbortSignal
  view.rerender(<LocalPlayback name="page" originalUrl="blob:original" loadVideo={nextLoad} autoPlayRequest="after" />)
  await act(async () => {})
  await act(async () => resolve(new Blob(['old'])))
  expect(signal.aborted).toBe(true)
  expect(nextLoad).toHaveBeenCalledTimes(1)
  expect(play).toHaveBeenCalledTimes(1)
  view.rerender(<LocalPlayback name="page" originalUrl="blob:original" loadVideo={nextLoad} />)
  expect(screen.getByRole('img')).toBeVisible()
  view.rerender(<LocalPlayback name="page" originalUrl="blob:original" loadVideo={nextLoad} autoPlayRequest="after" />)
  await act(async () => {})
  expect(play).toHaveBeenCalledTimes(1)
})

it.each(['Static', 'revoked', 'source', 'reduced', 'unmount'])('cancels automatic loading on %s without delayed resurrection', async reason => {
  let resolve!: (blob: Blob) => void
  const load = vi.fn().mockImplementation(() => new Promise<Blob>(done => { resolve = done }))
  const props = { name: 'page', originalUrl: 'blob:original', loadVideo: load, autoPlayRequest: 'preview-1' }
  const view = render(<LocalPlayback {...props} />)
  await act(async () => {})
  expect(load).toHaveBeenCalledTimes(1)
  const signal = load.mock.calls[0][0] as AbortSignal
  if (reason === 'Static') await userEvent.click(screen.getByRole('button', { name: 'Static' }))
  if (reason === 'revoked') view.rerender(<LocalPlayback {...props} autoPlayRequest={undefined} />)
  if (reason === 'source') view.rerender(<LocalPlayback {...props} originalUrl="blob:other" />)
  if (reason === 'reduced') {
    await act(async () => listener?.({ matches: true } as MediaQueryListEvent))
    await act(async () => listener?.({ matches: false } as MediaQueryListEvent))
  }
  if (reason === 'unmount') view.unmount()
  await act(async () => resolve(new Blob(['webm'])))
  expect(signal.aborted).toBe(true)
  expect(URL.createObjectURL).not.toHaveBeenCalled()
  expect(play).not.toHaveBeenCalled()
  if (reason !== 'unmount') expect(screen.getByRole('img')).toBeVisible()
})

it('never revives an automatic request suppressed by reduced motion', async () => {
  reduced = true
  const load = vi.fn().mockResolvedValue(new Blob(['webm']))
  render(<LocalPlayback name="page" originalUrl="blob:original" loadVideo={load} autoPlayRequest="preview-1" />)
  await act(async () => {})
  await act(async () => listener?.({ matches: false } as MediaQueryListEvent))
  expect(load).not.toHaveBeenCalled()
  expect(play).not.toHaveBeenCalled()
  expect(screen.getByRole('img')).toBeVisible()
})

it('keeps original visible until native play succeeds, and reports blocked automatic play with explicit retry', async () => {
  let reject!: (error: Error) => void
  play.mockImplementationOnce(() => new Promise<void>((_, fail) => { reject = fail }))
  const load = vi.fn().mockResolvedValue(new Blob(['webm']))
  render(<LocalPlayback name="page" originalUrl="blob:original" loadVideo={load} autoPlayRequest="preview-1" />)
  await act(async () => {})
  expect(play).toHaveBeenCalledTimes(1)
  expect(screen.getByRole('img')).toBeVisible()
  expect(screen.getByRole('status')).toHaveTextContent('Starting animation')
  expect(screen.getByRole('button', { name: 'Play' })).toBeDisabled()
  expect(screen.getByRole('button', { name: 'Restart' })).toBeDisabled()
  expect(screen.getByRole('button', { name: 'Static' })).toBeEnabled()
  await act(async () => reject(new Error('NotAllowedError')))
  expect(screen.getByRole('alert')).toHaveTextContent('Playback was blocked')
  expect(screen.getByRole('img')).toBeVisible()
  expect(play).toHaveBeenCalledTimes(1)
  await userEvent.click(screen.getByRole('button', { name: 'Play' }))
  expect(play).toHaveBeenCalledTimes(2)
  expect(screen.getByLabelText('Animated page: page')).toBeVisible()
})

it('ignores a late native play success or rejection after its automatic intent is revoked', async () => {
  let complete!: () => void
  play.mockImplementationOnce(() => new Promise<void>(resolve => { complete = resolve }))
  const load = vi.fn().mockResolvedValue(new Blob(['webm']))
  const view = render(<LocalPlayback name="page" originalUrl="blob:original" loadVideo={load} autoPlayRequest="preview-1" />)
  await act(async () => {})
  expect(play).toHaveBeenCalledTimes(1)
  view.rerender(<LocalPlayback name="page" originalUrl="blob:original" loadVideo={load} />)
  await act(async () => complete())
  expect(screen.getByRole('img')).toBeVisible()
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
})

it('handles StrictMode effect replay without consuming the explicit request twice', async () => {
  const load = vi.fn().mockResolvedValue(new Blob(['webm']))
  render(<StrictMode><LocalPlayback name="page" originalUrl="blob:original" loadVideo={load} autoPlayRequest="preview-1" /></StrictMode>)
  await act(async () => {})
  expect(load).toHaveBeenCalledTimes(1)
  expect(play).toHaveBeenCalledTimes(1)
  expect(screen.getByLabelText('Animated page: page')).toBeVisible()
})


it('fetches the matching new artifact instead of reusing the previous completed clip', async () => {
  const load = vi.fn().mockResolvedValue(new Blob(['webm']))
  const view = render(<LocalPlayback name="page" originalUrl="blob:original" loadVideo={load} autoPlayRequest="before" />)
  await act(async () => {})
  await act(async () => fireEvent.ended(screen.getByLabelText('Animated page: page')))
  view.rerender(<LocalPlayback name="page" originalUrl="blob:original" loadVideo={load} autoPlayRequest="after" />)
  await act(async () => {})
  expect(load).toHaveBeenCalledTimes(2)
  expect(play).toHaveBeenCalledTimes(2)
  expect(revoke).toHaveBeenCalledWith('blob:video')
  expect(screen.getByLabelText('Animated page: page')).toBeVisible()
})

it.each(['Static', 'revoked', 'reduced', 'unmount'])('ignores late native play failure after %s cancellation', async reason => {
  let reject!: (error: Error) => void
  play.mockImplementationOnce(() => new Promise<void>((_, fail) => { reject = fail }))
  const load = vi.fn().mockResolvedValue(new Blob(['webm']))
  const props = { name: 'page', originalUrl: 'blob:original', loadVideo: load, autoPlayRequest: 'preview-1' }
  const view = render(<LocalPlayback {...props} />)
  await act(async () => {})
  expect(play).toHaveBeenCalledTimes(1)
  if (reason === 'Static') await userEvent.click(screen.getByRole('button', { name: 'Static' }))
  if (reason === 'revoked') view.rerender(<LocalPlayback {...props} autoPlayRequest={undefined} />)
  if (reason === 'reduced') {
    await act(async () => listener?.({ matches: true } as MediaQueryListEvent))
    await act(async () => listener?.({ matches: false } as MediaQueryListEvent))
  }
  if (reason === 'unmount') view.unmount()
  await act(async () => reject(new Error('Cancelled play')))
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  expect(play).toHaveBeenCalledTimes(1)
  if (reason !== 'unmount') expect(screen.getByRole('img')).toBeVisible()
})

it('does not interpret an empty automatic request as playback intent', async () => {
  const load = vi.fn().mockResolvedValue(new Blob(['webm']))
  render(<LocalPlayback name="page" originalUrl="blob:original" loadVideo={load} autoPlayRequest="  " />)
  await act(async () => {})
  expect(load).not.toHaveBeenCalled()
  expect(play).not.toHaveBeenCalled()
  expect(screen.getByRole('img')).toBeVisible()
})


it.each(['natural ending', 'Static'])('identifies the visible static original after %s instead of implying the rendered result is still shown', async reason => {
  const load = vi.fn().mockResolvedValue(new Blob(['webm']))
  render(<LocalPlayback name="page" originalUrl="blob:original" loadVideo={load} autoPlayRequest="preview-1" />)
  await act(async () => {})
  expect(screen.getByLabelText('Animated page: page')).toBeVisible()
  expect(screen.queryByText('Showing the static original.')).not.toBeInTheDocument()
  if (reason === 'natural ending') await act(async () => fireEvent.ended(screen.getByLabelText('Animated page: page')))
  else await userEvent.click(screen.getByRole('button', { name: 'Static' }))
  expect(screen.getByRole('status')).toHaveTextContent('Showing the static original.')
  expect(screen.getByRole('img')).toBeVisible()
})

it('opts into a shared aspect-ratio media slot and separate playback feedback only for editor framing', async () => {
  const load = vi.fn().mockResolvedValue(new Blob(['webm']))
  const view = render(<LocalPlayback name="page" originalUrl="blob:original" loadVideo={load} frameAspectRatio={4 / 3} />)
  const original = screen.getByRole('img')
  const video = screen.getByLabelText('Animated page: page')
  expect(original.parentElement).toHaveClass('local-playback__media')
  expect(video.parentElement).toBe(original.parentElement)
  expect(original.parentElement).toHaveStyle({ aspectRatio: '1.3333333333333333' })
  expect(screen.getByRole('button', { name: 'Play' }).closest('.local-playback__feedback')).toContainElement(screen.getByRole('status'))
  expect(load).not.toHaveBeenCalled()
  view.rerender(<LocalPlayback name="page" originalUrl="blob:original" loadVideo={load} />)
  expect(screen.getByRole('img').parentElement).toHaveClass('local-playback')
  expect(screen.getByRole('button', { name: 'Play' }).closest('.local-playback__feedback')).toBeNull()
})

it.each([0, -1, NaN, Infinity])('ignores invalid editor aspect ratio %s without changing reader markup', ratio => {
  const load = vi.fn()
  const view = render(<LocalPlayback name="page" originalUrl="blob:original" loadVideo={load} frameAspectRatio={ratio} />)
  expect(screen.getByRole('img').parentElement).toHaveClass('local-playback')
  expect(view.container.querySelector('[style]')).toBeNull()
  expect(load).not.toHaveBeenCalled()
})
