import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * `pixelpact-core` does not export `isFigmaUrl`, `extractFromFigma` or `FigmaError` yet
 * (only `packages/core/src/figma/url.ts` exists so far, unwired from `index.ts`). This
 * mock adds just those three on top of whatever the real module already exports, so this
 * file tests the CLI's routing and wiring without depending on the rest of core's Figma
 * work being finished, and without any network access or browser launch.
 */
vi.mock('pixelpact-core', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>()
  const PixelpactErrorCtor = actual.PixelpactError as new (message: string, code?: string) => Error
  class FigmaError extends PixelpactErrorCtor {
    constructor(message: string) {
      super(message, 'ERR_FIGMA')
    }
  }
  return {
    ...actual,
    isFigmaUrl: (value: string) => /^https?:\/\/(www\.)?figma\.com\//i.test(value),
    extract: vi.fn(),
    extractFromFigma: vi.fn(),
    writeContract: vi.fn(async () => undefined),
    FigmaError,
  }
})

const { run } = await import('../src/cli.js')
// biome-ignore lint/suspicious/noExplicitAny: pixelpact-core does not yet declare the Figma exports this mock adds.
const core = (await import('pixelpact-core')) as any

function fakeFigmaContract() {
  return {
    version: 1,
    source: { type: 'figma', value: 'https://www.figma.com/design/abc123XYZ/Site' },
    root: 'figma:0:1',
    extractedAt: new Date().toISOString(),
    viewports: [{ name: 'figma', width: 0, height: 0 }],
    masks: [],
    options: {},
    tokens: {},
    keyframes: {},
    screenshots: {},
    byViewport: { figma: { documentHeight: 0, truncated: false, visibleTotal: 1, elements: [] } },
    warnings: [],
  }
}

describe('extract command: Figma routing', () => {
  const originalToken = process.env.FIGMA_TOKEN

  beforeEach(() => {
    vi.clearAllMocks()
    delete process.env.FIGMA_TOKEN
  })

  afterEach(() => {
    if (originalToken === undefined) delete process.env.FIGMA_TOKEN
    else process.env.FIGMA_TOKEN = originalToken
  })

  it('routes a figma.com url to extractFromFigma and not to extract', async () => {
    core.extractFromFigma.mockResolvedValue(fakeFigmaContract())
    const code = await run([
      'node',
      'pixelpact',
      'extract',
      'https://www.figma.com/design/abc123XYZ/Site?node-id=1-23',
      '--figma-token',
      'test-token',
      '--quiet',
    ])
    expect(code).toBe(0)
    expect(core.extractFromFigma).toHaveBeenCalledTimes(1)
    expect(core.extract).not.toHaveBeenCalled()
  })

  it('uses FIGMA_TOKEN from the environment when --figma-token is not passed', async () => {
    process.env.FIGMA_TOKEN = 'env-token'
    core.extractFromFigma.mockResolvedValue(fakeFigmaContract())
    const code = await run([
      'node',
      'pixelpact',
      'extract',
      'https://www.figma.com/design/abc123XYZ/Site',
      '--quiet',
    ])
    expect(code).toBe(0)
    expect(core.extractFromFigma).toHaveBeenCalledWith(
      expect.objectContaining({ token: 'env-token' }),
    )
  })

  it('fails with exit code 2 when no Figma token is available anywhere', async () => {
    const code = await run([
      'node',
      'pixelpact',
      'extract',
      'https://www.figma.com/design/abc123XYZ/Site',
    ])
    expect(code).toBe(2)
    expect(core.extractFromFigma).not.toHaveBeenCalled()
  })

  it('fails with exit code 2 when a browser only flag is passed with a Figma source', async () => {
    const code = await run([
      'node',
      'pixelpact',
      'extract',
      'https://www.figma.com/design/abc123XYZ/Site',
      '--figma-token',
      'test-token',
      '--headful',
    ])
    expect(code).toBe(2)
    expect(core.extractFromFigma).not.toHaveBeenCalled()
  })

  it('fails with exit code 2 when a Figma only flag is passed with an http source', async () => {
    const code = await run([
      'node',
      'pixelpact',
      'extract',
      'https://example.com',
      '--node',
      '1:23',
    ])
    expect(code).toBe(2)
    expect(core.extract).not.toHaveBeenCalled()
  })
})
