import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import type { ElementHandle, Page } from 'playwright'
import {
  captureFullPage,
  closeQuietly,
  freezeAnimations,
  launchBrowser,
  looksBlocked,
  openPage,
  paintAll,
  type ShotOptions,
} from './browser.js'
import {
  DEFAULT_VIEWPORTS,
  INTERACTIVE_SELECTOR,
  resolveExtractOptions,
  TRACKED_PROPS,
} from './defaults.js'
import { BlockedPageError, TargetNotFoundError } from './errors.js'
import { pageExtractor } from './page-script.js'
import type {
  Contract,
  ContractElement,
  ElementStates,
  ExtractOptions,
  KeyframeStep,
  PageExtractionResult,
  ProgressEvent,
  StyleMap,
  Viewport,
  ViewportSnapshot,
} from './types.js'
import { CONTRACT_VERSION } from './types.js'

type Progress = (event: ProgressEvent) => void

const report = (onProgress: Progress | undefined, event: ProgressEvent): void => {
  if (onProgress) onProgress(event)
}

/**
 * Run the DOM walker inside the page.
 *
 * The walker is sent as an expression rather than injected with a script tag:
 * a site with a strict `script-src` policy refuses an injected tag, while an
 * expression evaluated through the browser protocol is not subject to the
 * page's content security policy.
 */
export async function runPageExtraction(
  page: Page,
  params: { maxElements: number; selector: string | null },
): Promise<PageExtractionResult> {
  const expression =
    '(' +
    pageExtractor.toString() +
    ')(' +
    JSON.stringify(TRACKED_PROPS) +
    ', ' +
    JSON.stringify(INTERACTIVE_SELECTOR) +
    ', ' +
    JSON.stringify(params.maxElements) +
    ', ' +
    JSON.stringify(params.selector) +
    ')'
  return await page.evaluate<PageExtractionResult>(expression)
}

/** Longest transition on an element, so a hover is read after it has finished. */
const MIN_SETTLE = 180
const MAX_SETTLE = 1200

async function settleTime(handle: ElementHandle<SVGElement | HTMLElement>): Promise<number> {
  const ms = await handle.evaluate((node) => {
    const cs = getComputedStyle(node)
    const parse = (value: string): number[] =>
      String(value)
        .split(',')
        .map((part) => {
          const text = part.trim()
          const number = Number.parseFloat(text)
          if (Number.isNaN(number)) return 0
          return text.endsWith('ms') ? number : number * 1000
        })
    const durations = parse(cs.transitionDuration)
    const delays = parse(cs.transitionDelay)
    let longest = 0
    for (let i = 0; i < durations.length; i++) {
      longest = Math.max(longest, durations[i] + (delays[i] || 0))
    }
    return longest
  })
  // 60ms past the end, so the last frame has been painted.
  return Math.min(MAX_SETTLE, Math.max(MIN_SETTLE, Math.round(ms) + 60))
}

/**
 * Read the hover and focus styles of the interactive elements.
 *
 * `getComputedStyle` cannot see a state that is not active, so each element is
 * actually hovered and focused. The wait after a hover is the element's own
 * transition length rather than a fixed number: a 250ms fade read at 180ms is
 * caught mid flight, and the value that comes back differs in the sixth
 * decimal from run to run, which then reads as a mismatch against a contract
 * that is itself one of those readings.
 *
 * @returns hover and focus deltas keyed by selector, only where something changed
 */
