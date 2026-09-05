import type {
  Browser,
  BrowserContext,
  BrowserContextOptions,
  LaunchOptions,
  Locator,
  Page,
} from 'playwright'
import type { ResolvedBrowserOptions } from './defaults.js'
import { OVERLAY_ACCEPT_SELECTORS } from './defaults.js'
import { BrowserUnavailableError, TargetNotFoundError } from './errors.js'
import type { PageExtractionResult, Viewport } from './types.js'

const INSTALL_HINT =
  'Install it next to pixelpact and download a browser:\n' +
  '  npm install playwright\n' +
  '  npx playwright install chromium'

/**
 * Load playwright at the moment it is first needed.
 *
 * It is a peer dependency: a project that only reads or formats contracts
 * should not have to download a browser, so the import cannot be static.
 *
 * @throws BrowserUnavailableError when playwright is not installed
 */
export async function loadPlaywright(): Promise<typeof import('playwright')> {
  try {
    return await import('playwright')
  } catch (error) {
    throw new BrowserUnavailableError(
      'pixelpact needs "playwright" to open a browser, but it could not be imported. ' +
        INSTALL_HINT,
      { cause: error },
    )
  }
}

function launchFailure(error: unknown, channel: string | null): BrowserUnavailableError {
  const reason = error instanceof Error ? error.message : String(error)
  const named = channel ? ` (channel "${channel}")` : ''
  return new BrowserUnavailableError(
    'Could not launch Chromium' +
      named +
      '. A working browser binary is required. ' +
      INSTALL_HINT +
      '\nOr point pixelpact at a browser this machine already has, with the ' +
      'executablePath or channel option (executablePath also reads the ' +
      'PIXELPACT_CHROMIUM environment variable).\nBrowser said: ' +
      reason,
    { cause: error },
  )
}

/**
 * Launch Chromium with rendering made deterministic.
 *
 * The flags fix colour profile and text rendering so two runs of the same page
 * produce the same pixels. No sandbox flag is passed: a library should not
 * lower a browser's isolation on its own. Containers that run as root should
 * either run as a normal user or pass `channel` or `executablePath`.
 *
 * @throws BrowserUnavailableError when no browser can be started
 *
 * @example
 * ```ts
 * const browser = await launchBrowser(resolveBrowserOptions({ channel: 'chrome' }))
 * ```
 */
export async function launchBrowser(options: ResolvedBrowserOptions): Promise<Browser> {
  const { chromium } = await loadPlaywright()
  const launchOptions: LaunchOptions = {
    headless: options.headless,
    args: [
      '--force-color-profile=srgb',
      '--font-render-hinting=none',
      '--disable-lcd-text',
      '--disable-blink-features=AutomationControlled',
    ],
  }
  if (options.channel) launchOptions.channel = options.channel
  else if (options.executablePath) launchOptions.executablePath = options.executablePath

  try {
    return await chromium.launch(launchOptions)
  } catch (error) {
    if (!options.channel) throw launchFailure(error, null)
    // The named channel is not installed here. The bundled Chromium renders
    // the same page well enough to be worth one retry.
    const fallback: LaunchOptions = { ...launchOptions }
    delete fallback.channel
    if (options.executablePath) fallback.executablePath = options.executablePath
    try {
      return await chromium.launch(fallback)
    } catch (fallbackError) {
      throw launchFailure(fallbackError, options.channel)
    }
  }
}

/**
 * Build the context configuration for one viewport.
 *
 * Locale and time zone are always set, because a page that renders dates or
 * currency differently on two machines cannot be compared. Nothing here claims
 * a particular operating system or browser version: a stale user agent is both
 * a lie and a fingerprint, so the browser's own is used unless the caller sets
 * one.
 */
export function buildContextOptions(
  viewport: Viewport,
  options: ResolvedBrowserOptions,
): BrowserContextOptions {
  const isSmall = viewport.width < 500
  const base: BrowserContextOptions = {
    viewport: { width: viewport.width, height: viewport.height },
    deviceScaleFactor: 1,
    reducedMotion: 'no-preference',
    locale: options.locale,
    timezoneId: options.timezone,
  }
  if (options.userAgent) base.userAgent = options.userAgent
  if (!options.stealth) return base

  const language = options.locale.split('-')[0]
  return {
    ...base,
    isMobile: isSmall,
    hasTouch: isSmall,
    javaScriptEnabled: true,
    extraHTTPHeaders: {
      // Only a CORS safelisted header belongs here. Anything else is sent on
      // every request, which turns a font fetch into a preflight the font host
      // rejects, and the page then renders in a fallback typeface: every
      // measurement taken from it would be of the wrong font.
      'Accept-Language': `${options.locale},${language};q=0.9,en;q=0.8`,
    },
  }
}

