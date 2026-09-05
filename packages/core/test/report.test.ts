import { describe, expect, it } from 'vitest'
import { formatCheckReport, formatDiffReport } from '../src/report.js'
import type { CheckReport, Deviation, DiffReport } from '../src/types.js'

/** ANSI control sequence introducer, without an escape literal in the source. */
const CSI = `${String.fromCharCode(27)}[`

const deviation = (index: number, overrides: Partial<Deviation> = {}): Deviation => ({
  selector: `main > section:nth-of-type(${index}) > h2`,
  state: 'base',
  property: 'font-size',
  expected: '16px',
  actual: '20px',
  delta: 4,
  unit: 'px',
  ...overrides,
})

const checkReport = (overrides: Partial<CheckReport> = {}): CheckReport => ({
  version: 1,
  target: 'http://localhost:3000',
  source: { type: 'url', value: 'https://reference.example' },
  viewport: { name: 'desktop', width: 1440, height: 900 },
  checkedAt: '2026-01-01T00:00:00.000Z',
  totals: { elements: 10, matched: 9, missing: 1, checks: 100, passed: 96, failed: 4 },
  passRate: 0.96,
  missing: ['footer > small'],
  deviations: [deviation(1)],
  ok: false,
  ...overrides,
})

const diffReport = (overrides: Partial<DiffReport> = {}): DiffReport => ({
  version: 1,
  target: 'http://localhost:3000',
  viewport: { name: 'desktop', width: 1440, height: 900 },
  checkedAt: '2026-01-01T00:00:00.000Z',
  totalPixels: 1296000,
  differentPixels: 1234,
  differentPercent: 0.095,
  threshold: 0.5,
  ok: true,
  images: {
    reference: '/tmp/reference-desktop.png',
    actual: '/tmp/actual-desktop.png',
    diff: '/tmp/diff-desktop.png',
  },
  ...overrides,
})

describe('formatCheckReport', () => {
  it('leads with a verdict and the two addresses being compared', () => {
    const text = formatCheckReport(checkReport())
    expect(text.split('\n')[0]).toContain('FAILED')
    expect(text).toContain('http://localhost:3000')
    expect(text).toContain('https://reference.example')
    expect(text).toContain('desktop 1440x900')
  })

  it('states the totals and the pass rate as a percentage', () => {
    const text = formatCheckReport(checkReport())
    expect(text).toContain('9 matched, 1 missing of 10')
    expect(text).toContain('96 passed, 4 failed (96% of 100)')
  })

  it('emits no ANSI codes unless colour is asked for', () => {
    expect(formatCheckReport(checkReport())).not.toContain(CSI)
  })

  it('emits ANSI codes when colour is asked for', () => {
    const text = formatCheckReport(checkReport(), { color: true })
    expect(text).toContain(`${CSI}31m`)
    expect(text).toContain(`${CSI}0m`)
  })

  it('keeps the columns aligned across rows of different length', () => {
    const text = formatCheckReport(
      checkReport({
        deviations: [deviation(1), deviation(22), deviation(333)],
        missing: [],
      }),
    )
    const lines = text.split('\n')
    const header = lines.find((line) => line.includes('SELECTOR'))
    const rows = lines.filter((line) => line.includes('font-size'))
    expect(header).toBeDefined()
    expect(rows).toHaveLength(3)
    const column = (header as string).indexOf('PROPERTY')
    for (const row of rows) expect(row.indexOf('font-size')).toBe(column)
  })

  it('shows every column the reader needs to act', () => {
    const text = formatCheckReport(checkReport({ missing: [] }))
    const header = text.split('\n').find((line) => line.includes('SELECTOR')) ?? ''
    expect(header).toContain('PROPERTY')
    expect(header).toContain('EXPECTED')
    expect(header).toContain('ACTUAL')
    expect(header).toContain('DIFF')
    expect(text).toContain('4px')
  })

  it('folds the state into the property column', () => {
    const text = formatCheckReport(
      checkReport({
        missing: [],
        deviations: [deviation(1, { state: 'hover', property: 'color' })],
      }),
    )
    expect(text).toContain('hover.color')
  })

  it('shows twenty rows by default and counts the rest', () => {
    const deviations = Array.from({ length: 25 }, (_, index) => deviation(index))
    const text = formatCheckReport(checkReport({ deviations, missing: [] }))
    expect(text.split('\n').filter((line) => line.includes('font-size'))).toHaveLength(20)
    expect(text).toContain('5 more')
  })

  it('respects a smaller limit', () => {
    const deviations = Array.from({ length: 25 }, (_, index) => deviation(index))
    const text = formatCheckReport(checkReport({ deviations, missing: [] }), { limit: 3 })
    expect(text.split('\n').filter((line) => line.includes('font-size'))).toHaveLength(3)
    expect(text).toContain('22 more')
  })

  it('lists the selectors that are missing from the implementation', () => {
    const text = formatCheckReport(checkReport({ missing: ['footer > small', 'nav > a'] }))
    expect(text).toContain('missing in the implementation (2)')
    expect(text).toContain('footer > small')
  })

  it('shortens a value that would break the table', () => {
    const long = 'x'.repeat(200)
    const text = formatCheckReport(
      checkReport({ missing: [], deviations: [deviation(1, { actual: long })] }),
    )
    expect(text).not.toContain(long)
    expect(text).toContain('...')
  })

  it('says so plainly when everything matched', () => {
    const text = formatCheckReport(
      checkReport({
        ok: true,
        deviations: [],
        missing: [],
        totals: {
          elements: 10,
          matched: 10,
          missing: 0,
          checks: 100,
          passed: 100,
          failed: 0,
        },
        passRate: 1,
      }),
    )
    expect(text).toContain('PASSED')
    expect(text).toContain('Every asserted property matched the contract.')
  })
})

describe('formatDiffReport', () => {
  it('reports the pixel count, the percentage and the threshold', () => {
    const text = formatDiffReport(diffReport())
    expect(text).toContain('PASSED')
    expect(text).toContain('1234 of 1296000')
    expect(text).toContain('0.095%, threshold 0.5%')
  })

  it('names all three images', () => {
    const text = formatDiffReport(diffReport())
    expect(text).toContain('/tmp/reference-desktop.png')
    expect(text).toContain('/tmp/actual-desktop.png')
    expect(text).toContain('/tmp/diff-desktop.png')
  })

  it('points at the diff image when it failed', () => {
    const text = formatDiffReport(diffReport({ ok: false, differentPercent: 12.5 }))
    expect(text).toContain('FAILED')
    expect(text).toContain('12.500%')
    expect(text).toContain('red marks every pixel that does not match')
  })

  it('emits no ANSI codes unless colour is asked for', () => {
    expect(formatDiffReport(diffReport())).not.toContain(CSI)
    expect(formatDiffReport(diffReport(), { color: true })).toContain(`${CSI}32m`)
  })
})
