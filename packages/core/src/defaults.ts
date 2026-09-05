import { tmpdir } from 'node:os'
import type {
  BrowserOptions,
  CheckOptions,
  DiffOptions,
  ExtractOptions,
  SerializedExtractOptions,
  Viewport,
} from './types.js'

/**
 * The viewports a contract is measured at when the caller names none.
 *
 * @example
 * ```ts
 * await extract({ url, viewports: DEFAULT_VIEWPORTS.filter((v) => v.name === 'mobile') })
 * ```
 */
export const DEFAULT_VIEWPORTS: Viewport[] = [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'mobile', width: 390, height: 844 },
]

/**
 * The computed properties that decide whether something looks right.
 *
 * Everything else a browser computes is either derivable from these or too
 * noisy to assert on, and every extra property makes a contract larger and a
 * report harder to read.
 */
export const TRACKED_PROPS: string[] = [
  'display',
  'position',
  'box-sizing',
  'z-index',
  'overflow',
  'width',
  'height',
  'min-height',
  'max-width',
  'margin-top',
  'margin-right',
  'margin-bottom',
  'margin-left',
  'padding-top',
  'padding-right',
  'padding-bottom',
  'padding-left',
  'color',
  'background-color',
  'background-image',
  'background-size',
  'background-position',
  'background-repeat',
  'font-family',
  'font-size',
  'font-weight',
  'font-style',
  'line-height',
  'letter-spacing',
  'text-align',
  'text-transform',
  'text-decoration-line',
  'white-space',
  'border-top-width',
  'border-right-width',
  'border-bottom-width',
  'border-left-width',
  'border-top-style',
  'border-top-color',
  'border-top-left-radius',
  'border-top-right-radius',
  'border-bottom-left-radius',
  'border-bottom-right-radius',
  'box-shadow',
  'opacity',
  'transform',
  'filter',
  'backdrop-filter',
  'transition-property',
  'transition-duration',
  'transition-timing-function',
  'transition-delay',
  'animation-name',
  'animation-duration',
  'animation-timing-function',
  'animation-iteration-count',
  'animation-direction',
  'flex-direction',
  'flex-wrap',
  'justify-content',
  'align-items',
  'align-content',
  'gap',
  'row-gap',
  'column-gap',
  'flex-grow',
  'flex-shrink',
  'flex-basis',
  'grid-template-columns',
  'grid-template-rows',
  'cursor',
  'visibility',
  'object-fit',
]

/** Elements whose hover and focus states are worth probing. */
export const INTERACTIVE_SELECTOR: string =
  'a, button, input, select, textarea, summary, [role="button"], [role="link"], ' +
  '[role="tab"], [tabindex]:not([tabindex="-1"]), .btn, .button, [class*="hover"]'

/**
 * Accept buttons of the common consent vendors.
 *
 * A maintenance list by nature: vendors change their markup, and a banner left
 * standing covers the page and poisons both the geometry and the screenshot.
 */
export const OVERLAY_ACCEPT_SELECTORS: string[] = [
  '#onetrust-accept-btn-handler',
  '#CybotCookiebotDialogBodyLevelButtonLevelOptinAllowAll',
  '#CybotCookiebotDialogBodyButtonAccept',
  '.cc-allow',
  '.cc-dismiss',
  '#accept-cookies',
  '.cookie-accept',
  '[data-testid="uc-accept-all-button"]',
  'button[aria-label*="Accept" i]',
  'button[title*="Accept" i]',
]

/** Every browser option with its default filled in. */
export type ResolvedBrowserOptions = Required<BrowserOptions>

/** Every check option with its default filled in. */
export type ResolvedCheckOptions = Required<Omit<CheckOptions, 'onProgress'>>

/** Every diff option with its default filled in. */
export type ResolvedDiffOptions = Required<Omit<DiffOptions, 'onProgress'>>

/**
 * Fill in the browser defaults.
 *
 * Nothing here is read from a config file or from the current directory: the
 * only environment value consulted is `PIXELPACT_CHROMIUM`, which lets a
 * machine point at a browser it already has instead of downloading another.
 */
export function resolveBrowserOptions(options: BrowserOptions = {}): ResolvedBrowserOptions {
  return {
    headless: options.headless ?? true,
    channel: options.channel ?? null,
    executablePath: options.executablePath ?? process.env.PIXELPACT_CHROMIUM ?? null,
    locale: options.locale ?? 'en-US',
    timezone: options.timezone ?? 'UTC',
    userAgent: options.userAgent ?? null,
    stealth: options.stealth ?? true,
    wait: options.wait ?? 2000,
    dismissOverlays: options.dismissOverlays ?? true,
    timeout: options.timeout ?? 30000,
  }
}

/**
 * Fill in the extraction defaults. The result is stored on the contract so a
 * later check can measure the implementation the same way.
 *
 * @example
 * ```ts
 * const resolved = resolveExtractOptions({ url: 'https://example.com' })
 * // resolved.timezone === 'UTC', resolved.maxElements === 600
 * ```
 */
export function resolveExtractOptions(options: ExtractOptions): SerializedExtractOptions {
  return {
    ...resolveBrowserOptions(options),
    url: options.url,
    selector: options.selector ?? null,
    viewports: options.viewports ?? DEFAULT_VIEWPORTS,
    maxElements: options.maxElements ?? 600,
    maxStates: options.maxStates ?? 120,
    masks: options.masks ?? [],
    freezeAnimations: options.freezeAnimations ?? true,
    fullPage: options.fullPage ?? true,
    screenshotDir: options.screenshotDir ?? null,
  }
}

/** Fill in the check defaults. */
export function resolveCheckOptions(options: CheckOptions): ResolvedCheckOptions {
  return {
    ...resolveBrowserOptions(options),
    url: options.url,
    viewport: options.viewport ?? null,
    selector: options.selector ?? null,
    tolerance: options.tolerance ?? 1,
    maxStates: options.maxStates ?? 120,
  }
}

/** Fill in the diff defaults. Output goes to the system temp directory. */
export function resolveDiffOptions(options: DiffOptions): ResolvedDiffOptions {
  return {
    ...resolveBrowserOptions(options),
    url: options.url,
    viewport: options.viewport ?? null,
    selector: options.selector ?? null,
    threshold: options.threshold ?? 0.5,
    masks: options.masks ?? [],
    outDir: options.outDir ?? tmpdir(),
  }
}
