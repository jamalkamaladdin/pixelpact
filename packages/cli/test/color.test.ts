import { describe, expect, it } from 'vitest'
import { shouldUseColor } from '../src/color.js'

describe('shouldUseColor', () => {
  it('is off when stdout is not a TTY and nothing else is set', () => {
    expect(shouldUseColor({ isTTY: false })).toBe(false)
  })

  it('is on when stdout is a TTY and nothing else is set', () => {
    expect(shouldUseColor({ isTTY: true })).toBe(true)
  })

  it('NO_COLOR turns colour off even on a TTY', () => {
    expect(shouldUseColor({ isTTY: true, noColor: '1' })).toBe(false)
  })

  it('NO_COLOR turns colour off even when set to an empty-ish value', () => {
    expect(shouldUseColor({ isTTY: true, noColor: '' })).toBe(false)
  })

  it('FORCE_COLOR turns colour on even without a TTY', () => {
    expect(shouldUseColor({ isTTY: false, forceColor: '1' })).toBe(true)
  })

  it('FORCE_COLOR=0 turns colour off even on a TTY', () => {
    expect(shouldUseColor({ isTTY: true, forceColor: '0' })).toBe(false)
  })

  it('FORCE_COLOR wins over NO_COLOR', () => {
    expect(shouldUseColor({ isTTY: false, noColor: '1', forceColor: '1' })).toBe(true)
  })
})
