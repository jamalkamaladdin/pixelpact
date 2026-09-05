import { describe, expect, it } from 'vitest'
import { formatSideReport } from '../src/report.js'
import { clusterMask, diffMask } from '../src/side/cluster.js'
import { buildSideHtml, escapeHtml, type SideHtmlInput } from '../src/side/compose.js'
import {
  commonCanvas,
  cropWindow,
  dedupeSlugs,
  deriveLabel,
  deriveSlug,
  matchesOnly,
  pairSections,
  type RawSection,
  scaleBox,
  sectionSelector,
  slugify,
} from '../src/side/segment.js'
import type { SideReport, SideSection } from '../src/types.js'

/** ANSI control sequence introducer, without an escape literal in the source. */
const CSI = `${String.fromCharCode(27)}[`

const section = (overrides: Partial<RawSection> = {}): RawSection => ({
  childIndex: 1,
  tag: 'section',
  id: '',
  className: '',
  heading: '',
  text: '',
  top: 0,
  height: 400,
  elements: 42,
  ...overrides,
})

/** A mask with one filled rectangle, so a cluster can be asked for by shape. */
const maskWith = (
  width: number,
  height: number,
  rectangles: { x: number; y: number; w: number; h: number }[],
): Uint8Array => {
  const mask = new Uint8Array(width * height)
  for (const rectangle of rectangles) {
    for (let y = rectangle.y; y < rectangle.y + rectangle.h; y++) {
      for (let x = rectangle.x; x < rectangle.x + rectangle.w; x++) mask[y * width + x] = 1
    }
  }
  return mask
}

const sideSection = (overrides: Partial<SideSection> = {}): SideSection => ({
  index: 1,
  slug: 'hero',
  label: 'Build it once',
  width: 1440,
  totalPixels: 1440 * 800,
  differentPixels: 1152,
  differentPercent: 0.1,
  ok: true,
  image: '/out/1440/01-hero.png',
  boxes: [],
  ...overrides,
})

const sideReport = (overrides: Partial<SideReport> = {}): SideReport => ({
  version: 1,
  reference: 'https://reference.example',
  target: 'http://localhost:3000',
  checkedAt: '2026-01-01T00:00:00.000Z',
  widths: [1440, 390],
  threshold: 0.5,
  sections: [sideSection(), sideSection({ index: 2, slug: 'pricing', ok: false })],
  unmatched: { reference: 0, target: 0 },
  totals: { sections: 2, passed: 1, failed: 1 },
  ok: false,
  warnings: [],
  ...overrides,
})

const htmlInput = (overrides: Partial<SideHtmlInput> = {}): SideHtmlInput => ({
  slug: 'hero',
  label: 'Build it once',
  width: 1440,
  percent: 1.25,
  threshold: 0.5,
  ok: false,
  referenceUrl: 'https://reference.example',
  targetUrl: 'http://localhost:3000',
  referenceImage: 'reference.png',
  targetImage: 'target.png',
  canvasWidth: 1440,
  columnWidth: 720,
  clusters: [{ cells: 4, x: 0, y: 100, w: 80, h: 40 }],
  facts: [{ state: 'fail', text: 'Pixels: 12 of 100 differ.' }],
  ...overrides,
})

describe('slug derivation', () => {
  it('prefers the id, because the author chose it on purpose', () => {
    expect(deriveSlug(section({ id: 'Pricing-Plans', heading: 'Our plans' }), 3)).toBe(
      'pricing-plans',
    )
  })

  it('falls back to the first heading when there is no id', () => {
    expect(deriveSlug(section({ heading: 'What  we do!' }), 3)).toBe('what-we-do')
  })

  it('falls back to the position when the section carries no name at all', () => {
    expect(deriveSlug(section(), 7)).toBe('section-7')
  })

  it('ignores an id that slugifies to nothing', () => {
    expect(deriveSlug(section({ id: '///', heading: 'Contact' }), 2)).toBe('contact')
  })

  it('strips punctuation and trims the separators it created', () => {
    expect(slugify('  Hello, World!  ')).toBe('hello-world')
    expect(slugify('***')).toBe('')
  })

  it('keeps slugs short enough to use as a file name', () => {
    expect(slugify('a'.repeat(80)).length).toBe(40)
  })

  it('numbers repeats so two sections never write to the same file', () => {
    expect(dedupeSlugs(['hero', 'hero', 'about', 'hero'])).toEqual([
      'hero',
      'hero-2',
      'about',
      'hero-3',
    ])
  })
})

describe('section labels', () => {
  it('reads as the heading when the section has one', () => {
    expect(deriveLabel(section({ heading: 'Our plans', id: 'pricing' }))).toBe('Our plans')
  })

  it('falls back to a selector that locates the section', () => {
    expect(deriveLabel(section({ id: 'pricing' }))).toBe('section#pricing')
    expect(sectionSelector(section({ className: 'hero dark' }))).toBe('section.hero')
    expect(sectionSelector(section({ tag: 'div', childIndex: 4 }))).toBe('div:nth-child(4)')
  })
})