export async function captureStates(
  page: Page,
  elements: ContractElement[],
  limit: number,
  onProgress?: Progress,
  viewport?: string,
): Promise<Record<string, ElementStates>> {
  const targets = elements.filter((element) => element.interactive).slice(0, Math.max(0, limit))
  const states: Record<string, ElementStates> = {}
  let done = 0

  for (const element of targets) {
    done++
    report(onProgress, {
      phase: 'states',
      message: `probing ${element.selector}`,
      viewport,
      current: done,
      total: targets.length,
    })
    try {
      const handle = await page.$(element.selector)
      if (!handle) continue

      await handle.hover({ timeout: 1500 })
      await page.waitForTimeout(await settleTime(handle))
      const hovered = await handle.evaluate((node, props: string[]) => {
        const cs = getComputedStyle(node)
        const out: Record<string, string> = {}
        for (const key of props) out[key] = cs.getPropertyValue(key).trim()
        return out
      }, TRACKED_PROPS)

      const hover: StyleMap = {}
      for (const key of Object.keys(element.styles)) {
        if (element.styles[key] !== hovered[key]) hover[key] = hovered[key]
      }

      // Move the pointer away, otherwise the focus reading still carries hover.
      await page.mouse.move(0, 0)
      await page.waitForTimeout(80)

      const focus: StyleMap = {}
      try {
        await handle.evaluate((node) => node.focus())
        await page.waitForTimeout(120)
        const focused = await handle.evaluate((node, props: string[]) => {
          const cs = getComputedStyle(node)
          const out: Record<string, string> = {}
          for (const key of props) out[key] = cs.getPropertyValue(key).trim()
          out.outline = cs.getPropertyValue('outline').trim()
          return out
        }, TRACKED_PROPS)
        for (const key of Object.keys(element.styles)) {
          if (element.styles[key] !== focused[key]) focus[key] = focused[key]
        }
        if (focused.outline && focused.outline !== 'none') focus.outline = focused.outline
        await handle.evaluate((node) => node.blur())
      } catch {
        // not focusable
      }

      const entry: ElementStates = {}
      if (Object.keys(hover).length > 0) entry.hover = hover
      if (Object.keys(focus).length > 0) entry.focus = focus
      if (entry.hover || entry.focus) states[element.selector] = entry
    } catch {
      // detached, covered by another element, or not hoverable
    }
  }

  return states
}

/** Everything one page visit produces. */
export interface Measurement {
  data: PageExtractionResult
  /** Reasons the page looks like a challenge or an error page. */
  blocked: string[]
}

/**
 * Walk one loaded page and probe its interaction states.
 *
 * @throws TargetNotFoundError when the selector matches nothing
 * @throws BlockedPageError when the page is a challenge and nothing could be measured
 */
export async function measurePage(
  page: Page,
  status: number,
  params: {
    url: string
    selector: string | null
    maxElements: number
    maxStates: number
    viewport?: string
    onProgress?: Progress
  },
): Promise<Measurement> {
  report(params.onProgress, {
    phase: 'extract',
    message: 'reading computed styles',
    viewport: params.viewport,
  })
  const data = await runPageExtraction(page, {
    maxElements: params.maxElements,
    selector: params.selector,
  })

  if (data.error) {
    throw new TargetNotFoundError(
      'The selector "' +
        params.selector +
        '" matched no element on ' +
        params.url +
        '. Check the selector against the live page, or leave it out to measure the whole body.',
    )
  }

  const states = await captureStates(
    page,
    data.elements,
    params.maxStates,
    params.onProgress,
    params.viewport,
  )
  for (const element of data.elements) {
    const found = states[element.selector]
    if (found) {
      if (found.hover) element.hover = found.hover
      if (found.focus) element.focus = found.focus
    }
  }

  const blocked = looksBlocked(data, status, Boolean(params.selector))
  if (blocked.length > 0 && data.elements.length === 0) {
    throw new BlockedPageError(
      'The page at ' +
        params.url +
        ' looks like a bot challenge or an error page (' +
        blocked.join(', ') +
        ') and nothing could be measured. Try a real browser channel, ' +
        'a longer wait, or a headed run: { channel: "chrome", wait: 10000, headless: false }.',
    )
  }

  return { data, blocked }
}

/**
 * Measure a reference page and return a contract describing how it looks.
 *
 * Every viewport is visited in turn: the DOM is walked, hover and focus states
 * are probed, design tokens and keyframes are collected, and a screenshot is
 * taken when `screenshotDir` is set. Problems that do not invalidate the
 * result, such as a page that could not be reached at one viewport or an
 * element budget that ran out, are reported in `warnings` rather than thrown.
 *
 * @throws TargetNotFoundError when no viewport could be loaded, or the selector matches nothing
 * @throws BlockedPageError when the reference page answers with a bot challenge
 * @throws BrowserUnavailableError when playwright or a browser binary is missing
 *
 * @example
 * ```ts
 * const contract = await extract({
 *   url: 'https://example.com',
 *   selector: 'main',
 *   screenshotDir: './pixelpact',
 *   onProgress: (event) => process.stderr.write(event.message + '\n'),
 * })
 * await writeContract('./pixelpact/contract.json', contract)
 * ```
 */
