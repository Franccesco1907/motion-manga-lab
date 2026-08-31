import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { JSDOM } from 'jsdom'
import { describe, expect, it } from 'vitest'

describe('no-JavaScript reader fallback', () => {
  it('keeps all panels readable in order with the exact responsive candidates', async () => {
    const html = await readFile(resolve(process.cwd(), 'index.html'), 'utf8')
    const document = new JSDOM(html).window.document
    const images = Array.from(document.querySelectorAll('noscript img'))

    expect(images).toHaveLength(3)
    expect(images.map((image) => image.width)).toEqual([2275, 2275, 2275])
    expect(images.map((image) => image.height)).toEqual([1061, 994, 1098])

    images.forEach((image, index) => {
      const panel = String(index + 1).padStart(2, '0')
      expect(image.getAttribute('srcset')).toBe(
        [640, 1280, 2275]
          .map(
            (width) =>
              `/content/pepper-carrot/episode-01/page-02/pepper-carrot-ep01-e01p02-panel-${panel}-w${String(width).padStart(4, '0')}.jpg ${width}w`,
          )
          .join(', '),
      )
      expect(image.closest('picture')?.querySelector('source')).toHaveAttribute(
        'srcset',
        [640, 1280, 2275]
          .map(
            (width) =>
              `/content/pepper-carrot/episode-01/page-02/pepper-carrot-ep01-e01p02-panel-${panel}-w${String(width).padStart(4, '0')}.webp ${width}w`,
          )
          .join(', '),
      )
    })
  })
})
