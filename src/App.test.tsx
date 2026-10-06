import { act, cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { StrictMode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { localProjectClient } from './features/local-projects/local-project-client'
import { accountClient } from './features/accounts/account-client'
import { resetPrivateSession } from './features/accounts/private-session'
import {
  DESCRIPTION_REVIEW,
  READER_PANELS,
} from './features/reader/reader-content'

const ASSET_ROOT = '/content/pepper-carrot/episode-01/page-02'
const IDENTITY_TRANSFORM = 'translate3d(0, 0, 0) scale(1)'
const VISIBLE_CLIP = 'inset(0 0 0 0)'
const APPROVED_SPANISH_DESCRIPTIONS = [
  'Una luz amarilla rodea varios objetos que flotan sobre el caldero. Pepper sonríe con las manos juntas y dice: «…¡ah! Perfecto.» Carrot está a su lado, junto a una escoba.',
  'Pepper pone una mano frente a Carrot, que estira las patas hacia una escoba resplandeciente sobre el caldero, y dice: «¡NO! Ni se te ocurra.»',
  'Carrot aterriza con las patas delanteras sobre la escoba que cruza el caldero y el líquido salpica con un «SPLASH». Pepper aparece parcialmente oculta a la izquierda.',
] as const

interface DeferredPromise {
  promise: Promise<void>
  reject: (reason?: unknown) => void
  resolve: () => void
}

interface AnimateRecord {
  animation: MockAnimation
  keyframes: Keyframe[] | PropertyIndexedKeyframes
  options: KeyframeAnimationOptions
  target: Element
}

class MockAnimation {
  cancel = vi.fn()
  oncancel: ((event: Event) => void) | null = null
  onfinish: ((event: Event) => void) | null = null
  pause = vi.fn()
  play = vi.fn()

  finish() {
    this.onfinish?.(new Event('finish'))
  }
}

class MockMediaQueryList {
  matches = false
  media = '(prefers-reduced-motion: reduce)'
  onchange: ((event: MediaQueryListEvent) => void) | null = null
  private listeners = new Set<(event: MediaQueryListEvent) => void>()

  addEventListener(
    _type: 'change',
    listener: (event: MediaQueryListEvent) => void,
  ) {
    this.listeners.add(listener)
  }

  removeEventListener(
    _type: 'change',
    listener: (event: MediaQueryListEvent) => void,
  ) {
    this.listeners.delete(listener)
  }

  dispatch(matches: boolean) {
    this.matches = matches
    const event = { matches, media: this.media } as MediaQueryListEvent
    this.listeners.forEach((listener) => listener(event))
    this.onchange?.(event)
  }
}

class MockIntersectionObserver {
  static instances: MockIntersectionObserver[] = []

  disconnect = vi.fn()
  observe = vi.fn()
  root: Element | Document | null
  rootMargin: string
  thresholds: readonly number[]
  unobserve = vi.fn()
  private callback: IntersectionObserverCallback

  constructor(
    callback: IntersectionObserverCallback,
    options: IntersectionObserverInit = {},
  ) {
    this.callback = callback
    this.root = options.root ?? null
    this.rootMargin = options.rootMargin ?? '0px'
    this.thresholds = Array.isArray(options.threshold)
      ? options.threshold
      : [options.threshold ?? 0]
    MockIntersectionObserver.instances.push(this)
  }

  emit(
    entries: Array<{
      isIntersecting: boolean
      ratio: number
      target: Element
    }>,
  ) {
    const records = entries.map(
      ({ isIntersecting, ratio, target }) =>
        ({
          boundingClientRect: target.getBoundingClientRect(),
          intersectionRatio: ratio,
          intersectionRect: target.getBoundingClientRect(),
          isIntersecting,
          rootBounds: null,
          target,
          time: 0,
        }) as IntersectionObserverEntry,
    )

    this.callback(records, this as unknown as IntersectionObserver)
  }

  takeRecords() {
    return []
  }
}

const animateRecords: AnimateRecord[] = []
const mediaQuery = new MockMediaQueryList()
const originalAnimate = Object.getOwnPropertyDescriptor(Element.prototype, 'animate')
const originalDecode = Object.getOwnPropertyDescriptor(
  HTMLImageElement.prototype,
  'decode',
)

function deferredPromise(): DeferredPromise {
  let resolve: () => void = () => {}
  let reject: (reason?: unknown) => void = () => {}
  const promise = new Promise<void>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })

  return { promise, reject, resolve }
}

