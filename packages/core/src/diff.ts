import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import pixelmatch from 'pixelmatch'
import { PNG } from 'pngjs'
import {
  captureFullPage,
  closeQuietly,
  freezeAnimations,
  launchBrowser,
  openPage,
  paintAll,
  type ShotOptions,
} from './browser.js'
import { inheritedRenderingOptions, selectViewport } from './contract.js'
import { resolveDiffOptions } from './defaults.js'
import { ContractError, TargetNotFoundError } from './errors.js'
import type { Contract, DiffOptions, DiffReport } from './types.js'
import { CONTRACT_VERSION } from './types.js'

/**
 * Pad an image onto a larger canvas so two shots of different size can be
 * compared pixel by pixel.
 *
 * The padding is white, so a page that is shorter than the reference shows up
 * as a real difference instead of quietly matching.
 */
export function resizeCanvas(png: PNG, width: number, height: number): PNG {
  if (png.width === width && png.height === height) return png
  const out = new PNG({ width, height })
  out.data.fill(255)
  PNG.bitblt(png, out, 0, 0, Math.min(png.width, width), Math.min(png.height, height), 0, 0)
  return out
}

async function readReference(contract: Contract, viewportName: string): Promise<PNG> {
  const path = contract.screenshots[viewportName]
  if (!path) {
    throw new ContractError(
      'The contract has no reference screenshot for viewport "' +
        viewportName +
        '". Re-extract with a screenshot directory: ' +
        'extract({ url, screenshotDir: "./pixelpact" }).',
    )
  }
  try {
    return PNG.sync.read(await readFile(path))
  } catch (error) {
    throw new ContractError(
      'The reference screenshot for viewport "' +
        viewportName +
        '" could not be read from "' +
        path +
        '": ' +
        (error instanceof Error ? error.message : String(error)) +
        '. Re-extract with a screenshot directory to recreate it.',
      { cause: error },
    )
  }
}

/**
 * Compare the implementation against the reference screenshot, pixel by pixel.
 *
 * The two images are padded onto a common canvas, differing pixels are counted
 * and written to a diff image in red. A selector declared by the contract has
 * to match on the implementation as well: screenshotting the whole page and
 * comparing it against a shot of one section produces a number that measures
 * nothing, so it fails instead.
 *
 * @throws ContractError when the contract carries no readable reference screenshot
 * @throws TargetNotFoundError when the implementation does not load, or the selector matches nothing
 * @throws BrowserUnavailableError when playwright or a browser binary is missing
 *
 * @example
 * ```ts
 * const report = await diff(contract, { url: 'http://localhost:3000', threshold: 0.2 })
 * process.stdout.write(formatDiffReport(report))
 * ```
 */
export async function diff(contract: Contract, options: DiffOptions): Promise<DiffReport> {
  const resolved = resolveDiffOptions({
    ...options,
    ...inheritedRenderingOptions(contract, options),
  })
  const viewport = selectViewport(contract, resolved.viewport)
  const reference = await readReference(contract, viewport.name)

  const selector = resolved.selector ?? (contract.root !== 'body' ? contract.root : null)
  const masks = [...new Set([...contract.masks, ...resolved.masks])]
  const onProgress = options.onProgress

  await mkdir(resolved.outDir, { recursive: true })
  const actualPath = join(resolved.outDir, `actual-${viewport.name}.png`)
  const diffPath = join(resolved.outDir, `diff-${viewport.name}.png`)

  if (onProgress) onProgress({ phase: 'launch', message: 'starting the browser' })
  const browser = await launchBrowser(resolved)

  try {
    if (onProgress) {
      onProgress({ phase: 'navigate', message: `opening ${resolved.url}`, viewport: viewport.name })
    }
    const session = await openPage(browser, viewport, resolved.url, resolved)
    try {
      if (contract.options.freezeAnimations) await freezeAnimations(session.page)
      await paintAll(session.page)

      if (onProgress) {
        onProgress({
          phase: 'screenshot',
          message: 'capturing the implementation',
          viewport: viewport.name,
        })
      }

      const shot: ShotOptions = { path: actualPath }
      if (masks.length > 0) {
        shot.mask = masks.map((mask) => session.page.locator(mask))
        shot.maskColor = '#FF00FF'
      }

      if (selector) {
        const element = await session.page.$(selector)
        if (!element) {
          throw new TargetNotFoundError(
            'The contract was taken from "' +
              selector +
              '", but that selector matches nothing at ' +
              resolved.url +
              '. Comparing a full page against a section measures nothing, so no ' +
              'number is reported. Build that part of the page, or pass a selector ' +
              'that exists in the implementation.',
          )
        }
        await element.screenshot(shot)
      } else {
        await captureFullPage(session.page, shot)
      }
    } finally {
      await closeQuietly(session.context)
    }
  } finally {
    await closeQuietly(browser)
  }

  if (onProgress) {
    onProgress({ phase: 'compare', message: 'comparing pixels', viewport: viewport.name })
  }

  const actual = PNG.sync.read(await readFile(actualPath))
  const width = Math.max(reference.width, actual.width)
  const height = Math.max(reference.height, actual.height)
  const left = resizeCanvas(reference, width, height)
  const right = resizeCanvas(actual, width, height)

  const output = new PNG({ width, height })
  const differentPixels = pixelmatch(left.data, right.data, output.data, width, height, {
    threshold: 0.1,
    includeAA: false,
    alpha: 0.3,
    diffColor: [255, 0, 0],
  })
  await writeFile(diffPath, PNG.sync.write(output))

  const totalPixels = width * height
  const differentPercent = totalPixels > 0 ? (differentPixels / totalPixels) * 100 : 0

  if (onProgress) onProgress({ phase: 'done', message: 'diff complete' })

  return {
    version: CONTRACT_VERSION,
    target: resolved.url,
    viewport,
    checkedAt: new Date().toISOString(),
    totalPixels,
    differentPixels,
    differentPercent: Math.round(differentPercent * 1000) / 1000,
    threshold: resolved.threshold,
    ok: differentPercent <= resolved.threshold,
    images: {
      reference: contract.screenshots[viewport.name],
      actual: actualPath,
      diff: diffPath,
    },
  }
}