describe('pairSections', () => {
  it('pairs by position and numbers the pairs from one', () => {
    const pairing = pairSections(
      [section({ id: 'a' }), section({ id: 'b' })],
      [section(), section()],
    )
    expect(pairing.pairs).toHaveLength(2)
    expect(pairing.pairs[0].index).toBe(1)
    expect(pairing.pairs[1].reference.id).toBe('b')
    expect(pairing.unmatched).toEqual({ reference: 0, target: 0 })
  })

  it('counts the reference surplus instead of inventing a counterpart', () => {
    const pairing = pairSections([section(), section(), section(), section()], [section()])
    expect(pairing.pairs).toHaveLength(1)
    expect(pairing.unmatched.reference).toBe(3)
    expect(pairing.unmatched.target).toBe(0)
  })

  it('counts a surplus on the implementation side as well', () => {
    const pairing = pairSections([section()], [section(), section(), section()])
    expect(pairing.pairs).toHaveLength(1)
    expect(pairing.unmatched).toEqual({ reference: 0, target: 2 })
  })

  it('compares nothing when one page has no sections', () => {
    const pairing = pairSections([], [section()])
    expect(pairing.pairs).toHaveLength(0)
    expect(pairing.unmatched.target).toBe(1)
  })
})

describe('matchesOnly', () => {
  it('takes every section when nothing was asked for', () => {
    expect(matchesOnly(3, 'hero', null)).toBe(true)
    expect(matchesOnly(3, 'hero', '')).toBe(true)
  })

  it('selects by 1-based index, as a number or as digits', () => {
    expect(matchesOnly(2, 'hero', 2)).toBe(true)
    expect(matchesOnly(2, 'hero', 3)).toBe(false)
    expect(matchesOnly(2, 'hero', '2')).toBe(true)
    expect(matchesOnly(2, 'hero', ' 3 ')).toBe(false)
  })

  it('selects by part of the slug, ignoring case', () => {
    expect(matchesOnly(4, 'pricing-plans', 'pricing')).toBe(true)
    expect(matchesOnly(4, 'pricing-plans', 'PLANS')).toBe(true)
    expect(matchesOnly(4, 'pricing-plans', 'footer')).toBe(false)
  })
})

describe('geometry helpers', () => {
  it('takes the larger of each dimension, so a shorter page shows as a difference', () => {
    expect(commonCanvas({ width: 100, height: 400 }, { width: 120, height: 300 })).toEqual({
      width: 120,
      height: 400,
    })
  })

  it('clamps a crop to the image it is cut from', () => {
    expect(cropWindow(10, 50, 200)).toEqual({ top: 10, height: 50 })
    expect(cropWindow(180, 50, 200)).toEqual({ top: 180, height: 20 })
    expect(cropWindow(-5, 50, 200)).toEqual({ top: 0, height: 50 })
    expect(cropWindow(0, 10, 0)).toEqual({ top: 0, height: 0 })
  })

  it('scales a box and never scales it away to nothing', () => {
    expect(scaleBox({ x: 100, y: 200, w: 40, h: 40 }, 0.5)).toEqual({ x: 50, y: 100, w: 20, h: 20 })
    expect(scaleBox({ x: 0, y: 0, w: 2, h: 2 }, 0.1)).toEqual({ x: 0, y: 0, w: 1, h: 1 })
  })
})

describe('diffMask', () => {
  it('marks the red pixels pixelmatch painted and nothing else', () => {
    const data = new Uint8Array([
      255, 0, 0, 255, 200, 200, 200, 255, 255, 40, 40, 255, 0, 0, 0, 255,
    ])
    expect(Array.from(diffMask(data, 4, 1))).toEqual([1, 0, 1, 0])
  })

  it('returns an empty mask for an empty image', () => {
    expect(diffMask(new Uint8Array(0), 0, 0)).toHaveLength(0)
  })
})

