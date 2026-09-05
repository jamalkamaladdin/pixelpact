import { describe, expect, it } from 'vitest'
import {
  buildSideOptions,
  DEFAULT_SIDE_OUT_DIR,
  resolveOnly,
  resolveWidths,
  UsageError,
} from '../src/options.js'

describe('resolveWidths', () => {
  it('returns undefined when nothing was passed', () => {
    expect(resolveWidths(undefined)).toBeUndefined()
  })

  it('parses a single width into a one element list', () => {
    expect(resolveWidths('1440')).toEqual([1440])
  })

  it('parses a comma separated list into several widths', () => {
    expect(resolveWidths('1440,390')).toEqual([1440, 390])
  })

  it('rejects a bad value and names it in the message', () => {
    expect(() => resolveWidths('1440,abc')).toThrow(UsageError)
    expect(() => resolveWidths('1440,abc')).toThrow(/"abc"/)
  })

  it('rejects a non positive width', () => {
    expect(() => resolveWidths('0')).toThrow(UsageError)
    expect(() => resolveWidths('-10')).toThrow(UsageError)
  })
})

describe('resolveOnly', () => {
  it('returns undefined when nothing was passed', () => {
    expect(resolveOnly(undefined)).toBeUndefined()
  })

  it('parses a bare integer as a section index', () => {
    expect(resolveOnly('2')).toBe(2)
  })

  it('keeps a slug as a string', () => {
    expect(resolveOnly('hero-banner')).toBe('hero-banner')
  })
})

describe('buildSideOptions', () => {
  const referenceUrl = 'https://reference.example'
  const targetUrl = 'https://staging.example.com'

  it('defaults --out-dir to .pixelpact/side', () => {
    const { sideOptions } = buildSideOptions(referenceUrl, targetUrl, {})
    expect(sideOptions.outDir).toBe(DEFAULT_SIDE_OUT_DIR)
    expect(sideOptions.outDir).toBe('.pixelpact/side')
  })

  it('keeps a custom --out-dir', () => {
    const { sideOptions } = buildSideOptions(referenceUrl, targetUrl, { outDir: '/tmp/out' })
    expect(sideOptions.outDir).toBe('/tmp/out')
  })

  it('collects repeated --mask occurrences', () => {
    const { sideOptions } = buildSideOptions(referenceUrl, targetUrl, {
      mask: ['.ad', '.tracker'],
    })
    expect(sideOptions.masks).toEqual(['.ad', '.tracker'])
  })

  it('drops the null entry cac produces for an unused --mask', () => {
    const { sideOptions } = buildSideOptions(referenceUrl, targetUrl, { mask: [null] })
    expect(sideOptions.masks).toBeUndefined()
  })

  it('parses --widths onto sideOptions.widths', () => {
    const { sideOptions } = buildSideOptions(referenceUrl, targetUrl, { widths: '1440,390' })
    expect(sideOptions.widths).toEqual([1440, 390])
  })

  it('coerces --threshold to a number', () => {
    const { sideOptions } = buildSideOptions(referenceUrl, targetUrl, { threshold: '1.5' })
    expect(sideOptions.threshold).toBe(1.5)
  })

  it('coerces --column-width to a number', () => {
    const { sideOptions } = buildSideOptions(referenceUrl, targetUrl, { columnWidth: '1200' })
    expect(sideOptions.columnWidth).toBe(1200)
  })

  it('maps --sections to sectionsSelector and --only to only', () => {
    const { sideOptions } = buildSideOptions(referenceUrl, targetUrl, {
      sections: '.page',
      only: 'hero',
    })
    expect(sideOptions.sectionsSelector).toBe('.page')
    expect(sideOptions.only).toBe('hero')
  })

  it('applies --no-freeze and leaves freezeAnimations unset otherwise', () => {
    const withFlag = buildSideOptions(referenceUrl, targetUrl, { freeze: false })
    expect(withFlag.sideOptions.freezeAnimations).toBe(false)

    const without = buildSideOptions(referenceUrl, targetUrl, {})
    expect(without.sideOptions.freezeAnimations).toBeUndefined()
  })

  it('defaults json and quiet to false', () => {
    const { json, quiet } = buildSideOptions(referenceUrl, targetUrl, {})
    expect(json).toBe(false)
    expect(quiet).toBe(false)
  })
})
