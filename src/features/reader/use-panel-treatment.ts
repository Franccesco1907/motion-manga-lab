import { useEffect, useRef, useState, type RefObject } from 'react'
import {
  READER_MODE,
  READER_PANELS,
  type ReaderMode,
  type ReaderPanel,
} from './reader-content'

const IDENTITY_TRANSFORM = 'translate3d(0, 0, 0) scale(1)'
const VISIBLE_CLIP = 'inset(0 0 0 0)'
const SEGMENT_A_EASING = 'cubic-bezier(0.77, 0, 0.175, 1)'
const SEGMENT_B_EASING = 'cubic-bezier(0.23, 1, 0.32, 1)'

interface PanelRuntime {
  crop: HTMLElement
  cropAnimation: Animation | null
  decoded: boolean
  decodeFailed: boolean
  element: HTMLElement
  intersecting: boolean
  intersectionRatio: number
  light: HTMLElement
  lightAnimation: Animation | null
  panel: ReaderPanel
  played: boolean
  started: boolean
}

interface TreatmentState {
  activePanelId: string
  activatePanel: (panelId: string) => void
  readerRef: RefObject<HTMLElement | null>
}

interface PanelVisibility {
  ratio: number
  runtime: PanelRuntime
  top: number
}

const VISIBILITY_TIE_EPSILON = 0.001

function panelVisibility(runtime: PanelRuntime): PanelVisibility {
  const bounds = runtime.element.getBoundingClientRect()
  const viewportHeight = window.innerHeight || document.documentElement.clientHeight

  if (bounds.height > 0 && viewportHeight > 0) {
    const visibleHeight = Math.max(
      0,
      Math.min(bounds.bottom, viewportHeight) - Math.max(bounds.top, 0),
    )
    return {
      ratio: visibleHeight / bounds.height,
      runtime,
      top: bounds.top,
    }
  }

  return {
    ratio: runtime.intersectionRatio,
    runtime,
    top: bounds.top,
  }
}

function selectActivePanel(
  runtimes: Map<string, PanelRuntime>,
  explicitPanelId: string | null,
) {
  const visiblePanels = Array.from(runtimes.values())
    .map(panelVisibility)
    .filter(({ ratio }) => ratio > 0)

  if (visiblePanels.length === 0) return null

  const highestRatio = Math.max(...visiblePanels.map(({ ratio }) => ratio))
  const tiedPanels = visiblePanels.filter(
    ({ ratio }) => Math.abs(ratio - highestRatio) <= VISIBILITY_TIE_EPSILON,
  )
  const explicitPanel = tiedPanels.find(
    ({ runtime }) => runtime.panel.id === explicitPanelId,
  )

  if (explicitPanel) return explicitPanel.runtime.panel.id

  tiedPanels.sort((left, right) => {
    const positionDifference = Math.abs(left.top) - Math.abs(right.top)
    if (Math.abs(positionDifference) > VISIBILITY_TIE_EPSILON) {
      return positionDifference
    }
    return left.runtime.panel.order - right.runtime.panel.order
  })

  return tiedPanels[0]?.runtime.panel.id ?? null
}

function resetPanel(runtime: PanelRuntime) {
  runtime.crop.style.transform = IDENTITY_TRANSFORM
  runtime.crop.style.opacity = '1'
  runtime.crop.style.clipPath = VISIBLE_CLIP
  runtime.crop.style.willChange = ''
  runtime.light.style.opacity = '0'
}

function animationKeyframes(panel: ReaderPanel): Keyframe[] {
  return [
    {
      clipPath: VISIBLE_CLIP,
      easing: SEGMENT_A_EASING,
      offset: 0,
      opacity: 1,
      transform: IDENTITY_TRANSFORM,
    },
    {
      clipPath: VISIBLE_CLIP,
      easing: SEGMENT_B_EASING,
      offset: panel.motion.emphasisOffset,
      opacity: 1,
      transform: panel.motion.emphasisTransform,
    },
    {
      clipPath: VISIBLE_CLIP,
      offset: 1,
      opacity: 1,
      transform: IDENTITY_TRANSFORM,
    },
  ]
}

