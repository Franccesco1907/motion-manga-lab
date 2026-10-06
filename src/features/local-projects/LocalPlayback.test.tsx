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
  play.mockClear()
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
