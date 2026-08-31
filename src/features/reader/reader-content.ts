export const READER_MODE = {
  MOTION: 'motion',
  STATIC: 'static',
} as const

export type ReaderMode = (typeof READER_MODE)[keyof typeof READER_MODE]

export const DESCRIPTION_REVIEW = {
  STATUS: 'pending_human_review',
} as const

export const RESPONSIVE_SIZES =
  '(min-width: 1360px) 1200px, (min-width: 768px) calc(100vw - 144px), calc(100vw - 68px)'

const ASSET_ROOT = '/content/pepper-carrot/episode-01/page-02'

interface PanelMotion {
  duration: number
  emphasisOffset: number
  emphasisTransform: string
}

export interface ReaderPanel {
  alt: string
  descriptionReviewStatus: (typeof DESCRIPTION_REVIEW)[keyof typeof DESCRIPTION_REVIEW]
  height: number
  id: string
  motion: PanelMotion
  order: number
  title: string
  width: number
}

export const READER_PANELS = [
  {
    alt: 'Pepper celebra junto a Carrot mientras una escoba resplandece sobre el caldero; ella dice: «…¡ah! Perfecto.»',
    descriptionReviewStatus: DESCRIPTION_REVIEW.STATUS,
    height: 1061,
    id: 'e01p02-panel-01',
    motion: {
      duration: 880,
      emphasisOffset: 0.42,
      emphasisTransform: 'translate3d(0, -6px, 0) scale(1.010)',
    },
    order: 1,
    title: 'Transformation',
    width: 2275,
  },
  {
    alt: 'Pepper intenta detener a Carrot cuando el gato alcanza la escoba luminosa sobre el caldero; ella dice: «¡NO! Ni se te ocurra.»',
    descriptionReviewStatus: DESCRIPTION_REVIEW.STATUS,
    height: 994,
    id: 'e01p02-panel-02',
    motion: {
      duration: 760,
      emphasisOffset: 0.45,
      emphasisTransform: 'translate3d(0, -4px, 0) scale(1.007)',
    },
    order: 2,
    title: 'Intervention',
    width: 2275,
  },
  {
    alt: 'Carrot salta sobre la escoba encantada y la hunde en el caldero con un «SPLASH», mientras Pepper queda a un lado.',
    descriptionReviewStatus: DESCRIPTION_REVIEW.STATUS,
    height: 1098,
    id: 'e01p02-panel-03',
    motion: {
      duration: 700,
      emphasisOffset: 0.4,
      emphasisTransform: 'translate3d(0, 4px, 0) scale(1.006)',
    },
    order: 3,
    title: 'Consequence',
    width: 2275,
  },
] as const satisfies readonly ReaderPanel[]

export function panelAssetPath(
  panel: ReaderPanel,
  width: number,
  extension: 'jpg' | 'webp',
) {
  const panelNumber = String(panel.order).padStart(2, '0')
  const widthToken = String(width).padStart(4, '0')
  return `${ASSET_ROOT}/pepper-carrot-ep01-e01p02-panel-${panelNumber}-w${widthToken}.${extension}`
}

export function panelSourceSet(
  panel: ReaderPanel,
  extension: 'jpg' | 'webp',
) {
  return [640, 1280, 2275]
    .map((width) => `${panelAssetPath(panel, width, extension)} ${width}w`)
    .join(', ')
}
