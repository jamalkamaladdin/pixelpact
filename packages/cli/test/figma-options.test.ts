import { describe, expect, it } from 'vitest'
import {
  buildFigmaExtractOptions,
  findFigmaIncompatibleFlags,
  findHttpIncompatibleFlags,
  isMalformedFigmaUrl,
  UsageError,
} from '../src/options.js'

describe('findFigmaIncompatibleFlags', () => {
  it('returns an empty array when no browser only flags were passed', () => {
    expect(findFigmaIncompatibleFlags({})).toEqual([])
  })

  it('names every browser only flag that was passed, in a stable order', () => {
    const flags = { headful: true, wait: '500', viewport: ['desktop'] }
    expect(findFigmaIncompatibleFlags(flags)).toEqual(['--headful', '--viewport', '--wait'])
  })

  it('does not flag --mask, --locale, --timezone or --max-elements, which still apply', () => {
    const flags = { mask: ['.ad'], locale: 'en-US', timezone: 'UTC', maxElements: 10 }
    expect(findFigmaIncompatibleFlags(flags)).toEqual([])
  })

  it('ignores the true cac defaults for --no-stealth, --no-dismiss, --no-freeze and --no-full-page', () => {
    // cac gives these a default of `true` whether or not the user typed anything, since
    // they only exist on the command line as a negation.
    const flags = { stealth: true, dismiss: true, freeze: true, fullPage: true }
    expect(findFigmaIncompatibleFlags(flags)).toEqual([])
  })

  it('flags an explicit --no-stealth, --no-dismiss, --no-freeze or --no-full-page', () => {
    const flags = { stealth: false, dismiss: false, freeze: false, fullPage: false }
    expect(findFigmaIncompatibleFlags(flags)).toEqual([
      '--stealth',
      '--dismiss',
      '--freeze',
      '--full-page',
    ])
  })
})

describe('findHttpIncompatibleFlags', () => {
  it('returns an empty array when no Figma only flags were passed', () => {
    expect(findHttpIncompatibleFlags({})).toEqual([])
  })

  it('names every Figma only flag that was passed', () => {
    const flags = { figmaToken: 'x', node: '1:2', scale: 2 }
    expect(findHttpIncompatibleFlags(flags)).toEqual(['--figma-token', '--node', '--scale'])
  })
})

describe('buildFigmaExtractOptions', () => {
  const url = 'https://www.figma.com/design/abc123XYZ/Site'

  it('throws a UsageError naming FIGMA_TOKEN and --figma-token when no token is available', () => {
    expect(() => buildFigmaExtractOptions(url, {}, {})).toThrow(UsageError)
    try {
      buildFigmaExtractOptions(url, {}, {})
      throw new Error('expected buildFigmaExtractOptions to throw')
    } catch (err) {
      expect(err).toBeInstanceOf(UsageError)
      expect((err as Error).message).toContain('FIGMA_TOKEN')
      expect((err as Error).message).toContain('--figma-token')
    }
  })

  it('prefers --figma-token over the environment', () => {
    const { figmaOptions } = buildFigmaExtractOptions(
      url,
      { figmaToken: 'flag-token' },
      { FIGMA_TOKEN: 'env-token' },
    )
    expect(figmaOptions.token).toBe('flag-token')
  })

  it('falls back to FIGMA_TOKEN from the environment when --figma-token is not passed', () => {
    const { figmaOptions } = buildFigmaExtractOptions(url, {}, { FIGMA_TOKEN: 'env-token' })
    expect(figmaOptions.token).toBe('env-token')
  })

  it('maps --node to nodeId', () => {
    const { figmaOptions } = buildFigmaExtractOptions(url, { figmaToken: 't', node: '1:23' }, {})
    expect(figmaOptions.nodeId).toBe('1:23')
  })

  it('coerces --scale to a number', () => {
    const { figmaOptions } = buildFigmaExtractOptions(url, { figmaToken: 't', scale: '2' }, {})
    expect(figmaOptions.scale).toBe(2)
  })

  it('rejects a negative --scale', () => {
    expect(() => buildFigmaExtractOptions(url, { figmaToken: 't', scale: -1 }, {})).toThrow(
      UsageError,
    )
  })

  it('defaults out, json and quiet the same way as buildExtractOptions', () => {
    const { out, json, quiet } = buildFigmaExtractOptions(url, { figmaToken: 't' }, {})
    expect(out).toBe('pixelpact.contract.json')
    expect(json).toBe(false)
    expect(quiet).toBe(false)
  })
})

describe('a figma url with a broken file key', () => {
  it('is reported as malformed instead of being treated as a web page', () => {
    expect(isMalformedFigmaUrl('https://www.figma.com/design/AbC123/Demo?node-id=12-345')).toBe(
      true,
    )
    expect(isMalformedFigmaUrl('https://figma.com/design//Demo')).toBe(true)
  })

  it('leaves a valid figma url and an ordinary url alone', () => {
    expect(isMalformedFigmaUrl('https://www.figma.com/design/aBcDeFgHiJkLmNoPqRsTuV/Demo')).toBe(
      false,
    )
    expect(isMalformedFigmaUrl('https://example.com/page')).toBe(false)
    expect(isMalformedFigmaUrl('not a url at all')).toBe(false)
  })
})
