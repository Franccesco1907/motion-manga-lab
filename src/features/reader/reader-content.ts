export const READER_MODE = {
  MOTION: 'motion',
  STATIC: 'static',
} as const

export type ReaderMode = (typeof READER_MODE)[keyof typeof READER_MODE]

export const DESCRIPTION_REVIEW_STATUS = {
  APPROVED_HUMAN_REVIEW: 'approved_human_review',
} as const

type DescriptionReviewStatus =
  (typeof DESCRIPTION_REVIEW_STATUS)[keyof typeof DESCRIPTION_REVIEW_STATUS]

interface DescriptionReviewRecord {
  reviewedAt: string
  reviewer: string
  status: DescriptionReviewStatus
}

export const DESCRIPTION_REVIEW = {
  reviewedAt: '2026-08-30',
  reviewer: 'Franccesco',
  status: DESCRIPTION_REVIEW_STATUS.APPROVED_HUMAN_REVIEW,
} as const satisfies DescriptionReviewRecord

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
  descriptionReviewStatus: DescriptionReviewStatus
  height: number
  id: string
  motion: PanelMotion
  order: number
  title: string
  width: number
}

export const READER_PANELS = [
  {
    alt: 'Una luz amarilla rodea varios objetos que flotan sobre el caldero. Pepper sonríe con las manos juntas y dice: «…¡ah! Perfecto.» Carrot está a su lado, junto a una escoba.',
    descriptionReviewStatus: DESCRIPTION_REVIEW.status,
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
    alt: 'Pepper pone una mano frente a Carrot, que estira las patas hacia una escoba resplandeciente sobre el caldero, y dice: «¡NO! Ni se te ocurra.»',
    descriptionReviewStatus: DESCRIPTION_REVIEW.status,
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
    alt: 'Carrot aterriza con las patas delanteras sobre la escoba que cruza el caldero y el líquido salpica con un «SPLASH». Pepper aparece parcialmente oculta a la izquierda.',
    descriptionReviewStatus: DESCRIPTION_REVIEW.status,
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
