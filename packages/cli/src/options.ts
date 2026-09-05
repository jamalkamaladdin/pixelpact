import type {
  BrowserOptions,
  CheckOptions,
  DiffOptions,
  ExtractOptions,
  Viewport,
} from 'pixelpact-core'
import { DEFAULT_VIEWPORTS } from 'pixelpact-core'

/**
 * Thrown for anything the user typed wrong: a bad flag value, an unknown viewport
 * name, a malformed WIDTHxHEIGHT pair. Always maps to exit code 2.
 */
export class UsageError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'UsageError'
  }
}

const WIDTH_HEIGHT_PATTERN = /^(\d+)x(\d+)$/i

function knownViewportNames(): string {
  return DEFAULT_VIEWPORTS.map((v) => v.name).join(', ')
}

/** Parses a single viewport token: either a known name or a `WIDTHxHEIGHT` pair. */
export function parseViewportToken(token: string): Viewport {
  const trimmed = token.trim()
  const pair = WIDTH_HEIGHT_PATTERN.exec(trimmed)
  if (pair) {
    const width = Number(pair[1])
    const height = Number(pair[2])
    return { name: trimmed, width, height }
  }
  const known = DEFAULT_VIEWPORTS.find((v) => v.name === trimmed)
  if (!known) {
    throw new UsageError(
      `Unknown viewport "${trimmed}". Use one of ${knownViewportNames()} or a WIDTHxHEIGHT pair such as 1280x720.`,
    )
  }
  return known
}

/**
 * Shape cac uses for a flag declared with `type: []`. A flag that was never passed comes
 * back as `[null]`, not as `undefined`, so every consumer has to tolerate that.
 */
export type CacListFlag = readonly (string | null)[] | string

/**
 * Resolves the repeatable `--viewport` flag of `extract` into a list of viewports.
 * Each occurrence may itself be a comma separated list.
 */
export function resolveViewports(tokens: unknown): Viewport[] | undefined {
  const list = toStringArray(tokens)
  if (list === undefined) return undefined
  const flat = list.flatMap((token) =>
    token
      .split(',')
      .map((part) => part.trim())
      .filter((part) => part.length > 0),
  )
  if (flat.length === 0) return undefined
  return flat.map(parseViewportToken)
}

/**
 * Normalizes a repeatable flag. cac hands back a single string, an array of strings, or
 * `[null]` when a flag declared with `type: []` was never passed, so every entry that is
 * not a non empty string is dropped and an empty result becomes `undefined`.
 */
export function toStringArray(value: unknown): string[] | undefined {
  const items = Array.isArray(value) ? value : [value]
  const list = items.filter((item): item is string => typeof item === 'string' && item.length > 0)
  return list.length > 0 ? list : undefined
}

export function toNonNegativeInt(value: unknown, flagName: string): number | undefined {
  if (value === undefined) return undefined
  const n = Number(value)
  if (!Number.isFinite(n) || n < 0 || !Number.isInteger(n)) {
    throw new UsageError(
      `Invalid value for ${flagName}: "${String(value)}". Expected a non-negative integer.`,
    )
  }
  return n
}

export function toNonNegativeNumber(value: unknown, flagName: string): number | undefined {
  if (value === undefined) return undefined
  const n = Number(value)
  if (!Number.isFinite(n) || n < 0) {
    throw new UsageError(
      `Invalid value for ${flagName}: "${String(value)}". Expected a non-negative number.`,
    )
  }
  return n
}

/** Flags shared by every command that launches a browser. */
export interface BrowserFlags {
  headful?: boolean
  channel?: string
  locale?: string
  timezone?: string
  stealth?: boolean
  dismiss?: boolean
  wait?: string | number
  timeout?: string | number
}

export function buildBrowserOptions(flags: BrowserFlags): BrowserOptions {
  const options: BrowserOptions = {}
  if (flags.headful) options.headless = false
  if (flags.channel !== undefined) options.channel = flags.channel
  if (flags.locale !== undefined) options.locale = flags.locale
  if (flags.timezone !== undefined) options.timezone = flags.timezone
  if (flags.stealth !== undefined) options.stealth = flags.stealth
  if (flags.dismiss !== undefined) options.dismissOverlays = flags.dismiss
  const wait = toNonNegativeInt(flags.wait, '--wait')
  if (wait !== undefined) options.wait = wait
  const timeout = toNonNegativeInt(flags.timeout, '--timeout')
  if (timeout !== undefined) options.timeout = timeout
  return options
}

