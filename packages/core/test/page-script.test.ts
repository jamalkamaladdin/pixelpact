import { describe, expect, it } from 'vitest'
import { pageExtractor } from '../src/page-script.js'

/**
 * The walker is serialised with `toString()` and evaluated inside the browser,
 * where nothing from this module exists. These assertions fail the moment a
 * refactor gives it something to reach for.
 */
describe('pageExtractor serialisation', () => {
  const source = pageExtractor.toString()

  it('serialises to a single named function', () => {
    expect(source.startsWith('function pageExtractor')).toBe(true)
  })

  it('takes everything it needs as a parameter', () => {
    expect(pageExtractor.length).toBe(4)
  })

  it('carries no module machinery into the page', () => {
    expect(source).not.toContain('require(')
    expect(source).not.toMatch(/\bimport\s/)
    expect(source).not.toContain('exports.')
  })

  it('needs no compiler emitted helper', () => {
    for (const helper of ['__assign', '__spreadArray', '__awaiter', '__rest', 'tslib']) {
      expect(source).not.toContain(helper)
    }
  })

  it('does not reach for anything declared beside it', () => {
    for (const outside of ['TRACKED_PROPS', 'INTERACTIVE_SELECTOR', 'DEFAULT_VIEWPORTS']) {
      expect(source).not.toContain(outside)
    }
  })
})
