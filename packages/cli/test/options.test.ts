import { describe, expect, it } from 'vitest'
import {
  buildCheckOptions,
  buildDiffOptions,
  buildExtractOptions,
  parseViewportToken,
  resolveViewports,
  toStringArray,
  UsageError,
} from '../src/options.js'

describe('resolveViewports', () => {
  it('returns undefined when nothing was passed', () => {
    expect(resolveViewports(undefined)).toBeUndefined()
  })

  it('resolves known viewport names from the defaults', () => {
    expect(resolveViewports(['desktop'])).toEqual([{ name: 'desktop', width: 1440, height: 900 }])
  })

  it('splits a comma separated occurrence into several viewports', () => {
    expect(resolveViewports(['desktop,mobile'])).toEqual([
      { name: 'desktop', width: 1440, height: 900 },
      { name: 'mobile', width: 390, height: 844 },
    ])
  })

  it('parses a WIDTHxHEIGHT pair into an ad hoc viewport', () => {
    expect(parseViewportToken('1280x720')).toEqual({ name: '1280x720', width: 1280, height: 720 })
  })

  it('accumulates repeated --viewport occurrences', () => {
    expect(resolveViewports(['desktop', '1280x720'])).toEqual([
      { name: 'desktop', width: 1440, height: 900 },
      { name: '1280x720', width: 1280, height: 720 },
    ])
  })

  it('rejects an unknown viewport name', () => {
    expect(() => parseViewportToken('does-not-exist')).toThrow(UsageError)
  })
})

describe('toStringArray', () => {
  it('wraps a single value in an array', () => {
    expect(toStringArray('.cookie-banner')).toEqual(['.cookie-banner'])
  })

  it('passes an existing array through untouched', () => {
    expect(toStringArray(['.a', '.b'])).toEqual(['.a', '.b'])
  })

  it('leaves undefined as undefined', () => {
    expect(toStringArray(undefined)).toBeUndefined()
  })
})

describe('buildExtractOptions', () => {
  it('collects repeated --mask occurrences', () => {
    const { extractOptions } = buildExtractOptions('https://example.com', {
      mask: ['.ad', '.tracker'],
    })
    expect(extractOptions.masks).toEqual(['.ad', '.tracker'])
  })

  it('applies the --no-stealth, --no-dismiss, --no-freeze and --no-full-page negations', () => {
    const { extractOptions } = buildExtractOptions('https://example.com', {
      stealth: false,
      dismiss: false,
      freeze: false,
      fullPage: false,
    })
    expect(extractOptions.stealth).toBe(false)
    expect(extractOptions.dismissOverlays).toBe(false)
    expect(extractOptions.freezeAnimations).toBe(false)
    expect(extractOptions.fullPage).toBe(false)
  })

  it('leaves booleans unset when the flag was not passed, so core applies its own default', () => {
    const { extractOptions } = buildExtractOptions('https://example.com', {})
    expect(extractOptions.stealth).toBeUndefined()
    expect(extractOptions.dismissOverlays).toBeUndefined()
    expect(extractOptions.freezeAnimations).toBeUndefined()
    expect(extractOptions.fullPage).toBeUndefined()
  })

  it('turns --headful into headless: false', () => {
    const { extractOptions } = buildExtractOptions('https://example.com', { headful: true })
    expect(extractOptions.headless).toBe(false)
  })

  it('defaults --out to pixelpact.contract.json', () => {
    const { out } = buildExtractOptions('https://example.com', {})
    expect(out).toBe('pixelpact.contract.json')
  })

  it('rejects a negative --max-elements', () => {
    expect(() => buildExtractOptions('https://example.com', { maxElements: -1 })).toThrow(
      UsageError,
    )
  })
})

describe('buildCheckOptions', () => {
  it('passes the viewport name straight through without parsing it', () => {
    const { checkOptions } = buildCheckOptions('https://example.com', { viewport: 'desktop' })
    expect(checkOptions.viewport).toBe('desktop')
  })

  it('coerces --tolerance to a number', () => {
    const { checkOptions } = buildCheckOptions('https://example.com', { tolerance: '2' })
    expect(checkOptions.tolerance).toBe(2)
  })

  it('keeps the --out path for the report file', () => {
    const { out } = buildCheckOptions('https://example.com', { out: 'report.json' })
    expect(out).toBe('report.json')
  })
})

describe('buildDiffOptions', () => {
  it('collects repeated --mask occurrences', () => {
    const { diffOptions } = buildDiffOptions('https://example.com', { mask: ['.ad'] })
    expect(diffOptions.masks).toEqual(['.ad'])
  })

  it('coerces --threshold to a number', () => {
    const { diffOptions } = buildDiffOptions('https://example.com', { threshold: '1.5' })
    expect(diffOptions.threshold).toBe(1.5)
  })

  it('maps --out-dir to outDir', () => {
    const { diffOptions } = buildDiffOptions('https://example.com', { outDir: '/tmp/diffs' })
    expect(diffOptions.outDir).toBe('/tmp/diffs')
  })
})

describe('repeatable flags that were never passed', () => {
  it('drops the null entry cac produces for an unused list flag', () => {
    expect(toStringArray([null])).toBeUndefined()
    expect(toStringArray([])).toBeUndefined()
    expect(toStringArray(undefined)).toBeUndefined()
    expect(toStringArray('.ad')).toEqual(['.ad'])
    expect(toStringArray(['.ad', null, '.tracker'])).toEqual(['.ad', '.tracker'])
  })

  it('does not turn an unused --viewport into a parse attempt', () => {
    expect(resolveViewports([null])).toBeUndefined()
    expect(resolveViewports([])).toBeUndefined()
  })

  it('leaves masks and viewports unset when the flags were never passed', () => {
    const { extractOptions } = buildExtractOptions('https://example.com', {
      mask: [null],
      viewport: [null],
    })
    expect(extractOptions.masks).toBeUndefined()
    expect(extractOptions.viewports).toBeUndefined()
  })

  it('leaves diff masks unset when --mask was never passed', () => {
    const { diffOptions } = buildDiffOptions('https://example.com', { mask: [null] })
    expect(diffOptions.masks).toBeUndefined()
  })
})
