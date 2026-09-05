import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it, vi } from 'vitest'
import { compareProperty } from '../src/compare.js'
import { parseContract } from '../src/contract.js'
import { FigmaError } from '../src/errors.js'
import { resolveFigmaToken } from '../src/figma/client.js'
import { extractFromFigma } from '../src/figma/extract.js'
import type { FigmaNode, FigmaStyleMeta } from '../src/figma/map.js'
import { figmaColor, mapFigmaTree, mapNodeStyles } from '../src/figma/map.js'
import { isFigmaUrl, parseFigmaUrl } from '../src/figma/url.js'
import { figmaMatchHint } from '../src/report.js'
import type { CheckReport, ContractElement, StyleMap } from '../src/types.js'

const load = <T>(name: string): T =>
  JSON.parse(
    readFileSync(fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url)), 'utf8'),
  ) as T

interface NodesFixture {
  nodes: Record<string, { document: FigmaNode; styles: Record<string, FigmaStyleMeta> }>
}

interface FileFixture {
  document: FigmaNode
}

const nodesFixture = load<NodesFixture>('figma-nodes.json')
const fileFixture = load<FileFixture>('figma-file.json')

const entry = nodesFixture.nodes['1:23']
const mapped = mapFigmaTree({ root: entry.document, styles: entry.styles })

const bySelector = (selector: string): ContractElement => {
  const found = mapped.elements.find((element) => element.selector === selector)
  if (!found) throw new Error(`fixture has no element ${selector}`)
  return found
}

const styleOf = (selector: string): StyleMap => bySelector(selector).styles

describe('parseFigmaUrl', () => {
  it('reads the design url form and normalises the node id', () => {
    const target = parseFigmaUrl('https://www.figma.com/design/abc123XYZ890/Site?node-id=1-23')
    expect(target?.fileKey).toBe('abc123XYZ890')
    expect(target?.nodeId).toBe('1:23')
  })

  it('reads the older file url form, which carries no node', () => {
    const target = parseFigmaUrl('https://www.figma.com/file/abc123XYZ890/Marketing-site')
    expect(target?.fileKey).toBe('abc123XYZ890')
    expect(target?.nodeId).toBeNull()
  })

  it('accepts a proto url and an already escaped colon', () => {
    const target = parseFigmaUrl('https://figma.com/proto/abc123XYZ890/Site?node-id=1%3A23&t=x')
    expect(target?.fileKey).toBe('abc123XYZ890')
    expect(target?.nodeId).toBe('1:23')
  })

  it('keeps the compound node id of a nested instance', () => {
    const target = parseFigmaUrl('https://www.figma.com/design/abc123XYZ890/S?node-id=I12-3;45-6')
    expect(target?.nodeId).toBe('I12:3;45:6')
  })

  it('returns null for a url that is not Figma', () => {
    expect(parseFigmaUrl('https://example.com/design/abc123XYZ890/Site')).toBeNull()
  })

  it('returns null for a Figma url with no file key', () => {
    expect(parseFigmaUrl('https://www.figma.com/files/recent')).toBeNull()
  })

  it('answers isFigmaUrl for both sides of the question', () => {
    expect(isFigmaUrl('figma.com/design/abc123XYZ890/Site')).toBe(true)
    expect(isFigmaUrl('http://localhost:3000')).toBe(false)
  })
})

describe('figmaColor', () => {
  it('writes an opaque colour as rgb', () => {
    expect(figmaColor({ r: 0, g: 0.35294117647058826, b: 0.7843137254901961, a: 1 })).toBe(
      'rgb(0, 90, 200)',
    )
  })

  it('writes a transparent colour as rgba', () => {
    expect(figmaColor({ r: 1, g: 1, b: 1, a: 0.8 })).toBe('rgba(255, 255, 255, 0.8)')
  })

  it('multiplies the paint opacity into the alpha channel', () => {
    expect(figmaColor({ r: 0, g: 0, b: 0, a: 0.5 }, 0.5)).toBe('rgba(0, 0, 0, 0.25)')
  })

  it('clamps channels that fall outside the 0 to 1 range', () => {
    expect(figmaColor({ r: 1.4, g: -0.2, b: 0.5, a: 2 })).toBe('rgb(255, 0, 128)')
  })
})