function cancelAnimations(runtime: PanelRuntime) {
  const animations = [runtime.cropAnimation, runtime.lightAnimation]
  animations.forEach((animation) => {
    if (!animation) return
    animation.onfinish = null
    animation.oncancel = null
    try {
      animation.cancel()
    } catch {
      // The readable identity state is restored below even if cancellation fails.
    }
  })
  runtime.cropAnimation = null
  runtime.lightAnimation = null
  resetPanel(runtime)
}

function pauseAnimations(runtime: PanelRuntime) {
  ;[runtime.cropAnimation, runtime.lightAnimation].forEach((animation) => {
    if (!animation) return
    try {
      animation.pause()
    } catch {
      resetPanel(runtime)
    }
  })
}

function resumeAnimations(runtime: PanelRuntime) {
  ;[runtime.cropAnimation, runtime.lightAnimation].forEach((animation) => {
    if (!animation) return
    try {
      animation.play()
    } catch {
      resetPanel(runtime)
    }
  })
}

export function usePanelTreatment(
  mode: ReaderMode,
  restartVersion: number,
): TreatmentState {
  const readerRef = useRef<HTMLElement | null>(null)
  const explicitPanelIdRef = useRef<string | null>(null)
  const [activePanelId, setActivePanelId] = useState<string>(READER_PANELS[0].id)

  const activatePanel = (panelId: string) => {
    explicitPanelIdRef.current = panelId
    setActivePanelId(panelId)
  }

  useEffect(() => {
    const reader = readerRef.current
    if (!reader) return

    let active = true
    let reducedMotion = false
    let observer: IntersectionObserver | null = null
    const runtimes = new Map<string, PanelRuntime>()
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)')

    const finishPanel = (runtime: PanelRuntime) => {
      if (!active || runtime.played) return
      resetPanel(runtime)
      runtime.played = true
      runtime.cropAnimation = null
      runtime.lightAnimation = null
      observer?.unobserve(runtime.element)
    }

    const startPanel = (runtime: PanelRuntime, delay: number) => {
      if (
        runtime.started ||
        runtime.played ||
        runtime.decodeFailed ||
        !runtime.decoded ||
        !runtime.intersecting ||
        runtime.intersectionRatio < 0.6 ||
        reducedMotion ||
        mode !== READER_MODE.MOTION
      ) {
        return
      }

      runtime.started = true
      runtime.crop.style.willChange = 'transform'

      try {
        runtime.cropAnimation = runtime.crop.animate(
          animationKeyframes(runtime.panel),
          {
            delay,
            duration: runtime.panel.motion.duration,
            fill: 'none',
          },
        )

        if (runtime.panel.order === 1) {
          runtime.lightAnimation = runtime.light.animate(
            [
              { offset: 0, opacity: 0 },
              { offset: 0.35, opacity: 0.16 },
              { offset: 1, opacity: 0 },
            ],
            {
              delay: delay + 80,
              duration: 720,
              easing: SEGMENT_B_EASING,
              fill: 'none',
            },
          )
        }

        runtime.cropAnimation.onfinish = () => finishPanel(runtime)
        if (runtime.lightAnimation) {
          runtime.lightAnimation.onfinish = () => {
            runtime.light.style.opacity = '0'
          }
        }

        if (document.visibilityState === 'hidden' || !runtime.intersecting) {
          pauseAnimations(runtime)
        }
      } catch {
        cancelAnimations(runtime)
        runtime.played = true
        observer?.unobserve(runtime.element)
      }
    }

    const handleEntries: IntersectionObserverCallback = (entries) => {
      entries.forEach((entry) => {
        if (!(entry.target instanceof HTMLElement)) return
        const panelId = entry.target.dataset.panelId
        if (!panelId) return
        const runtime = runtimes.get(panelId)
        if (!runtime) return

        runtime.intersecting = entry.isIntersecting && entry.intersectionRatio > 0
        runtime.intersectionRatio = entry.intersectionRatio

        if (runtime.started && !runtime.played) {
          if (!runtime.intersecting) {
            pauseAnimations(runtime)
          } else if (document.visibilityState === 'visible') {
            resumeAnimations(runtime)
          }
        }
      })

      const selectedPanelId = selectActivePanel(
        runtimes,
        explicitPanelIdRef.current,
      )
      if (selectedPanelId) {
        if (selectedPanelId !== explicitPanelIdRef.current) {
          explicitPanelIdRef.current = null
        }
        setActivePanelId(selectedPanelId)
      }

      const eligible = entries
        .map((entry) =>
          entry.target instanceof HTMLElement
            ? runtimes.get(entry.target.dataset.panelId ?? '')
            : undefined,
        )
        .filter(
          (runtime): runtime is PanelRuntime =>
            Boolean(
              runtime &&
                runtime.decoded &&
                runtime.intersecting &&
                runtime.intersectionRatio >= 0.6 &&
                !runtime.started &&
                !runtime.played,
            ),
        )
        .sort((left, right) => left.panel.order - right.panel.order)

      eligible.forEach((runtime, index) => startPanel(runtime, index * 60))
    }

    const handleVisibilityChange = () => {
      runtimes.forEach((runtime) => {
        if (!runtime.started || runtime.played) return
        if (document.visibilityState === 'hidden') {
          pauseAnimations(runtime)
        } else if (runtime.intersecting) {
          resumeAnimations(runtime)
        }
      })
    }

    const handleMotionPreference = (event: MediaQueryListEvent) => {
      reducedMotion = event.matches
      if (!event.matches) return

      runtimes.forEach((runtime) => {
        cancelAnimations(runtime)
        runtime.played = true
      })
    }

    try {
      READER_PANELS.forEach((panel) => {
        const element = reader.querySelector<HTMLElement>(`#${panel.id}`)
        const crop = element?.querySelector<HTMLElement>('[data-motion-crop]')
        const image = element?.querySelector<HTMLImageElement>('img')
        const light = element?.querySelector<HTMLElement>('[data-light-echo]')
        if (!element || !crop || !image || !light) {
          throw new Error(`Incomplete panel DOM for ${panel.id}`)
        }

        const runtime: PanelRuntime = {
          crop,
          cropAnimation: null,
          decoded: false,
          decodeFailed: false,
          element,
          intersecting: false,
          intersectionRatio: 0,
          light,
          lightAnimation: null,
          panel,
          played: mediaQuery.matches,
          started: false,
        }
        resetPanel(runtime)
        runtimes.set(panel.id, runtime)

        image
          .decode()
          .then(() => {
            if (!active) return
            runtime.decoded = true
            startPanel(runtime, 0)
          })
          .catch(() => {
            runtime.decodeFailed = true
            resetPanel(runtime)
          })
      })

      reducedMotion = mediaQuery.matches
      observer = new IntersectionObserver(handleEntries, {
        root: null,
        rootMargin: '0px 0px -10% 0px',
        threshold: [0, 0.6],
      })
      runtimes.forEach((runtime) => observer?.observe(runtime.element))
      document.addEventListener('visibilitychange', handleVisibilityChange)
      mediaQuery.addEventListener('change', handleMotionPreference)
      reader.classList.add('is-enhanced')
    } catch {
      runtimes.forEach(resetPanel)
    }

    return () => {
      active = false
      reader.classList.remove('is-enhanced')
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      mediaQuery.removeEventListener('change', handleMotionPreference)
      observer?.disconnect()
      runtimes.forEach(cancelAnimations)
    }
  }, [mode, restartVersion])

  return { activePanelId, activatePanel, readerRef }
}
