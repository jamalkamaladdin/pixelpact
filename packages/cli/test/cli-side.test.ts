import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * `pixelpact-core` does not export `side` or `formatSideReport` yet (the core side of this
 * feature is being written in parallel). This mock adds just those two on top of whatever
 * the real module already exports, so this file tests the CLI's wiring and exit code mapping
 * without depending on the rest of core's side work being finished, and without any network
 * access or browser launch.
 */
vi.mock('pixelpact-core', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>()
  return {
    ...actual,
    side: vi.fn(),
    formatSideReport: vi.fn(() => 'formatted-side-report'),
  }
})

const { run } = await import('../src/cli.js')
// biome-ignore lint/suspicious/noExplicitAny: pixelpact-core does not yet declare the side exports this mock adds.
const core = (await import('pixelpact-core')) as any

function fakeSideReport(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    version: 1,
    reference: 'https://reference.example',
    target: 'https://staging.example.com',
    checkedAt: new Date().toISOString(),
    widths: [1440, 390],
    threshold: 0.5,
    sections: [],
    unmatched: { reference: 0, target: 0 },
    totals: { sections: 0, passed: 0, failed: 0 },
    ok: true,
    warnings: [],
    ...overrides,
  }
}

describe('side command', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('exits 0 and prints the formatted report when every section is inside the budget', async () => {
    core.side.mockResolvedValue(fakeSideReport({ ok: true }))
    const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)

    const code = await run([
      'node',
      'pixelpact',
      'side',
      'https://reference.example',
      'https://staging.example.com',
      '--quiet',
    ])

    expect(code).toBe(0)
    expect(core.side).toHaveBeenCalledTimes(1)
    expect(core.formatSideReport).toHaveBeenCalledWith(
      expect.objectContaining({ ok: true }),
      expect.anything(),
    )
    expect(
      writeSpy.mock.calls.some((call) => String(call[0]).includes('formatted-side-report')),
    ).toBe(true)
    writeSpy.mockRestore()
  })

  it('exits 1 and names the output directory when a section fails', async () => {
    core.side.mockResolvedValue(fakeSideReport({ ok: false }))
    const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)

    const code = await run([
      'node',
      'pixelpact',
      'side',
      'https://reference.example',
      'https://staging.example.com',
      '--out-dir',
      '/tmp/side-out',
      '--quiet',
    ])

    expect(code).toBe(1)
    expect(writeSpy.mock.calls.some((call) => String(call[0]).includes('/tmp/side-out'))).toBe(true)
    writeSpy.mockRestore()
  })

  it('prints only the raw report in --json mode, with no directory line', async () => {
    core.side.mockResolvedValue(fakeSideReport({ ok: false }))
    const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)

    const code = await run([
      'node',
      'pixelpact',
      'side',
      'https://reference.example',
      'https://staging.example.com',
      '--json',
      '--quiet',
    ])

    expect(code).toBe(1)
    expect(core.formatSideReport).not.toHaveBeenCalled()
    expect(writeSpy.mock.calls.some((call) => String(call[0]).includes('Images written to'))).toBe(
      false,
    )
    writeSpy.mockRestore()
  })

  it('passes widths, threshold and out-dir through to side()', async () => {
    core.side.mockResolvedValue(fakeSideReport({ ok: true }))

    await run([
      'node',
      'pixelpact',
      'side',
      'https://reference.example',
      'https://staging.example.com',
      '--widths',
      '1440,390',
      '--threshold',
      '1.5',
      '--out-dir',
      '/tmp/side-out',
      '--quiet',
    ])

    expect(core.side).toHaveBeenCalledWith(
      expect.objectContaining({
        referenceUrl: 'https://reference.example',
        targetUrl: 'https://staging.example.com',
        widths: [1440, 390],
        threshold: 1.5,
        outDir: '/tmp/side-out',
      }),
    )
  })

  it('rejects a malformed --widths value with exit code 2', async () => {
    const code = await run([
      'node',
      'pixelpact',
      'side',
      'https://reference.example',
      'https://staging.example.com',
      '--widths',
      '1440,abc',
    ])

    expect(code).toBe(2)
    expect(core.side).not.toHaveBeenCalled()
  })
})