describe('mapFigmaTree', () => {
  it('walks the visible tree depth first and skips hidden subtrees', () => {
    expect(mapped.elements.map((element) => element.selector)).toEqual([
      'figma:1:23',
      'figma:1:24',
      'figma:1:25',
      'figma:1:26',
      'figma:1:27',
      'figma:1:30',
      'figma:1:31',
    ])
    expect(mapped.visibleTotal).toBe(7)
    expect(mapped.truncated).toBe(false)
  })

  it('leaves a hidden layer and its children out entirely', () => {
    const selectors = mapped.elements.map((element) => element.selector)
    expect(selectors).not.toContain('figma:1:28')
    expect(selectors).not.toContain('figma:1:29')
  })

  it('carries the layer name as the contractId that matching runs on', () => {
    const root = bySelector('figma:1:23')
    expect(root.contractId).toBe('Hero')
    expect(root.tag).toBe('frame')
    expect(bySelector('figma:1:26').tag).toBe('instance')
  })

  it('reads text only from TEXT nodes', () => {
    expect(bySelector('figma:1:24').text).toBe('Ship what you designed')
    expect(bySelector('figma:1:23').text).toBe('')
  })

  it('never claims an interaction state Figma cannot report', () => {
    for (const element of mapped.elements) {
      expect(element.interactive).toBe(false)
      expect(element.hover).toBeUndefined()
      expect(element.focus).toBeUndefined()
      expect(element.before).toBeUndefined()
      expect(element.after).toBeUndefined()
    }
  })

  it('translates every box so the root sits at the origin', () => {
    expect(bySelector('figma:1:23').box).toEqual({ x: 0, y: 0, w: 1440, h: 720 })
    expect(bySelector('figma:1:24').box).toEqual({ x: 32, y: 48, w: 800, h: 56 })
  })

  it('translates a nested box against the root, not against its parent', () => {
    expect(bySelector('figma:1:30').box).toEqual({ x: 80, y: 336, w: 300, h: 200 })
    expect(bySelector('figma:1:31').box).toEqual({ x: 100, y: 356, w: 100, h: 20 })
  })

  it('takes the viewport size from the root frame', () => {
    expect(mapped.size).toEqual({ width: 1440, height: 720 })
  })

  it('collects colour styles as tokens and ignores text styles', () => {
    expect(mapped.tokens['Brand/Blue 600']).toBe('rgb(0, 90, 200)')
    expect(mapped.tokens['Brand/On Blue']).toBe('rgb(255, 255, 255)')
    expect(mapped.tokens['Display/XL']).toBeUndefined()
  })

  it('honours the layer budget and says the walk was cut short', () => {
    const small = mapFigmaTree({ root: entry.document, maxElements: 3 })
    expect(small.elements).toHaveLength(3)
    expect(small.truncated).toBe(true)
    expect(small.visibleTotal).toBe(7)
  })

  it('treats a budget of zero as unbounded', () => {
    expect(mapFigmaTree({ root: entry.document, maxElements: 0 }).elements).toHaveLength(7)
  })
})

