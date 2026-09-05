import type { Deviation } from '@pixelpact/core'

export interface CappedDeviations {
  kept: Deviation[]
  omitted: number
}

/**
 * Slices a deviation list down to `limit` rows so a large check run cannot flood
 * an agent's context window, and reports how many rows were left out.
 */
export function capDeviations(deviations: Deviation[], limit: number): CappedDeviations {
  if (limit < 0) {
    throw new RangeError('limit must be a non-negative number')
  }
  if (deviations.length <= limit) {
    return { kept: deviations, omitted: 0 }
  }
  return { kept: deviations.slice(0, limit), omitted: deviations.length - limit }
}

export function omittedRowsNote(omitted: number): string {
  const rows = omitted === 1 ? 'row' : 'rows'
  return `... ${omitted} more deviation ${rows} omitted, read the full contract check for details.`
}
