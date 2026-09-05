import { describe, expect, it } from 'vitest'
import {
  buildMatchIndex,
  colorDistance,
  compareBox,
  compareProperty,
  compareStyles,
  findMatch,
  isLooping,
  parseColor,
} from '../src/compare.js'
import type { ContractElement } from '../src/types.js'

const element = (overrides: Partial<ContractElement>): ContractElement => ({
  selector: 'body > div',
  tag: 'div',
  contractId: null,
  classes: [],
  text: '',
  box: { x: 0, y: 0, w: 100, h: 40 },
  styles: {},
  interactive: false,
  ...overrides,
})

describe('parseColor', () => {
  it('reads the comma form a browser computes', () => {
    expect(parseColor('rgb(18, 52, 86)')).toEqual({ r: 18, g: 52, b: 86, a: 1 })
  })

  it('reads the slash form with alpha', () => {
    expect(parseColor('rgb(255 0 0 / 0.5)')).toEqual({ r: 255, g: 0, b: 0, a: 0.5 })
  })

  it('returns null for anything that is not an rgb colour', () => {
    expect(parseColor('none')).toBeNull()
    expect(parseColor('linear-gradient(red, blue)')).toBeNull()
  })
})

describe('colorDistance', () => {
  it('is zero for the same colour', () => {
    expect(colorDistance('rgb(10, 20, 30)', 'rgb(10, 20, 30)')).toBe(0)
  })

  it('stays under the visible threshold for a one step difference', () => {
    expect(colorDistance('rgb(0, 0, 0)', 'rgb(1, 1, 1)')).toBeLessThan(2)
  })

  it('is large for black against white', () => {
    expect(colorDistance('rgb(0, 0, 0)', 'rgb(255, 255, 255)')).toBeGreaterThan(100)
  })

  it('treats a change in alpha as a full mismatch', () => {
    expect(colorDistance('rgba(0, 0, 0, 1)', 'rgba(0, 0, 0, 0.5)')).toBe(99)
  })

  it('falls back to string equality when neither value parses', () => {
    expect(colorDistance('none', 'none')).toBe(0)
    expect(colorDistance('none', 'currentcolor')).toBe(99)
  })
})

describe('compareProperty', () => {
  it('accepts a length inside the tolerance', () => {
    expect(compareProperty('font-size', '16px', '16.5px', 1)).toBeNull()
  })

  it('reports a length outside the tolerance with its delta in px', () => {
    const deviation = compareProperty('font-size', '16px', '20px', 1)
    expect(deviation).toMatchObject({ property: 'font-size', delta: 4, unit: 'px' })
  })

  it('honours a wider tolerance', () => {
    expect(compareProperty('padding-top', '20px', '23px', 4)).toBeNull()
    expect(compareProperty('padding-top', '20px', '23px', 1)?.delta).toBe(3)
  })

  it('accepts a colour that is too close to see', () => {
    expect(compareProperty('color', 'rgb(0, 0, 0)', 'rgb(1, 1, 1)', 1)).toBeNull()
  })

  it('reports a visible colour difference in colour units', () => {
    const deviation = compareProperty('background-color', 'rgb(0, 0, 0)', 'rgb(0, 0, 10)', 1)
    expect(deviation?.unit).toBe('color')
    expect(deviation?.delta).toBeGreaterThan(2)
  })

  it('ignores width and height, which the bounding box already covers', () => {
    expect(compareProperty('width', '100px', '400px', 1)).toBeNull()
    expect(compareProperty('height', '100px', '400px', 1)).toBeNull()
  })

  it('accepts a font stack whose winning family is the same', () => {
    expect(compareProperty('font-family', '"Inter", sans-serif', 'Inter, Arial', 1)).toBeNull()
  })

  it('reports a font stack that resolves to a different family', () => {
    expect(compareProperty('font-family', 'Inter, sans-serif', 'Georgia, serif', 1)).not.toBeNull()
  })

  it('ignores whitespace in transitions and animations', () => {
    expect(compareProperty('transition-duration', '0.3s,  0.3s', '0.3s, 0.3s', 1)).toBeNull()
    expect(compareProperty('animation-name', 'spin', 'none', 1)).not.toBeNull()
  })

  it('falls back to exact comparison for everything else', () => {
    expect(compareProperty('display', 'flex', 'flex', 1)).toBeNull()
    expect(compareProperty('display', 'flex', 'block', 1)).toMatchObject({
      expected: 'flex',
      actual: 'block',
      delta: null,
      unit: null,
    })
  })
})

describe('compareStyles', () => {
  it('skips properties the implementation did not report', () => {
    expect(compareStyles({ color: 'rgb(0, 0, 0)' }, {})).toEqual([])
  })

  it('collects every property that differs', () => {
    const deviations = compareStyles(
      { color: 'rgb(0, 0, 0)', display: 'flex', 'font-size': '16px' },
      { color: 'rgb(255, 0, 0)', display: 'block', 'font-size': '16px' },
    )
    expect(deviations.map((deviation) => deviation.property)).toEqual(['color', 'display'])
  })
})

describe('compareBox', () => {
  it('lets a large element drift by one percent', () => {
    expect(compareBox({ w: 1000, h: 400 }, { w: 1005, h: 400 }, 1)).toEqual([])
  })

  it('reports a small element that is three pixels wide of the contract', () => {
    const deviations = compareBox({ w: 24, h: 24 }, { w: 27, h: 24 }, 1)
    expect(deviations).toHaveLength(1)
    expect(deviations[0]).toMatchObject({ property: 'box.width', delta: 3, unit: 'px' })
  })

  it('reports both dimensions when both are wrong', () => {
    expect(compareBox({ w: 24, h: 24 }, { w: 40, h: 40 }, 1)).toHaveLength(2)
  })
})

describe('findMatch', () => {
  const implementation = [
    element({ selector: 'main > h1', tag: 'h1', text: 'Pricing', contractId: 'title' }),
    element({ selector: 'main > p', tag: 'p', text: 'Simple pricing' }),
  ]
  const index = buildMatchIndex(implementation)

  it('prefers an explicit contract id', () => {
    const target = element({ selector: 'nothing > like > it', tag: 'h1', contractId: 'title' })
    expect(findMatch(target, index)).toMatchObject({ matchedBy: 'contract-id' })
  })

  it('falls back to an identical selector', () => {
    const target = element({ selector: 'main > p', tag: 'p', text: 'other text' })
    expect(findMatch(target, index)).toMatchObject({ matchedBy: 'selector' })
  })

  it('falls back to the same tag carrying the same text', () => {
    const target = element({ selector: 'article > section > h1', tag: 'h1', text: 'Pricing' })
    const match = findMatch(target, index)
    expect(match.matchedBy).toBe('text')
    expect(match.element?.selector).toBe('main > h1')
  })

  it('reports no match when nothing answers', () => {
    const target = element({ selector: 'footer > small', tag: 'small', text: 'Legal' })
    expect(findMatch(target, index)).toEqual({ element: null, matchedBy: 'none' })
  })
})

describe('isLooping', () => {
  it('is true only for an animation that never stops', () => {
    const spinner = element({
      styles: { 'animation-name': 'spin', 'animation-iteration-count': 'infinite' },
    })
    const once = element({
      styles: { 'animation-name': 'spin', 'animation-iteration-count': '1' },
    })
    expect(isLooping(spinner)).toBe(true)
    expect(isLooping(once)).toBe(false)
    expect(isLooping(undefined)).toBe(false)
  })
})