export async function extract(options: ExtractOptions): Promise<Contract> {
  if (!options.url) {
    throw new TargetNotFoundError(
      'extract() needs a url to measure, for example { url: "https://example.com" }.',
    )
  }

  const resolved = resolveExtractOptions(options)
  const viewports: Viewport[] =
    resolved.viewports.length > 0 ? resolved.viewports : DEFAULT_VIEWPORTS
  resolved.viewports = viewports
  const onProgress = options.onProgress

  report(onProgress, { phase: 'launch', message: 'starting the browser' })
  const browser = await launchBrowser(resolved)

  const warnings: string[] = []
  const byViewport: Record<string, ViewportSnapshot> = {}
  const screenshots: Record<string, string> = {}
  let tokens: Record<string, string> = {}
  let keyframes: Record<string, KeyframeStep[]> = {}

  try {
    if (resolved.screenshotDir) await mkdir(resolved.screenshotDir, { recursive: true })

    for (const viewport of viewports) {
      report(onProgress, {
        phase: 'navigate',
        message: `opening ${resolved.url}`,
        viewport: viewport.name,
      })

      const session = await openPage(browser, viewport, resolved.url, resolved).catch(
        (error: unknown) => {
          warnings.push(
            `${viewport.name}: ${error instanceof Error ? error.message : String(error)}`,
          )
          return null
        },
      )
      if (!session) continue

      try {
        const { data, blocked } = await measurePage(session.page, session.status, {
          url: resolved.url,
          selector: resolved.selector,
          maxElements: resolved.maxElements,
          maxStates: resolved.maxStates,
          viewport: viewport.name,
          onProgress,
        })

        if (blocked.length > 0) {
          warnings.push(
            viewport.name +
              ': the page may be a bot challenge (' +
              blocked.join(', ') +
              '), so these measurements may describe the wrong page',
          )
        }
        if (data.truncated) {
          warnings.push(
            viewport.name +
              ': the element budget ran out after ' +
              data.elements.length +
              ' of ' +
              data.visibleTotal +
              ' visible elements, and the rest of the page is not in this contract. ' +
              'Raise maxElements, or narrow the walk with a selector.',
          )
        }

        byViewport[viewport.name] = {
          documentHeight: data.documentHeight,
          truncated: data.truncated,
          visibleTotal: data.visibleTotal,
          elements: data.elements,
        }
        if (Object.keys(tokens).length === 0) tokens = data.tokens
        if (Object.keys(keyframes).length === 0) keyframes = data.keyframes

        if (resolved.screenshotDir) {
          report(onProgress, {
            phase: 'screenshot',
            message: `capturing ${viewport.name}`,
            viewport: viewport.name,
          })
          const path = await captureReference(session.page, viewport, resolved)
          screenshots[viewport.name] = path
        }
      } finally {
        await closeQuietly(session.context)
      }
    }
  } finally {
    await closeQuietly(browser)
  }

  if (Object.keys(byViewport).length === 0) {
    throw new TargetNotFoundError(
      'Nothing could be measured at ' +
        resolved.url +
        '. ' +
        (warnings.length > 0 ? warnings.join(' | ') : 'No viewport was reached.'),
    )
  }

  report(onProgress, { phase: 'done', message: 'contract ready' })

  return {
    version: CONTRACT_VERSION,
    source: { type: 'url', value: resolved.url },
    root: resolved.selector || 'body',
    extractedAt: new Date().toISOString(),
    viewports,
    masks: resolved.masks,
    options: resolved,
    tokens,
    keyframes,
    screenshots,
    byViewport,
    warnings,
  }
}

/** Freeze, repaint and screenshot the reference for one viewport. */
async function captureReference(
  page: Page,
  viewport: Viewport,
  resolved: ReturnType<typeof resolveExtractOptions>,
): Promise<string> {
  if (resolved.freezeAnimations) await freezeAnimations(page)
  // The state probing hovered its way across the page, which loses the painted
  // tiles. Repaint before the shot.
  await paintAll(page)

  const path = join(resolved.screenshotDir ?? '.', `reference-${viewport.name}.png`)
  const shot: ShotOptions = { path }
  if (resolved.masks.length > 0) {
    shot.mask = resolved.masks.map((selector) => page.locator(selector))
    shot.maskColor = '#FF00FF'
  }

  if (resolved.selector) {
    const element = await page.$(resolved.selector)
    if (element) await element.screenshot(shot)
    else await captureFullPage(page, shot)
    return path
  }

  if (resolved.fullPage) await captureFullPage(page, shot)
  else await page.screenshot({ ...shot, fullPage: false })
  return path
}