describe('clusterMask', () => {
  it('boxes one connected region', () => {
    const mask = maskWith(100, 100, [{ x: 0, y: 0, w: 40, h: 20 }])
    const boxes = clusterMask(mask, 100, 100, { cellSize: 10 })
    expect(boxes).toHaveLength(1)
    expect(boxes[0]).toMatchObject({ x: 0, y: 0, w: 40, h: 20, cells: 8 })
  })

  it('keeps two separate regions as two boxes', () => {
    const mask = maskWith(100, 100, [
      { x: 0, y: 0, w: 20, h: 20 },
      { x: 60, y: 60, w: 20, h: 20 },
    ])
    const boxes = clusterMask(mask, 100, 100, { cellSize: 10 })
    expect(boxes).toHaveLength(2)
    expect(boxes.map((box) => ({ x: box.x, y: box.y }))).toEqual([
      { x: 0, y: 0 },
      { x: 60, y: 60 },
    ])
  })

  it('orders the boxes by how much differs, largest first', () => {
    const mask = maskWith(100, 100, [
      { x: 0, y: 0, w: 20, h: 20 },
      { x: 50, y: 50, w: 40, h: 40 },
    ])
    const boxes = clusterMask(mask, 100, 100, { cellSize: 10 })
    expect(boxes[0].cells).toBe(16)
    expect(boxes[1].cells).toBe(4)
  })

  it('ignores a cell that barely differs', () => {
    const mask = maskWith(100, 100, [{ x: 0, y: 0, w: 3, h: 3 }])
    expect(clusterMask(mask, 100, 100, { cellSize: 10 })).toHaveLength(0)
  })

  it('drops a cluster smaller than minCells and keeps it when the floor is lowered', () => {
    const mask = maskWith(100, 100, [{ x: 0, y: 0, w: 10, h: 10 }])
    expect(clusterMask(mask, 100, 100, { cellSize: 10 })).toHaveLength(0)
    expect(clusterMask(mask, 100, 100, { cellSize: 10, minCells: 1 })).toHaveLength(1)
  })

  it('caps how many boxes are drawn', () => {
    const mask = maskWith(100, 100, [
      { x: 0, y: 0, w: 20, h: 20 },
      { x: 40, y: 0, w: 20, h: 20 },
      { x: 80, y: 80, w: 20, h: 20 },
    ])
    expect(clusterMask(mask, 100, 100, { cellSize: 10, maxBoxes: 2 })).toHaveLength(2)
  })

  it('clamps a box to the image when the grid overhangs it', () => {
    const mask = maskWith(45, 45, [{ x: 20, y: 20, w: 25, h: 25 }])
    const boxes = clusterMask(mask, 45, 45, { cellSize: 10, minCells: 1 })
    expect(boxes[0].x + boxes[0].w).toBeLessThanOrEqual(45)
    expect(boxes[0].y + boxes[0].h).toBeLessThanOrEqual(45)
  })

  it('has nothing to cluster in an empty image', () => {
    expect(clusterMask(new Uint8Array(0), 0, 0)).toEqual([])
  })
})

describe('buildSideHtml', () => {
  it('carries the slug, the width and the percentage in the header', () => {
    const html = buildSideHtml(htmlInput())
    expect(html).toContain('<h1>hero</h1>')
    expect(html).toContain('1440px')
    expect(html).toContain('1.250% different')
    expect(html).toContain('FAIL')
  })

  it('draws both pictures at the same width and boxes them at one scale', () => {
    const html = buildSideHtml(htmlInput())
    expect(html).toContain('src="reference.png"')
    expect(html).toContain('src="target.png"')
    expect(html).toContain('.frame img{width:720px')
    // 720 of 1440 is half scale: the box at y 100 sized 80x40 lands at 50, 40x20
    expect(html).toContain('left:0px;top:50px;width:40px;height:20px')
  })

  it('escapes text that came off the page', () => {
    const html = buildSideHtml(htmlInput({ label: '<script>alert(1)</script>' }))
    expect(html).not.toContain('<script>alert(1)</script>')
    expect(html).toContain('&lt;script&gt;')
    expect(escapeHtml('a & "b" <c>')).toBe('a &amp; &quot;b&quot; &lt;c&gt;')
  })
})

describe('formatSideReport', () => {
  it('leads with a verdict, both addresses and the widths', () => {
    const text = formatSideReport(sideReport())
    expect(text.split('\n')[0]).toContain('FAILED')
    expect(text).toContain('https://reference.example')
    expect(text).toContain('http://localhost:3000')
    expect(text).toContain('1440px, 390px')
    expect(text).toContain('1 passed, 1 failed of 2')
  })

  it('prints one row per section and the image path for failures only', () => {
    const text = formatSideReport(sideReport())
    expect(text).toContain('SECTION')
    expect(text).toContain('01')
    expect(text).toContain('pricing')
    expect(text).toContain('0.100%')
    expect(text).toContain('/out/1440/01-hero.png')
    const rows = text.split('\n').filter((line) => line.includes('/out/'))
    expect(rows).toHaveLength(1)
  })

  it('emits no ANSI codes unless colour was asked for', () => {
    expect(formatSideReport(sideReport())).not.toContain(CSI)
    expect(formatSideReport(sideReport(), { color: true })).toContain(CSI)
  })

  it('names the sections that had no counterpart', () => {
    const text = formatSideReport(sideReport({ unmatched: { reference: 2, target: 0 } }))
    expect(text).toContain('2 in the reference')
  })

  it('lists the warnings it was given', () => {
    const text = formatSideReport(sideReport({ warnings: ['the hero is missing at 390px'] }))
    expect(text).toContain('warnings (1)')
    expect(text).toContain('the hero is missing at 390px')
  })

  it('says so plainly when every section passed', () => {
    const text = formatSideReport(
      sideReport({
        sections: [sideSection()],
        totals: { sections: 1, passed: 1, failed: 0 },
        ok: true,
      }),
    )
    expect(text).toContain('PASSED')
    expect(text).toContain('Every section is inside the pixel budget.')
  })

  it('summarises the rows it did not print', () => {
    const many = Array.from({ length: 25 }, (_, index) => sideSection({ index: index + 1 }))
    const text = formatSideReport(
      sideReport({ sections: many, totals: { sections: 25, passed: 25, failed: 0 } }),
      { limit: 5 },
    )
    expect(text).toContain('20 more')
  })
})
