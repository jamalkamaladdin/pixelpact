import { describe, expect, it } from 'vitest'
import { mapErrorToToolResult } from '../src/errors.js'

function textOf(result: ReturnType<typeof mapErrorToToolResult>): string {
  return result.content[0]?.text ?? ''
}

describe('mapErrorToToolResult', () => {
  it('marks every mapped result as an error', () => {
    const result = mapErrorToToolResult(new Error('boom'))
    expect(result.isError).toBe(true)
    expect(result.content).toHaveLength(1)
  })

  it('explains a contract error and how to fix it', () => {
    const error = Object.assign(new Error('missing screenshot directory'), { code: 'ERR_CONTRACT' })
    const text = textOf(mapErrorToToolResult(error))
    expect(text).toContain('Contract error')
    expect(text).toContain('missing screenshot directory')
    expect(text).toContain('extract_contract')
  })

  it('explains a browser error and how to fix it', () => {
    const error = Object.assign(new Error('no chromium'), { code: 'ERR_BROWSER' })
    const text = textOf(mapErrorToToolResult(error))
    expect(text).toContain('Browser unavailable')
    expect(text).toContain('playwright install')
  })

  it('explains a blocked page error', () => {
    const error = Object.assign(new Error('captcha detected'), { code: 'ERR_BLOCKED' })
    const text = textOf(mapErrorToToolResult(error))
    expect(text).toContain('blocked automated access')
  })

  it('explains a target not found error', () => {
    const error = Object.assign(new Error('selector did not match'), { code: 'ERR_TARGET' })
    const text = textOf(mapErrorToToolResult(error))
    expect(text).toContain('Target not found')
  })

  it('falls back to a generic message for an unknown code', () => {
    const error = Object.assign(new Error('something odd'), { code: 'ERR_WEIRD' })
    const text = textOf(mapErrorToToolResult(error))
    expect(text).toBe('Unexpected error: something odd')
  })

  it('falls back to a generic message for a plain Error with no code', () => {
    const text = textOf(mapErrorToToolResult(new Error('plain failure')))
    expect(text).toBe('Unexpected error: plain failure')
  })

  it('handles a non-Error thrown value', () => {
    const text = textOf(mapErrorToToolResult('a raw string was thrown'))
    expect(text).toBe('Unexpected error: a raw string was thrown')
  })
})
