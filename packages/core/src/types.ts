/**
 * Format version of a {@link Contract} document.
 *
 * A contract written by one version of pixelpact is only understood by readers
 * that accept the same version, so bump this whenever the shape changes in a
 * way older readers cannot handle.
 */
export const CONTRACT_VERSION = 1

/** A named browser viewport the reference page is measured at. */
export interface Viewport {
  name: string
  width: number
  height: number
}

/** Element geometry in CSS pixels, relative to the top of the document. */
export interface Box {
  x: number
  y: number
  w: number
  h: number
}

/** Computed CSS declarations, keyed by kebab-case property name. */
export type StyleMap = Record<string, string>

/**
 * One measured element of the reference page.
 *
 * `hover`, `focus`, `before` and `after` hold only the declarations that differ
 * from `styles`, so a contract stays small even on a large page.
 */
export interface ContractElement {
  /** CSS path that located the element, or `[data-contract="..."]` when present. */
  selector: string
  tag: string
  /** Value of the `data-contract` attribute, when the reference page sets one. */
  contractId: string | null
  classes: string[]
  text: string
  box: Box
  styles: StyleMap
  interactive: boolean
  /** Declarations that changed while the pointer was over the element. */
  hover?: StyleMap
  /** Declarations that changed while the element had focus. */
  focus?: StyleMap
  /** Computed style of the `::before` pseudo element, when it renders content. */
  before?: StyleMap
  /** Computed style of the `::after` pseudo element, when it renders content. */
  after?: StyleMap
}

/** Everything measured at one viewport. */
export interface ViewportSnapshot {
  documentHeight: number
  /** True when `maxElements` stopped the walk before the end of the page. */
  truncated: boolean
  visibleTotal: number
  elements: ContractElement[]
}

/** One step of a `@keyframes` rule. */
export interface KeyframeStep {
  offset: string
  css: string
}

/**
 * A visual contract: what the reference looks like, measured rather than
 * described.
 *
 * @example
 * ```ts
 * const contract = await extract({ url: 'https://example.com' })
 * const measured = contract.byViewport.desktop.elements.length
 * ```
 */
export interface Contract {
  version: typeof CONTRACT_VERSION
  source: { type: 'url'; value: string }
  /** CSS selector the DOM walk started from. */
  root: string
  /** ISO 8601 timestamp of the extraction. */
  extractedAt: string
  viewports: Viewport[]
  masks: string[]
  /** The options the extraction actually ran with, so a check can reuse them. */
  options: SerializedExtractOptions
  /** CSS custom properties declared on `:root`. */
  tokens: Record<string, string>
  keyframes: Record<string, KeyframeStep[]>
  /** Viewport name to png path. Empty when no screenshot directory was given. */
  screenshots: Record<string, string>
  byViewport: Record<string, ViewportSnapshot>
  warnings: string[]
}

/** Browser behaviour shared by every entry point. */
export interface BrowserOptions {
  /** Run without a visible window. Default `true`. */
  headless?: boolean
  /** Playwright browser channel, for example `'chrome'`. Default `null`. */
  channel?: string | null
  /** Path to a browser binary. Default `process.env.PIXELPACT_CHROMIUM ?? null`. */
  executablePath?: string | null
  /** BCP 47 locale given to the page. Default `'en-US'`. */
  locale?: string
  /** IANA time zone given to the page. Default `'UTC'`. */
  timezone?: string
  /** Override the browser user agent. Default `null`, meaning the browser decides. */
  userAgent?: string | null
  /** Hide the most obvious automation fingerprints. Default `true`. */
  stealth?: boolean
  /** Extra settle time in ms after the page reports it is loaded. Default `2000`. */
  wait?: number
  /** Try to close cookie banners and consent overlays. Default `true`. */
  dismissOverlays?: boolean
  /** Navigation timeout in ms. Default `30000`. */
  timeout?: number
}

/** Input to {@link Contract} extraction. */
export interface ExtractOptions extends BrowserOptions {
  url: string
  /** Root of the DOM walk. Default `null`, meaning `body`. */
  selector?: string | null
  /** Viewports to measure. Default `DEFAULT_VIEWPORTS`. */
  viewports?: Viewport[]
  /** Element budget per viewport. Default `600`. `0` means unbounded. */
  maxElements?: number
  /** How many interactive elements get hover and focus probed. Default `120`. */
  maxStates?: number
  /** Selectors painted over before a screenshot is taken. */
  masks?: string[]
  /** Stop animations and transitions before screenshotting. Default `true`. */
  freezeAnimations?: boolean
  /** Capture the whole document instead of one viewport. Default `true`. */
  fullPage?: boolean
  /** Where screenshots are written. Default `null`, meaning none are taken. */
  screenshotDir?: string | null
  onProgress?: (event: ProgressEvent) => void
}