describe('style mapping', () => {
  it('puts a solid fill on background-color, and on color for text', () => {
    expect(styleOf('figma:1:23')['background-color']).toBe('rgb(0, 90, 200)')
    expect(styleOf('figma:1:24').color).toBe('rgb(255, 255, 255)')
    expect(styleOf('figma:1:24')['background-color']).toBeUndefined()
  })

  it('keeps the alpha of a semi transparent text fill', () => {
    expect(styleOf('figma:1:25').color).toBe('rgba(255, 255, 255, 0.8)')
  })

  it('maps a vertical auto layout to flex, gap and padding', () => {
    const styles = styleOf('figma:1:23')
    expect(styles.display).toBe('flex')
    expect(styles['flex-direction']).toBe('column')
    expect(styles.gap).toBe('24px')
    expect(styles['padding-top']).toBe('48px')
    expect(styles['padding-right']).toBe('32px')
    expect(styles['padding-bottom']).toBe('48px')
    expect(styles['padding-left']).toBe('32px')
    expect(styles['justify-content']).toBe('center')
    expect(styles['align-items']).toBe('flex-start')
  })

  it('maps a horizontal auto layout and leaves a zero gap unstated', () => {
    const styles = styleOf('figma:1:26')
    expect(styles['flex-direction']).toBe('row')
    expect(styles.gap).toBeUndefined()
    expect(styles['justify-content']).toBe('space-between')
    expect(styles['align-items']).toBe('center')
    expect(styles['padding-left']).toBe('20px')
  })

  it('maps text style, including an absolute line height', () => {
    const styles = styleOf('figma:1:24')
    expect(styles['font-family']).toBe('Inter')
    expect(styles['font-size']).toBe('48px')
    expect(styles['font-weight']).toBe('700')
    expect(styles['line-height']).toBe('56px')
    expect(styles['letter-spacing']).toBe('-0.5px')
    expect(styles['text-align']).toBe('left')
    expect(styles['text-transform']).toBe('none')
  })

  it('maps a percentage line height to the unitless css ratio', () => {
    const styles = styleOf('figma:1:25')
    expect(styles['line-height']).toBe('1.5')
    expect(styles['letter-spacing']).toBe('normal')
    expect(styles['text-align']).toBe('center')
    expect(styles['text-transform']).toBe('uppercase')
  })

  it('maps per corner radii in the order Figma lists them', () => {
    const styles = styleOf('figma:1:26')
    expect(styles['border-top-left-radius']).toBe('8px')
    expect(styles['border-top-right-radius']).toBe('8px')
    expect(styles['border-bottom-right-radius']).toBe('24px')
    expect(styles['border-bottom-left-radius']).toBe('24px')
  })

  it('spreads a single cornerRadius across all four corners', () => {
    const styles = styleOf('figma:1:30')
    expect(styles['border-top-left-radius']).toBe('16px')
    expect(styles['border-bottom-right-radius']).toBe('16px')
  })

  it('maps a stroke to the border longhands a browser reports', () => {
    const styles = styleOf('figma:1:26')
    expect(styles['border-top-width']).toBe('2px')
    expect(styles['border-left-width']).toBe('2px')
    expect(styles['border-top-style']).toBe('solid')
    expect(styles['border-top-color']).toBe('rgb(0, 0, 0)')
  })

  it('maps a drop shadow and an opacity below one', () => {
    const styles = styleOf('figma:1:26')
    expect(styles['box-shadow']).toBe('0px 4px 12px 0px rgba(0, 0, 0, 0.25)')
    expect(styles.opacity).toBe('0.9')
  })

  it('leaves opacity out when the layer is fully opaque', () => {
    expect(styleOf('figma:1:23').opacity).toBeUndefined()
  })

  it('warns about a gradient fill instead of inventing a colour', () => {
    expect(styleOf('figma:1:27')['background-color']).toBeUndefined()
    const warning = mapped.warnings.find((text) => text.includes('Hero/Glow'))
    expect(warning).toContain('GRADIENT_LINEAR')
    expect(warning).toContain('1:27')
  })

  it('writes nothing for a layer that carries no style at all', () => {
    const warnings: string[] = []
    const styles = mapNodeStyles({ id: '9:9', name: 'Empty', type: 'FRAME' }, warnings)
    expect(styles).toEqual({})
    expect(warnings).toEqual([])
  })
})

describe('mapping a whole file page', () => {
  const page = fileFixture.document.children?.[0]
  if (!page) throw new Error('fixture has no page')
  const result = mapFigmaTree({ root: page })

  it('maps the page and everything under it', () => {
    expect(result.elements).toHaveLength(3)
    expect(result.elements[0].tag).toBe('canvas')
  })

  it('falls back to the extent of the mapped layers for the viewport size', () => {
    expect(result.size).toEqual({ width: 360, height: 320 })
  })

  it('leaves an untranslated box alone when the page has no box of its own', () => {
    expect(result.elements[1].box).toEqual({ x: -40, y: 20, w: 400, h: 300 })
  })
})

describe('contract parsing', () => {
  const base = {
    version: 1,
    extractedAt: '2026-02-01T09:30:00.000Z',
    viewports: [{ name: 'figma', width: 1440, height: 720 }],
    byViewport: { figma: { elements: [] } },
  }

  it('still accepts a contract written before Figma existed', () => {
    const contract = parseContract({ ...base, source: { value: 'https://reference.example' } })
    expect(contract.source.type).toBe('url')
    expect(contract.figma).toBeUndefined()
  })

  it('accepts a Figma contract with its origin block', () => {
    const contract = parseContract({
      ...base,
      source: { type: 'figma', value: 'https://www.figma.com/design/abc123XYZ890/Site' },
      figma: {
        fileKey: 'abc123XYZ890',
        nodeId: '1:23',
        fileName: 'Marketing site',
        lastModified: '2026-02-01T09:30:00Z',
      },
    })
    expect(contract.source.type).toBe('figma')
    expect(contract.figma?.fileKey).toBe('abc123XYZ890')
    expect(contract.figma?.nodeId).toBe('1:23')
  })
})

describe('the report hint', () => {
  const report = (type: 'url' | 'figma', matched: number): CheckReport =>
    ({
      source: { type, value: 'x' },
      totals: { elements: 7, matched, missing: 7 - matched, checks: 7, passed: 0, failed: 7 },
    }) as CheckReport

  it('says nothing about a url contract', () => {
    expect(figmaMatchHint(report('url', 0))).toBeNull()
  })

  it('names the data-contract attribute when no layer matched', () => {
    expect(figmaMatchHint(report('figma', 0))).toContain('data-contract')
  })

  it('says nothing once at least one layer matched', () => {
    expect(figmaMatchHint(report('figma', 1))).toBeNull()
  })
})

