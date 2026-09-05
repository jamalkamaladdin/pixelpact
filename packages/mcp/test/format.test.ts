import type { Deviation } from '@pixelpact/core'
import { describe, expect, it } from 'vitest'
import { capDeviations, omittedRowsNote } from '../src/format.js'

function makeDeviations(count: number): Deviation[] {
  return Array.from(
    { length: count },
    (_, index): Deviation => ({
      selector: `.item-${index}`,
      state: 'base',
      property: 'color',
      expected: '#000',
      actual: '#111',
      delta: null,
      unit: null,
    }),
  )
}

describe('capDeviations', () => {
  it('keeps every row and reports zero omitted when under the limit', () => {
    const { kept, omitted } = capDeviations(makeDeviations(5), 40)
    expect(kept).toHaveLength(5)
    expect(omitted).toBe(0)
  })

  it('keeps exactly the limit and reports zero omitted at the boundary', () => {
    const { kept, omitted } = capDeviations(makeDeviations(40), 40)
    expect(kept).toHaveLength(40)
    expect(omitted).toBe(0)
  })

  it('caps at the limit and reports how many rows were left out', () => {
    const { kept, omitted } = capDeviations(makeDeviations(103), 40)
    expect(kept).toHaveLength(40)
    expect(omitted).toBe(63)
  })

  it('throws for a negative limit', () => {
    expect(() => capDeviations(makeDeviations(1), -1)).toThrow(RangeError)
  })
})

describe('omittedRowsNote', () => {
  it('uses singular wording for exactly one omitted row', () => {
    expect(omittedRowsNote(1)).toContain('1 more deviation row omitted')
  })

  it('uses plural wording for more than one omitted row', () => {
    expect(omittedRowsNote(63)).toContain('63 more deviation rows omitted')
  })
})