function currentObserver() {
  const observer = MockIntersectionObserver.instances.at(-1)
  if (!observer) {
    throw new Error('Expected an IntersectionObserver instance')
  }
  return observer
}

function panelElements(container: HTMLElement) {
  return Array.from(
    container.querySelectorAll<HTMLElement>('[data-reader-panel]'),
  )
}

function setDocumentVisibility(state: DocumentVisibilityState) {
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    value: state,
  })
}

async function flushPromises() {
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
  })
}

beforeEach(() => {
  vi.spyOn(accountClient, 'runtime').mockResolvedValue({ mode: 'local' })
  animateRecords.length = 0
  MockIntersectionObserver.instances.length = 0
  mediaQuery.matches = false
  mediaQuery.onchange = null
  setDocumentVisibility('visible')

  vi.stubGlobal(
    'IntersectionObserver',
    MockIntersectionObserver as unknown as typeof IntersectionObserver,
  )
  window.matchMedia = vi.fn(() => mediaQuery as unknown as MediaQueryList)

  Object.defineProperty(HTMLImageElement.prototype, 'decode', {
    configurable: true,
    value: vi.fn(() => Promise.resolve()),
  })
  Object.defineProperty(Element.prototype, 'animate', {
    configurable: true,
    value: vi.fn(function mockAnimate(
      this: Element,
      keyframes: Keyframe[] | PropertyIndexedKeyframes,
      options: KeyframeAnimationOptions,
    ) {
      const animation = new MockAnimation()
      animateRecords.push({ animation, keyframes, options, target: this })
      return animation as unknown as Animation
    }),
  })
})

afterEach(() => {
  cleanup()
  resetPrivateSession()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  if (originalAnimate) {
    Object.defineProperty(Element.prototype, 'animate', originalAnimate)
  } else {
    Reflect.deleteProperty(Element.prototype, 'animate')
  }
  if (originalDecode) {
    Object.defineProperty(HTMLImageElement.prototype, 'decode', originalDecode)
  } else {
    Reflect.deleteProperty(HTMLImageElement.prototype, 'decode')
  }
})