describe('shadow comparison', () => {
  it('accepts the same shadow written in either value order', () => {
    expect(
      compareProperty(
        'box-shadow',
        '0px 4px 12px 0px rgba(0, 0, 0, 0.25)',
        'rgba(0, 0, 0, 0.25) 0px 4px 12px 0px',
      ),
    ).toBeNull()
  })

  it('treats an omitted spread as zero', () => {
    expect(
      compareProperty(
        'box-shadow',
        '0px 4px 12px rgba(0, 0, 0, 0.25)',
        '0px 4px 12px 0px rgba(0, 0, 0, 0.25)',
      ),
    ).toBeNull()
  })

  it('still reports a shadow that is genuinely different', () => {
    expect(
      compareProperty(
        'box-shadow',
        '0px 4px 12px 0px rgb(0, 0, 0)',
        'rgb(0, 0, 0) 0px 8px 12px 0px',
      ),
    ).not.toBeNull()
  })
})

describe('guard rails', () => {
  it('names the environment variable when no token is given', () => {
    const saved = process.env.FIGMA_TOKEN
    process.env.FIGMA_TOKEN = ''
    try {
      expect(() => resolveFigmaToken()).toThrow(/FIGMA_TOKEN/)
    } finally {
      if (saved === undefined) delete process.env.FIGMA_TOKEN
      else process.env.FIGMA_TOKEN = saved
    }
  })

  it('takes an explicit token over the environment', () => {
    expect(resolveFigmaToken('figd_explicit')).toBe('figd_explicit')
  })

  it('refuses a url that is not a Figma file before it touches the network', async () => {
    await expect(extractFromFigma({ url: 'https://example.com' })).rejects.toBeInstanceOf(
      FigmaError,
    )
  })
})

describe('extractFromFigma, with the API answered from a fixture', () => {
  const url = 'https://www.figma.com/design/abc123XYZ890/Marketing-site?node-id=1-23'

  /** Answer every request with one status and one body, and record the calls. */
  const stubFetch = (status: number, body: unknown): { calls: RequestInit[]; urls: string[] } => {
    const calls: RequestInit[] = []
    const urls: string[] = []
    vi.stubGlobal('fetch', async (input: unknown, init?: RequestInit) => {
      urls.push(String(input))
      calls.push(init ?? {})
      return new Response(JSON.stringify(body), {
        status,
        headers: { 'content-type': 'application/json' },
      })
    })
    return { calls, urls }
  }

  it('builds a contract that passes parseContract', async () => {
    const recorded = stubFetch(200, nodesFixture)
    try {
      const contract = await extractFromFigma({ url, token: 'figd_test' })

      expect(recorded.urls[0]).toBe(
        'https://api.figma.com/v1/files/abc123XYZ890/nodes?ids=1%3A23&geometry=paths',
      )
      expect((recorded.calls[0].headers as Record<string, string>)['X-Figma-Token']).toBe(
        'figd_test',
      )

      expect(contract.source).toEqual({ type: 'figma', value: url })
      expect(contract.figma).toEqual({
        fileKey: 'abc123XYZ890',
        nodeId: '1:23',
        fileName: 'Marketing site',
        lastModified: '2026-02-01T09:30:00Z',
      })
      expect(contract.root).toBe('body')
      expect(contract.viewports).toEqual([{ name: 'figma', width: 1440, height: 720 }])
      expect(contract.byViewport.figma.elements).toHaveLength(7)
      expect(contract.screenshots).toEqual({})
      expect(contract.warnings.some((text) => text.includes('Hero/Glow'))).toBe(true)
      expect(() => parseContract(structuredClone(contract))).not.toThrow()
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('says the token cannot read the file on a 403', async () => {
    stubFetch(403, { status: 403, err: 'Not allowed' })
    try {
      await expect(extractFromFigma({ url, token: 'figd_test' })).rejects.toThrow(
        /cannot read the Figma file "abc123XYZ890"/,
      )
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('shows the parsed file key on a 404', async () => {
    stubFetch(404, { status: 404, err: 'Not found' })
    try {
      await expect(extractFromFigma({ url, token: 'figd_test' })).rejects.toThrow(
        /no file with the key "abc123XYZ890"/,
      )
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('tells the user to wait on a 429', async () => {
    stubFetch(429, { status: 429, err: 'Rate limited' })
    try {
      await expect(extractFromFigma({ url, token: 'figd_test' })).rejects.toThrow(/wait a minute/)
    } finally {
      vi.unstubAllGlobals()
    }
  })
})