export interface ExtractFlags extends BrowserFlags {
  out?: string
  selector?: string
  viewport?: CacListFlag
  maxElements?: string | number
  maxStates?: string | number
  mask?: CacListFlag
  screenshots?: string
  freeze?: boolean
  fullPage?: boolean
  json?: boolean
  quiet?: boolean
}

export interface ExtractCliOptions {
  extractOptions: Omit<ExtractOptions, 'onProgress'>
  out: string
  json: boolean
  quiet: boolean
}

export function buildExtractOptions(url: string, flags: ExtractFlags): ExtractCliOptions {
  const extractOptions: Omit<ExtractOptions, 'onProgress'> = {
    url,
    ...buildBrowserOptions(flags),
  }
  if (flags.selector !== undefined) extractOptions.selector = flags.selector
  const viewports = resolveViewports(flags.viewport)
  if (viewports !== undefined) extractOptions.viewports = viewports
  const maxElements = toNonNegativeInt(flags.maxElements, '--max-elements')
  if (maxElements !== undefined) extractOptions.maxElements = maxElements
  const maxStates = toNonNegativeInt(flags.maxStates, '--max-states')
  if (maxStates !== undefined) extractOptions.maxStates = maxStates
  const masks = toStringArray(flags.mask)
  if (masks !== undefined) extractOptions.masks = masks
  if (flags.freeze !== undefined) extractOptions.freezeAnimations = flags.freeze
  if (flags.fullPage !== undefined) extractOptions.fullPage = flags.fullPage
  if (flags.screenshots !== undefined) extractOptions.screenshotDir = flags.screenshots

  return {
    extractOptions,
    out: flags.out ?? 'pixelpact.contract.json',
    json: flags.json ?? false,
    quiet: flags.quiet ?? false,
  }
}

export interface CheckFlags extends BrowserFlags {
  viewport?: string
  selector?: string
  tolerance?: string | number
  out?: string
  maxStates?: string | number
  json?: boolean
  quiet?: boolean
}

export interface CheckCliOptions {
  checkOptions: Omit<CheckOptions, 'onProgress'>
  out: string | undefined
  json: boolean
  quiet: boolean
}

export function buildCheckOptions(url: string, flags: CheckFlags): CheckCliOptions {
  const checkOptions: Omit<CheckOptions, 'onProgress'> = {
    url,
    ...buildBrowserOptions(flags),
  }
  if (flags.viewport !== undefined) checkOptions.viewport = flags.viewport
  if (flags.selector !== undefined) checkOptions.selector = flags.selector
  const tolerance = toNonNegativeNumber(flags.tolerance, '--tolerance')
  if (tolerance !== undefined) checkOptions.tolerance = tolerance
  const maxStates = toNonNegativeInt(flags.maxStates, '--max-states')
  if (maxStates !== undefined) checkOptions.maxStates = maxStates

  return {
    checkOptions,
    out: flags.out,
    json: flags.json ?? false,
    quiet: flags.quiet ?? false,
  }
}

export interface DiffFlags extends BrowserFlags {
  viewport?: string
  selector?: string
  threshold?: string | number
  outDir?: string
  mask?: CacListFlag
  json?: boolean
  quiet?: boolean
}

export interface DiffCliOptions {
  diffOptions: Omit<DiffOptions, 'onProgress'>
  json: boolean
  quiet: boolean
}

export function buildDiffOptions(url: string, flags: DiffFlags): DiffCliOptions {
  const diffOptions: Omit<DiffOptions, 'onProgress'> = {
    url,
    ...buildBrowserOptions(flags),
  }
  if (flags.viewport !== undefined) diffOptions.viewport = flags.viewport
  if (flags.selector !== undefined) diffOptions.selector = flags.selector
  const threshold = toNonNegativeNumber(flags.threshold, '--threshold')
  if (threshold !== undefined) diffOptions.threshold = threshold
  const masks = toStringArray(flags.mask)
  if (masks !== undefined) diffOptions.masks = masks
  if (flags.outDir !== undefined) diffOptions.outDir = flags.outDir

  return {
    diffOptions,
    json: flags.json ?? false,
    quiet: flags.quiet ?? false,
  }
}