describe('reader baseline', () => {
  it('opens local projects only through the explicit workspace entry and returns to research', async () => {
    const list = vi.spyOn(localProjectClient, 'list').mockResolvedValue([])
    render(<App />)
    expect(screen.getAllByRole('img')).toHaveLength(3)
    expect(list).not.toHaveBeenCalled()
    await userEvent.click(screen.getByRole('button', { name: 'Local projects' }))
    expect(await screen.findByRole('heading', { name: 'Local projects' })).toHaveFocus()
    expect(await screen.findByText('No saved projects yet.')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Research reader' }))
    expect(screen.getAllByRole('img')).toHaveLength(3)
    expect(screen.getByRole('main')).toBeInTheDocument()
  })

  it('renders a semantic, visible reading sequence with exact responsive candidates', async () => {
    const { container } = render(<App />)
    await flushPromises()

    expect(screen.getByRole('main')).toBeInTheDocument()
    expect(
      screen.getByRole('region', { name: 'Episode 1, page 2 reading sequence' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('navigation', { name: 'Reading progress' })).toBeInTheDocument()

    const images = screen.getAllByRole('img')
    expect(images).toHaveLength(3)
    expect(images.map((image) => image.getAttribute('alt'))).toEqual(
      APPROVED_SPANISH_DESCRIPTIONS,
    )

    const expectedHeights = ['1061', '994', '1098']
    images.forEach((image, index) => {
      const panel = String(index + 1).padStart(2, '0')
      const jpegSet = [640, 1280, 2275]
        .map(
          (width) =>
            `${ASSET_ROOT}/pepper-carrot-ep01-e01p02-panel-${panel}-w${String(width).padStart(4, '0')}.jpg ${width}w`,
        )
        .join(', ')
      const webpSet = jpegSet.replaceAll('.jpg', '.webp')
      const source = image.closest('picture')?.querySelector('source')

      expect(source).toHaveAttribute('type', 'image/webp')
      expect(source).toHaveAttribute('srcset', webpSet)
      expect(source).toHaveAttribute(
        'sizes',
        '(min-width: 1360px) 1200px, (min-width: 768px) calc(100vw - 144px), calc(100vw - 68px)',
      )
      expect(image).toHaveAttribute('srcset', jpegSet)
      expect(image).toHaveAttribute('sizes', source?.getAttribute('sizes'))
      expect(image).toHaveAttribute('width', '2275')
      expect(image).toHaveAttribute('height', expectedHeights[index])
      expect(image).toHaveAttribute('decoding', 'async')
    })

    expect(images[0]).toHaveAttribute('loading', 'eager')
    expect(images[0]).toHaveAttribute('fetchpriority', 'high')
    expect(images[1]).toHaveAttribute('loading', 'lazy')
    expect(images[1]).toHaveAttribute('fetchpriority', 'auto')
    expect(images[2]).toHaveAttribute('loading', 'lazy')
    expect(images[2]).toHaveAttribute('fetchpriority', 'auto')

    const panels = panelElements(container)
    expect(panels.map((panel) => panel.id)).toEqual([
      'e01p02-panel-01',
      'e01p02-panel-02',
      'e01p02-panel-03',
    ])
    expect(
      screen.getByText(
        'Spanish panel descriptions were approved through human review by Franccesco on 2026-08-30.',
      ),
    ).toBeInTheDocument()
  })

  it('publishes the approved human-review status contract', () => {
    expect(DESCRIPTION_REVIEW).toEqual({
      reviewedAt: '2026-08-30',
      reviewer: 'Franccesco',
      status: 'approved_human_review',
    })
    expect(READER_PANELS.map((panel) => panel.descriptionReviewStatus)).toEqual([
      'approved_human_review',
      'approved_human_review',
      'approved_human_review',
    ])
  })

  it('publishes the approved attribution and modification notice with source links', async () => {
    render(<App />)
    await flushPromises()

    const footer = screen.getByRole('contentinfo')
    expect(
      screen.queryByText('Descriptions are provisional and pending human review.'),
    ).not.toBeInTheDocument()
    expect(footer).toHaveTextContent(
      '“Pepper & Carrot — Episode 1: The Potion of Flight,” art and scenario by David Revoy; Spanish translation by Juanjo Faico; contributions by Andrej Ficko and Hồ Nhựt Châu.',
    )
    expect(footer).toHaveTextContent(
      'Modified for this engineering prototype: three panels were cropped from the verified compiled Spanish page, resized to 640 and 1280 pixels wide while retaining the 2275-pixel native crop width, encoded as WebP and JPEG with an attached sRGB profile, and presented with restrained crop-transform and overlay-opacity animation.',
    )
    expect(footer).toHaveTextContent(
      'No endorsement by the creator, translator, or contributors is implied.',
    )
    expect(
      screen.getByRole('link', { name: 'official Spanish Episode 1 files' }),
    ).toHaveAttribute(
      'href',
      'https://www.peppercarrot.com/es/webcomic-sources/ep01_Potion-of-Flight__files.html',
    )
    expect(screen.getByRole('link', { name: 'CC BY 4.0' })).toHaveAttribute(
      'href',
      'https://creativecommons.org/licenses/by/4.0/',
    )
  })

  it('keeps the same content, loading, controls, and order between Motion and Static', async () => {
    const user = userEvent.setup()
    const { container } = render(<App />)
    await flushPromises()

    const paritySnapshot = () => ({
      buttons: screen.getAllByRole('button').map((button) => button.textContent),
      images: screen.getAllByRole('img').map((image) => ({
        alt: image.getAttribute('alt'),
        decoding: image.getAttribute('decoding'),
        fetchPriority: image.getAttribute('fetchpriority'),
        height: image.getAttribute('height'),
        loading: image.getAttribute('loading'),
        sizes: image.getAttribute('sizes'),
        src: image.getAttribute('src'),
        srcSet: image.getAttribute('srcset'),
        width: image.getAttribute('width'),
      })),
      order: panelElements(container).map((panel) => panel.id),
      sources: Array.from(container.querySelectorAll('source')).map((source) => ({
        sizes: source.getAttribute('sizes'),
        srcSet: source.getAttribute('srcset'),
        type: source.getAttribute('type'),
      })),
    })

    expect(screen.getByRole('radio', { name: 'Motion' })).toBeChecked()
    const motionSnapshot = paritySnapshot()
    await user.click(screen.getByRole('radio', { name: 'Static' }))

    expect(screen.getByRole('radio', { name: 'Static' })).toBeChecked()
    expect(paritySnapshot()).toEqual(motionSnapshot)
    expect(animateRecords).toHaveLength(0)
  })
})

describe('approved panel treatment', () => {
  it('uses the exact observer options and waits for image decode', async () => {
    const firstDecode = deferredPromise()
    const otherDecode = deferredPromise()
    const decode = vi
      .fn()
      .mockReturnValueOnce(firstDecode.promise)
      .mockReturnValue(otherDecode.promise)
    Object.defineProperty(HTMLImageElement.prototype, 'decode', {
      configurable: true,
      value: decode,
    })

    const { container } = render(<App />)
    const observer = currentObserver()
    const [firstPanel] = panelElements(container)

    expect(observer.root).toBeNull()
    expect(observer.rootMargin).toBe('0px 0px -10% 0px')
    expect(observer.thresholds).toEqual([0, 0.6])
    expect(observer.observe).toHaveBeenCalledTimes(3)

    act(() => {
      observer.emit([{ isIntersecting: true, ratio: 0.6, target: firstPanel }])
    })
    expect(animateRecords).toHaveLength(0)

    firstDecode.resolve()
    await flushPromises()
    expect(animateRecords).toHaveLength(2)
  })

  it('plays exact keyframes once with a batch-local 60ms stagger', async () => {
    const { container } = render(<App />)
    await flushPromises()
    const panels = panelElements(container)

    act(() => {
      currentObserver().emit(
        panels.map((target) => ({ isIntersecting: true, ratio: 0.8, target })),
      )
    })

    expect(animateRecords).toHaveLength(4)
    const cropRecords = animateRecords.filter((record) =>
      record.target.hasAttribute('data-motion-crop'),
    )
    const lightRecord = animateRecords.find((record) =>
      record.target.hasAttribute('data-light-echo'),
    )

    expect(cropRecords.map((record) => record.options)).toMatchObject([
      { delay: 0, duration: 880, fill: 'none' },
      { delay: 60, duration: 760, fill: 'none' },
      { delay: 120, duration: 700, fill: 'none' },
    ])
    expect(cropRecords[0]?.keyframes).toEqual([
      {
        clipPath: VISIBLE_CLIP,
        easing: 'cubic-bezier(0.77, 0, 0.175, 1)',
        offset: 0,
        opacity: 1,
        transform: IDENTITY_TRANSFORM,
      },
      {
        clipPath: VISIBLE_CLIP,
        easing: 'cubic-bezier(0.23, 1, 0.32, 1)',
        offset: 0.42,
        opacity: 1,
        transform: 'translate3d(0, -6px, 0) scale(1.010)',
      },
      {
        clipPath: VISIBLE_CLIP,
        offset: 1,
        opacity: 1,
        transform: IDENTITY_TRANSFORM,
      },
    ])
    expect(cropRecords[1]?.keyframes).toMatchObject([
      { offset: 0 },
      { offset: 0.45, transform: 'translate3d(0, -4px, 0) scale(1.007)' },
      { offset: 1 },
    ])
    expect(cropRecords[2]?.keyframes).toMatchObject([
      { offset: 0 },
      { offset: 0.4, transform: 'translate3d(0, 4px, 0) scale(1.006)' },
      { offset: 1 },
    ])
    expect(lightRecord?.keyframes).toEqual([
      { offset: 0, opacity: 0 },
      { offset: 0.35, opacity: 0.16 },
      { offset: 1, opacity: 0 },
    ])
    expect(lightRecord?.options).toMatchObject({
      delay: 80,
      duration: 720,
      easing: 'cubic-bezier(0.23, 1, 0.32, 1)',
      fill: 'none',
    })

    act(() => {
      currentObserver().emit(
        panels.map((target) => ({ isIntersecting: true, ratio: 1, target })),
      )
    })
    expect(animateRecords).toHaveLength(4)
  })

  it('pauses offscreen work and resumes only while visible', async () => {
    const { container } = render(<App />)
    await flushPromises()
    const [firstPanel] = panelElements(container)
    const observer = currentObserver()

    act(() => {
      observer.emit([{ isIntersecting: true, ratio: 0.8, target: firstPanel }])
    })
    const animations = animateRecords.map((record) => record.animation)

    act(() => {
      observer.emit([{ isIntersecting: false, ratio: 0, target: firstPanel }])
    })
    animations.forEach((animation) => expect(animation.pause).toHaveBeenCalledTimes(1))

    act(() => {
      observer.emit([{ isIntersecting: true, ratio: 0.1, target: firstPanel }])
    })
    animations.forEach((animation) => expect(animation.play).toHaveBeenCalledTimes(1))

    act(() => {
      setDocumentVisibility('hidden')
      document.dispatchEvent(new Event('visibilitychange'))
    })
    animations.forEach((animation) => expect(animation.pause).toHaveBeenCalledTimes(2))

    act(() => {
      setDocumentVisibility('visible')
      document.dispatchEvent(new Event('visibilitychange'))
    })
    animations.forEach((animation) => expect(animation.play).toHaveBeenCalledTimes(2))
  })

  it('forces final values, removes temporary hints, and never replays after completion', async () => {
    const { container } = render(<App />)
    await flushPromises()
    const [firstPanel] = panelElements(container)
    const crop = firstPanel.querySelector<HTMLElement>('[data-motion-crop]')
    const light = firstPanel.querySelector<HTMLElement>('[data-light-echo]')
    const observer = currentObserver()

    act(() => {
      observer.emit([{ isIntersecting: true, ratio: 1, target: firstPanel }])
    })
    expect(crop).toHaveStyle({ willChange: 'transform' })

    const cropRecord = animateRecords.find((record) => record.target === crop)
    act(() => cropRecord?.animation.finish())

    expect(crop).toHaveStyle({
      clipPath: VISIBLE_CLIP,
      opacity: '1',
      transform: IDENTITY_TRANSFORM,
      willChange: '',
    })
    expect(light).toHaveStyle({ opacity: '0' })
    expect(observer.unobserve).toHaveBeenCalledWith(firstPanel)

    act(() => {
      observer.emit([{ isIntersecting: true, ratio: 1, target: firstPanel }])
    })
    expect(animateRecords).toHaveLength(2)
  })

  it('cancels into readable identity state on Static mode and explicit restart', async () => {
    const user = userEvent.setup()
    const { container } = render(<App />)
    await flushPromises()
    const [firstPanel] = panelElements(container)

    act(() => {
      currentObserver().emit([
        { isIntersecting: true, ratio: 0.8, target: firstPanel },
      ])
    })
    const firstRun = animateRecords.map((record) => record.animation)

    await user.click(screen.getByRole('radio', { name: 'Static' }))
    firstRun.forEach((animation) => expect(animation.cancel).toHaveBeenCalledOnce())
    expect(firstPanel.querySelector('[data-motion-crop]')).toHaveStyle({
      opacity: '1',
      transform: IDENTITY_TRANSFORM,
    })
    expect(firstPanel.querySelector('[data-light-echo]')).toHaveStyle({ opacity: '0' })

    await user.click(screen.getByRole('radio', { name: 'Motion' }))
    await flushPromises()
    act(() => {
      currentObserver().emit([
        { isIntersecting: true, ratio: 0.8, target: firstPanel },
      ])
    })
    const secondRun = animateRecords.slice(2).map((record) => record.animation)
    await user.click(screen.getByRole('button', { name: 'Restart motion' }))
    secondRun.forEach((animation) => expect(animation.cancel).toHaveBeenCalledOnce())

    await flushPromises()
    act(() => {
      currentObserver().emit([
        { isIntersecting: true, ratio: 0.8, target: firstPanel },
      ])
    })
    expect(animateRecords).toHaveLength(6)
  })

  it('updates the reading rail from the real panel sequence', async () => {
    const { container } = render(<App />)
    await flushPromises()
    const panels = panelElements(container)

    act(() => {
      currentObserver().emit([
        { isIntersecting: false, ratio: 0, target: panels[0] },
        { isIntersecting: true, ratio: 0.75, target: panels[1] },
      ])
    })

    expect(screen.getByRole('link', { name: 'Panel 2' })).toHaveAttribute(
      'aria-current',
      'step',
    )
  })

  it('keeps explicit Panel 2 navigation active across a stale tied observer callback', async () => {
    const user = userEvent.setup()
    const { container } = render(<App />)
    await flushPromises()
    const panels = panelElements(container)

    Object.defineProperty(window, 'innerHeight', {
      configurable: true,
      value: 844,
    })
    vi.spyOn(panels[0], 'getBoundingClientRect').mockReturnValue(
      DOMRect.fromRect({ height: 200, width: 322, x: 52, y: -500 }),
    )
    const panelTwoRect = vi
      .spyOn(panels[1], 'getBoundingClientRect')
      .mockReturnValue(
        DOMRect.fromRect({ height: 200, width: 322, x: 52, y: 900 }),
      )
    const panelThreeRect = vi
      .spyOn(panels[2], 'getBoundingClientRect')
      .mockReturnValue(
        DOMRect.fromRect({ height: 200, width: 322, x: 52, y: 100 }),
      )

    act(() => {
      currentObserver().emit([
        { isIntersecting: true, ratio: 1, target: panels[2] },
      ])
    })
    expect(screen.getByRole('link', { name: 'Panel 3' })).toHaveAttribute(
      'aria-current',
      'step',
    )

    panelTwoRect.mockReturnValue(
      DOMRect.fromRect({ height: 200, width: 322, x: 52, y: 100 }),
    )
    panelThreeRect.mockReturnValue(
      DOMRect.fromRect({ height: 200, width: 322, x: 52, y: 400 }),
    )

    await user.click(screen.getByRole('link', { name: 'Panel 2' }))
    expect(screen.getByRole('link', { name: 'Panel 2' })).toHaveAttribute(
      'aria-current',
      'step',
    )

    act(() => {
      currentObserver().emit([
        { isIntersecting: true, ratio: 1, target: panels[2] },
      ])
    })
    expect(screen.getByRole('link', { name: 'Panel 2' })).toHaveAttribute(
      'aria-current',
      'step',
    )
  })

  it('disconnects and removes owned external-system work on unmount', async () => {
    const documentAdd = vi.spyOn(document, 'addEventListener')
    const documentRemove = vi.spyOn(document, 'removeEventListener')
    const mediaAdd = vi.spyOn(mediaQuery, 'addEventListener')
    const mediaRemove = vi.spyOn(mediaQuery, 'removeEventListener')
    const { container, unmount } = render(
      <StrictMode>
        <App />
      </StrictMode>,
    )
    await flushPromises()
    const [firstPanel] = panelElements(container)
    const observer = currentObserver()
    const visibilityHandlers = documentAdd.mock.calls
      .filter(([type]) => type === 'visibilitychange')
      .map(([, handler]) => handler)
    const mediaHandlers = mediaAdd.mock.calls
      .filter(([type]) => type === 'change')
      .map(([, handler]) => handler)
    const visibilityHandler = visibilityHandlers.at(-1)
    const mediaHandler = mediaHandlers.at(-1)

    act(() => {
      observer.emit([{ isIntersecting: true, ratio: 1, target: firstPanel }])
    })
    const animations = animateRecords.map((record) => record.animation)

    unmount()

    expect(MockIntersectionObserver.instances).toHaveLength(2)
    MockIntersectionObserver.instances.forEach((instance) => {
      expect(instance.disconnect).toHaveBeenCalledOnce()
    })
    animations.forEach((animation) => {
      expect(animation.cancel).toHaveBeenCalledOnce()
    })
    expect(firstPanel.querySelector('[data-motion-crop]')).toHaveStyle({
      opacity: '1',
      transform: IDENTITY_TRANSFORM,
      willChange: '',
    })
    expect(firstPanel.querySelector('[data-light-echo]')).toHaveStyle({ opacity: '0' })
    expect(documentRemove).toHaveBeenCalledWith(
      'visibilitychange',
      visibilityHandler,
    )
    expect(mediaRemove).toHaveBeenCalledWith('change', mediaHandler)
    expect(visibilityHandlers).toHaveLength(2)
    expect(mediaHandlers).toHaveLength(2)

    act(() => {
      setDocumentVisibility('hidden')
      document.dispatchEvent(new Event('visibilitychange'))
      mediaQuery.dispatch(true)
    })
    animations.forEach((animation) => {
      expect(animation.pause).not.toHaveBeenCalled()
      expect(animation.cancel).toHaveBeenCalledOnce()
    })
  })
})

describe('failure and reduced-motion fallbacks', () => {
  it('preserves readable content when setup, decode, or WAAPI fails', async () => {
    const setupFailure = vi.fn(() => {
      throw new Error('observer unavailable')
    })
    vi.stubGlobal('IntersectionObserver', setupFailure)
    const setupView = render(<App />)
    expect(setupView.getAllByRole('img')).toHaveLength(3)
    setupView.unmount()

    MockIntersectionObserver.instances.length = 0
    vi.stubGlobal(
      'IntersectionObserver',
      MockIntersectionObserver as unknown as typeof IntersectionObserver,
    )
    Object.defineProperty(HTMLImageElement.prototype, 'decode', {
      configurable: true,
      value: vi.fn(() => Promise.reject(new Error('decode failed'))),
    })
    const decodeView = render(<App />)
    await flushPromises()
    const decodePanel = panelElements(decodeView.container)[0]
    act(() => {
      currentObserver().emit([
        { isIntersecting: true, ratio: 1, target: decodePanel },
      ])
    })
    expect(animateRecords).toHaveLength(0)
    expect(decodeView.getAllByRole('img')).toHaveLength(3)
    decodeView.unmount()

    MockIntersectionObserver.instances.length = 0
    Object.defineProperty(HTMLImageElement.prototype, 'decode', {
      configurable: true,
      value: vi.fn(() => Promise.resolve()),
    })
    Object.defineProperty(Element.prototype, 'animate', {
      configurable: true,
      value: vi.fn(() => {
        throw new Error('WAAPI failed')
      }),
    })
    const waapiView = render(<App />)
    await flushPromises()
    const waapiPanel = panelElements(waapiView.container)[0]
    act(() => {
      currentObserver().emit([
        { isIntersecting: true, ratio: 1, target: waapiPanel },
      ])
    })
    expect(waapiPanel.querySelector('[data-motion-crop]')).toHaveStyle({
      clipPath: VISIBLE_CLIP,
      opacity: '1',
      transform: IDENTITY_TRANSFORM,
      willChange: '',
    })
    expect(waapiPanel.querySelector('[data-light-echo]')).toHaveStyle({ opacity: '0' })
  })

  it('creates zero animations and keeps every light at zero for reduced motion', async () => {
    mediaQuery.matches = true
    const { container } = render(<App />)
    await flushPromises()
    const panels = panelElements(container)

    act(() => {
      currentObserver().emit(
        panels.map((target) => ({ isIntersecting: true, ratio: 1, target })),
      )
    })

    expect(animateRecords).toHaveLength(0)
    container.querySelectorAll('[data-light-echo]').forEach((light) => {
      expect(light).toHaveStyle({ opacity: '0' })
    })
    container.querySelectorAll('[data-motion-crop]').forEach((crop) => {
      expect(crop).toHaveStyle({
        opacity: '1',
        transform: IDENTITY_TRANSFORM,
      })
    })
  })

  it('cancels immediately when reduced motion is enabled and does not auto-replay', async () => {
    const { container } = render(<App />)
    await flushPromises()
    const [firstPanel] = panelElements(container)
    const observer = currentObserver()

    act(() => {
      observer.emit([{ isIntersecting: true, ratio: 1, target: firstPanel }])
    })
    const running = animateRecords.map((record) => record.animation)

    act(() => mediaQuery.dispatch(true))
    running.forEach((animation) => expect(animation.cancel).toHaveBeenCalledOnce())
    expect(firstPanel.querySelector('[data-light-echo]')).toHaveStyle({ opacity: '0' })

    act(() => {
      mediaQuery.dispatch(false)
      observer.emit([{ isIntersecting: true, ratio: 1, target: firstPanel }])
    })
    expect(animateRecords).toHaveLength(2)
  })
})
