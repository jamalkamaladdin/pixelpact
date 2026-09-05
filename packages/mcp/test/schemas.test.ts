import { describe, expect, it } from 'vitest'
import {
  checkImplementationInputSchema,
  diffPixelsInputSchema,
  extractContractInputSchema,
  readContractSummaryInputSchema,
} from '../src/schemas.js'

describe('extractContractInputSchema', () => {
  it('accepts the minimal required payload', () => {
    const result = extractContractInputSchema.safeParse({
      url: 'https://example.com',
      outputPath: './contracts/home.json',
    })
    expect(result.success).toBe(true)
  })

  it('accepts a fully populated payload', () => {
    const result = extractContractInputSchema.safeParse({
      url: 'https://example.com',
      outputPath: './contracts/home.json',
      selector: '#app',
      viewports: [{ name: 'desktop', width: 1440, height: 900 }],
      maxElements: 0,
      masks: ['.ad-banner'],
      screenshotDir: './contracts/shots',
    })
    expect(result.success).toBe(true)
  })

  it('rejects a payload missing the required url', () => {
    const result = extractContractInputSchema.safeParse({ outputPath: './contracts/home.json' })
    expect(result.success).toBe(false)
  })

  it('rejects a payload with the wrong type for maxElements', () => {
    const result = extractContractInputSchema.safeParse({
      url: 'https://example.com',
      outputPath: './contracts/home.json',
      maxElements: 'all',
    })
    expect(result.success).toBe(false)
  })
})

describe('checkImplementationInputSchema', () => {
  it('accepts the minimal required payload', () => {
    const result = checkImplementationInputSchema.safeParse({
      contractPath: './contracts/home.json',
      url: 'https://staging.example.com',
    })
    expect(result.success).toBe(true)
  })

  it('rejects a payload missing contractPath', () => {
    const result = checkImplementationInputSchema.safeParse({ url: 'https://staging.example.com' })
    expect(result.success).toBe(false)
  })
})

describe('diffPixelsInputSchema', () => {
  it('accepts a threshold within range', () => {
    const result = diffPixelsInputSchema.safeParse({
      contractPath: './contracts/home.json',
      url: 'https://staging.example.com',
      threshold: 1.5,
    })
    expect(result.success).toBe(true)
  })

  it('rejects a threshold above 100', () => {
    const result = diffPixelsInputSchema.safeParse({
      contractPath: './contracts/home.json',
      url: 'https://staging.example.com',
      threshold: 150,
    })
    expect(result.success).toBe(false)
  })
})

describe('readContractSummaryInputSchema', () => {
  it('accepts a valid contract path', () => {
    const result = readContractSummaryInputSchema.safeParse({
      contractPath: './contracts/home.json',
    })
    expect(result.success).toBe(true)
  })

  it('rejects an empty payload', () => {
    const result = readContractSummaryInputSchema.safeParse({})
    expect(result.success).toBe(false)
  })
})