/**
 * Remove the most obvious automation fingerprints before any page script runs.
 *
 * Protected sites otherwise answer with a challenge page, and a contract
 * extracted from a challenge page describes the challenge.
 */
export async function applyStealth(context: BrowserContext): Promise<void> {
  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined })
    Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] })
    Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => 8 })
    Object.defineProperty(navigator, 'deviceMemory', { get: () => 8 })
    const carrier = window as unknown as { chrome?: unknown }
    carrier.chrome = carrier.chrome || { runtime: {} }
  })
}

/**
 * Close cookie banners and consent overlays.
 *
 * A banner left standing covers the page: it shifts the geometry of everything
 * behind it and paints itself into the screenshot.
 *
 * @param extraSelectors - additional accept buttons for this particular site
 * @returns how many overlays were dismissed
 */
export async function dismissOverlays(page: Page, extraSelectors: string[] = []): Promise<number> {
  let dismissed = 0
  for (const selector of [...OVERLAY_ACCEPT_SELECTORS, ...extraSelectors]) {
    try {
      const element = await page.$(selector)
      if (element && (await element.isVisible())) {
        await element.click({ timeout: 2000 })
        dismissed++
        await page.waitForTimeout(400)
      }
    } catch {
      // not clickable, covered, or detached: try the next one
    }
  }

  if (dismissed > 0) return dismissed

  try {
    dismissed += await page.evaluate(() => {
      const wording = /^(accept|accept all|agree|i agree|allow all|got it|ok)$/i
      const candidates = Array.from(
        document.querySelectorAll('button, a[role="button"], [role="button"]'),
      )
      let clicked = 0
      for (const element of candidates) {
        const label = (element.textContent || '').trim()
        const visible = (element as HTMLElement).offsetParent !== null
        if (wording.test(label) && visible) {
          ;(element as HTMLElement).click()
          clicked++
        }
        if (clicked >= 2) break
      }
      return clicked
    })
    if (dismissed > 0) await page.waitForTimeout(400)
  } catch {
    // the page navigated away or blocked evaluation
  }

  return dismissed
}

/**
 * Stop every animation and transition so a screenshot is reproducible.
 *
 * Call it only after computed styles have been read: the animation and
 * transition values have to come from the live page, and this erases them.
 */
export async function freezeAnimations(page: Page): Promise<void> {
  try {
    await page.addStyleTag({
      content:
        '*, *::before, *::after { animation: none !important; transition: none !important; ' +
        'scroll-behavior: auto !important; caret-color: transparent !important; }',
    })
    await page.evaluate(() => {
      for (const video of Array.from(document.querySelectorAll('video'))) {
        try {
          video.pause()
          video.currentTime = 0
        } catch {
          // a video that refuses to seek is not worth failing over
        }
      }
    })
    await page.waitForTimeout(250)
  } catch {
    // freezing is best effort, never a reason to fail an extraction
  }
}

/**
 * Scroll the whole page so lazy images load and decode.
 *
 * Chromium leaves a tile it never composited blank in a screenshot, and an
 * image that has arrived but not been decoded also comes out blank, so both
 * are forced here. Each decode races a deadline: an image inside a hidden
 * subtree never loads, and `decode()` on it never settles.
 */
export async function paintAll(page: Page): Promise<void> {
  try {
    await page.evaluate(async () => {
      // Overlapping steps: a stride of exactly one viewport leaves the rows
      // straddling each fold unpainted.
      const step = Math.max(320, Math.round(window.innerHeight * 0.8))
      const maxSteps = 80
      const height = () =>
        Math.max(document.body.scrollHeight, document.documentElement.scrollHeight)

      for (let i = 0, y = 0; y < height() && i < maxSteps; i++, y += step) {
        window.scrollTo(0, y)
        await new Promise((resolve) => setTimeout(resolve, 120))
      }
      window.scrollTo(0, 0)

      const decodeDeadline = 2000
      await Promise.all(
        Array.from(document.images).map((image) =>
          Promise.race([
            image.decode().catch(() => undefined),
            new Promise((resolve) => setTimeout(resolve, decodeDeadline)),
          ]),
        ),
      )
      await new Promise((resolve) => setTimeout(resolve, 300))
    })
  } catch {
    // painting is best effort
  }
}