/**
 * The resolved extraction options as stored inside a contract: every default
 * filled in, and the `onProgress` callback dropped because it cannot be
 * serialised.
 */
export type SerializedExtractOptions = Omit<Required<ExtractOptions>, 'onProgress'>

/** Input to a style check against a live implementation. */
export interface CheckOptions extends BrowserOptions {
  url: string
  /** Viewport name from the contract. Default: the first one it declares. */
  viewport?: string | null
  /** Root of the DOM walk. Default: `contract.root`. */
  selector?: string | null
  /** Pixel tolerance for box and length comparisons. Default `1`. */
  tolerance?: number
  /** How many interactive elements get hover and focus probed. Default `120`. */
  maxStates?: number
  onProgress?: (event: ProgressEvent) => void
}

/** Input to a pixel comparison against a live implementation. */
export interface DiffOptions extends BrowserOptions {
  url: string
  /** Viewport name from the contract. Default: the first one it declares. */
  viewport?: string | null
  /** Element to screenshot. Default: `contract.root`. */
  selector?: string | null
  /** Share of differing pixels that still passes, in percent. Default `0.5`. */
  threshold?: number
  /** Selectors painted over in the implementation screenshot. */
  masks?: string[]
  /** Where the actual and diff pngs are written. Default `os.tmpdir()`. */
  outDir?: string
  onProgress?: (event: ProgressEvent) => void
}

/** Progress notification. The library never prints; callers do. */
export interface ProgressEvent {
  phase: 'launch' | 'navigate' | 'extract' | 'states' | 'screenshot' | 'compare' | 'done'
  message: string
  viewport?: string
  current?: number
  total?: number
}

/** Which rendering state a deviation was found in. */
export type DeviationState = 'base' | 'hover' | 'focus' | 'before' | 'after'

/** One property that does not match the contract. */
export interface Deviation {
  selector: string
  state: DeviationState
  property: string
  expected: string
  actual: string
  /** Numeric size of the difference when it is measurable, otherwise `null`. */
  delta: number | null
  unit: 'px' | 'color' | null
}

/** Result of {@link Contract} verification against an implementation. */
export interface CheckReport {
  version: typeof CONTRACT_VERSION
  /** The implementation url that was measured. */
  target: string
  /** Copied from the contract, so a report says what it was compared against. */
  source: { type: 'url'; value: string }
  viewport: Viewport
  checkedAt: string
  totals: {
    elements: number
    matched: number
    missing: number
    checks: number
    passed: number
    failed: number
  }
  /** Checks passed over checks run, between 0 and 1. */
  passRate: number
  /** Contract selectors with no counterpart in the implementation. */
  missing: string[]
  deviations: Deviation[]
  ok: boolean
}

/** Result of a pixel comparison. */
export interface DiffReport {
  version: typeof CONTRACT_VERSION
  target: string
  viewport: Viewport
  checkedAt: string
  totalPixels: number
  differentPixels: number
  differentPercent: number
  threshold: number
  ok: boolean
  images: { reference: string; actual: string; diff: string }
}

/** Options for the human readable report formatters. */
export interface FormatOptions {
  /** Emit ANSI colour codes. Default `false`. */
  color?: boolean
  /** How many rows to print before summarising the rest. Default `20`. */
  limit?: number
}

/**
 * What the in-page DOM walker returns. Internal: the public shape is
 * {@link ViewportSnapshot}.
 */
export interface PageExtractionResult {
  url: string
  title: string
  root: string
  tokens: Record<string, string>
  keyframes: Record<string, KeyframeStep[]>
  elements: ContractElement[]
  truncated: boolean
  visibleTotal: number
  documentHeight: number
  /** Set when the root selector matched nothing; every other field is empty then. */
  error: string | null
}

/** Hover and focus deltas collected for one element. Internal. */
export interface ElementStates {
  hover?: StyleMap
  focus?: StyleMap
}