/** Wait until the network is quiet, fonts are ready and the page has painted. */
export async function settle(page: Page): Promise<void> {
  try {
    await page.waitForLoadState('networkidle', { timeout: 15000 })
  } catch {
    // a page with a long poll never goes idle, carry on
  }
  try {
    await page.evaluate(async () => {
      if (document.fonts) await document.fonts.ready
    })
  } catch {
    // no font loading api
  }
  await paintAll(page)
  await page.waitForTimeout(400)
}

/** Where a screenshot goes and what is painted over first. */
export interface ShotOptions {
  path: string
  mask?: Locator[]
  maskColor?: string
}

/** Chromium stitches tiles above this height instead of rendering them. */
const MAX_VIEWPORT_HEIGHT = 16000

/**
 * Full page screenshot that actually contains the whole page.
 *
 * Chromium's `fullPage` option stitches tiles it never composited, so parts of
 * a long page come out blank, and a different part on each run. Growing the
 * viewport to the document height instead makes it an ordinary render.
 * Documents taller than the compositor limit fall back to the stitched shot.
 */
export async function captureFullPage(page: Page, options: ShotOptions): Promise<void> {
  const size = page.viewportSize()
  const height = await page.evaluate(() =>
    Math.max(document.body.scrollHeight, document.documentElement.scrollHeight),
  )

  if (!size || height > MAX_VIEWPORT_HEIGHT) {
    await paintAll(page)
    await page.screenshot({ ...options, fullPage: true })
    return
  }

  await page.setViewportSize({ width: size.width, height })
  await paintAll(page)
  await page.waitForTimeout(300)
  await page.screenshot({ ...options, fullPage: false })
  await page.setViewportSize(size)
}

/**
 * Decide whether the page that loaded is the site or a bot challenge.
 *
 * Reporting a challenge page as a design contract is worse than failing, so
 * the reasons are returned and the caller decides. A scoped extraction is
 * supposed to be small, so size is never held against it.
 *
 * @returns human readable reasons, empty when the page looks genuine
 */
export function looksBlocked(
  data: Pick<PageExtractionResult, 'title' | 'elements' | 'documentHeight'>,
  status: number,
  scoped = false,
): string[] {
  const strong: string[] = []
  const weak: string[] = []

  if (status >= 400) strong.push(`HTTP ${status}`)

  const title = (data.title || '').toLowerCase()
  const challenge =
    /(access denied|forbidden|attention required|just a moment|are you a robot|checking your browser|error 40|blocked)/
  if (challenge.test(title)) strong.push(`page title: "${data.title}"`)

  if (!scoped) {
    const count = data.elements.length
    if (count < 15) weak.push(`only ${count} elements`)
    if (data.documentHeight < 600) weak.push(`document height ${data.documentHeight}px`)
  }

  if (strong.length > 0) return [...strong, ...weak]
  return weak.length >= 2 ? weak : []
}

/** A page that has loaded, settled and is ready to be measured. */
export interface PageSession {
  context: BrowserContext
  page: Page
  /** HTTP status of the main document, `0` when the browser reported none. */
  status: number
}

/**
 * Open one page: context, stealth, navigation, overlays and settling.
 *
 * @throws TargetNotFoundError when the url does not load
 */
export async function openPage(
  browser: Browser,
  viewport: Viewport,
  url: string,
  options: ResolvedBrowserOptions,
): Promise<PageSession> {
  const context = await browser.newContext(buildContextOptions(viewport, options))
  try {
    if (options.stealth) await applyStealth(context)
    const page = await context.newPage()
    page.setDefaultTimeout(options.timeout)
    const response = await page.goto(url, {
      waitUntil: 'domcontentloaded',
      timeout: options.timeout,
    })
    if (options.dismissOverlays) await dismissOverlays(page)
    await settle(page)
    if (options.wait > 0) await page.waitForTimeout(options.wait)
    return { context, page, status: response ? response.status() : 0 }
  } catch (error) {
    await context.close().catch(() => undefined)
    throw new TargetNotFoundError(
      'Could not load "' +
        url +
        '" at viewport ' +
        viewport.name +
        ': ' +
        (error instanceof Error ? error.message : String(error)) +
        '. Check that the address is reachable, that the server is running, and ' +
        'raise the timeout option if the page is simply slow.',
      { cause: error },
    )
  }
}

/** Close a context and a browser without letting teardown mask a real error. */
export async function closeQuietly(target: { close: () => Promise<void> }): Promise<void> {
  try {
    await target.close()
  } catch {
    // already gone
  }
}
