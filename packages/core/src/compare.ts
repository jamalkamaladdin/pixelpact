import type { ContractElement, StyleMap } from './types.js'

/** Length properties where a small pixel difference is not a defect. */
const LENGTH_PROPS = new Set([
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
  'border-top-width',
  'border-right-width',
  'border-bottom-width',
  'border-left-width',
  'border-top-left-radius',
  'border-top-right-radius',
  'border-bottom-left-radius',
  'border-bottom-right-radius',
  'font-size',
  'line-height',
  'letter-spacing',
  'gap',
  'row-gap',
  'column-gap',
])

/** Properties compared by perceived colour rather than by string. */
const COLOR_PROPS = new Set(['color', 'background-color', 'border-top-color'])

/**
 * Properties that are noisy on their own.
 *
 * `width` and `height` are here because geometry is compared from the bounding
 * box instead, and reporting both says the same thing twice.
 */
const IGNORED = new Set(['transition-delay', 'flex-basis', 'visibility', 'width', 'height'])

/** A colour in sRGB with straight alpha. */
export interface Rgba {
  r: number
  g: number
  b: number
  a: number
}

/**
 * Read an `rgb()` or `rgba()` value as numbers.
 *
 * Browsers serialise every computed colour this way, so named colours and hex
 * literals never reach here. Returns `null` for anything else, including
 * `transparent` and gradients.
 *
 * @example
 * ```ts
 * parseColor('rgba(255, 0, 0, 0.5)') // { r: 255, g: 0, b: 0, a: 0.5 }
 * ```
 */
export function parseColor(value: string): Rgba | null {
  const match = String(value).match(/rgba?\(([^)]+)\)/)
  if (!match?.[1]) return null
  const parts = match[1]
    .split(/[,\s/]+/)
    .filter(Boolean)
    .map(Number)
  if (parts.length < 3) return null
  const [r, g, b] = parts
  if ([r, g, b].some((n) => Number.isNaN(n))) return null
  const alpha = parts.length > 3 ? parts[3] : 1
  return { r, g, b, a: Number.isNaN(alpha) ? 1 : alpha }
}

/**
 * Distance between two colours, weighted the way an eye weighs them.
 *
 * `0` means identical and anything above roughly `2` is visible side by side.
 * Two values that cannot be parsed return `0` when their text matches and `99`
 * when it does not, so an unparseable mismatch is never silently accepted.
 * A difference in alpha above 0.02 also returns `99`: a colour that is right
 * but half transparent is a real defect, not a small one.
 *
 * @example
 * ```ts
 * colorDistance('rgb(0, 0, 0)', 'rgb(0, 0, 1)') // well under 1
 * colorDistance('rgb(0, 0, 0)', 'rgb(255, 255, 255)') // far above 2
 * ```
 */
export function colorDistance(a: string, b: string): number {
  const c1 = parseColor(a)
  const c2 = parseColor(b)
  if (!c1 || !c2) return a === b ? 0 : 99
  if (Math.abs(c1.a - c2.a) > 0.02) return 99
  const rMean = (c1.r + c2.r) / 2
  const dr = c1.r - c2.r
  const dg = c1.g - c2.g
  const db = c1.b - c2.b
  return (
    Math.sqrt((2 + rMean / 256) * dr * dr + 4 * dg * dg + (2 + (255 - rMean) / 256) * db * db) / 3
  )
}

/** One property that differs, without the element context around it. */
export interface StyleDeviation {
  property: string
  expected: string
  actual: string
  /** Size of the difference in `unit`, or `null` when it cannot be measured. */
  delta: number | null
  unit: 'px' | 'color' | null
}

/** Options shared by the style comparators. */
export interface CompareOptions {
  /** Pixel tolerance for length comparisons. Default `1`. */
  tolerance?: number
}

const toPx = (value: string): number | null => {
  const match = String(value).match(/^(-?[\d.]+)px$/)
  if (!match) return null
  const parsed = Number.parseFloat(match[1])
  return Number.isNaN(parsed) ? null : parsed
}

const firstFont = (value: string): string =>
  String(value).split(',')[0].replace(/["']/g, '').trim().toLowerCase()

const collapse = (value: string): string => String(value).replace(/\s+/g, ' ').trim()

/**
 * Compare one computed property.
 *
 * Returns `null` when the values agree closely enough to look the same, and a
 * deviation otherwise. Each family of properties has its own idea of "close
 * enough": colours by perceived distance, lengths by pixel tolerance, font
 * stacks by the family that actually wins, animations and transitions after
 * whitespace is collapsed.
 *
 * @example
 * ```ts
 * compareProperty('font-size', '16px', '16.5px', 1) // null, inside tolerance
 * compareProperty('font-size', '16px', '20px', 1)?.delta // 4
 * ```
 */
export function compareProperty(
  property: string,
  expected: string,
  actual: string,
  tolerance = 1,
): StyleDeviation | null {
  if (IGNORED.has(property)) return null
  if (expected === actual) return null

  const base = { property, expected, actual }

  if (COLOR_PROPS.has(property)) {
    const distance = colorDistance(expected, actual)
    if (distance <= 2) return null
    return { ...base, delta: Math.round(distance * 10) / 10, unit: 'color' }
  }

  if (LENGTH_PROPS.has(property)) {
    const e = toPx(expected)
    const a = toPx(actual)
    if (e !== null && a !== null) {
      const delta = Math.abs(e - a)
      if (delta <= tolerance) return null
      return { ...base, delta: Math.round(delta * 100) / 100, unit: 'px' }
    }
  }

  if (property === 'font-family') {
    if (firstFont(expected) === firstFont(actual)) return null
    return { ...base, delta: null, unit: null }
  }

  if (
    property.startsWith('transition-') ||
    property.startsWith('animation-') ||
    property === 'box-shadow' ||
    property === 'transform' ||
    property === 'background-image'
  ) {
    if (collapse(expected) === collapse(actual)) return null
    return { ...base, delta: null, unit: null }
  }

  return { ...base, delta: null, unit: null }
}

/**
 * Compare every property the contract asserts against what the page computed.
 *
 * Properties the implementation did not report are skipped rather than failed:
 * a browser that does not support a property says nothing about the design.
 *
 * @example
 * ```ts
 * compareStyles({ color: 'rgb(0, 0, 0)' }, { color: 'rgb(255, 0, 0)' })
 * // [{ property: 'color', delta: 76.5, unit: 'color', ... }]
 * ```
 */
export function compareStyles(
  expected: StyleMap,
  actual: StyleMap,
  options: CompareOptions = {},
): StyleDeviation[] {
  const tolerance = options.tolerance ?? 1
  const deviations: StyleDeviation[] = []
  for (const [property, value] of Object.entries(expected)) {
    const found = actual[property]
    if (found === undefined) continue
    const deviation = compareProperty(property, value, found, tolerance)
    if (deviation) deviations.push(deviation)
  }
  return deviations
}

/**
 * True when the element animates forever, such as a spinner or a marquee.
 *
 * The transform of such an element is a reading of a moment, not a contract:
 * the reference and the implementation are sampled at different instants and
 * can never agree. The animation itself is still compared by name and duration.
 */
export function isLooping(element: Pick<ContractElement, 'styles'> | undefined): boolean {
  const styles = element?.styles ?? {}
  const name = styles['animation-name']
  return Boolean(name) && name !== 'none' && styles['animation-iteration-count'] === 'infinite'
}

/** How a contract element was located in the implementation. */
export type MatchKind = 'contract-id' | 'selector' | 'text' | 'none'

/** Lookup tables built once per implementation, used for every match. */
export interface MatchIndex {
  byContractId: Map<string, ContractElement>
  bySelector: Map<string, ContractElement>
  byText: Map<string, ContractElement>
}

/** Result of looking for one contract element in an implementation. */
export interface MatchResult {
  element: ContractElement | null
  matchedBy: MatchKind
}

/**
 * Index an implementation once so matching stays linear.
 *
 * The first element wins for every key, which keeps matching stable when a
 * page repeats the same text or path.
 */
export function buildMatchIndex(elements: ContractElement[]): MatchIndex {
  const byContractId = new Map<string, ContractElement>()
  const bySelector = new Map<string, ContractElement>()
  const byText = new Map<string, ContractElement>()
  for (const element of elements) {
    if (element.contractId && !byContractId.has(element.contractId)) {
      byContractId.set(element.contractId, element)
    }
    if (!bySelector.has(element.selector)) bySelector.set(element.selector, element)
    if (element.text) {
      const key = `${element.tag}::${element.text}`
      if (!byText.has(key)) byText.set(key, element)
    }
  }
  return { byContractId, bySelector, byText }
}

/**
 * Find the implementation element that answers for a contract element.
 *
 * Three passes, most trustworthy first: an explicit `data-contract` id, then an
 * identical CSS path, then the same tag carrying the same text. The third pass
 * is what lets a rebuilt page pass a contract taken from a page with a
 * different DOM shape.
 *
 * @example
 * ```ts
 * const index = buildMatchIndex(implementationElements)
 * const { element, matchedBy } = findMatch(contractElement, index)
 * ```
 */
export function findMatch(target: ContractElement, index: MatchIndex): MatchResult {
  if (target.contractId) {
    const hit = index.byContractId.get(target.contractId)
    if (hit) return { element: hit, matchedBy: 'contract-id' }
  }
  const bySelector = index.bySelector.get(target.selector)
  if (bySelector) return { element: bySelector, matchedBy: 'selector' }
  if (target.text) {
    const byText = index.byText.get(`${target.tag}::${target.text}`)
    if (byText) return { element: byText, matchedBy: 'text' }
  }
  return { element: null, matchedBy: 'none' }
}

/**
 * Compare width and height from the bounding box.
 *
 * Tolerance grows with the element: one pixel on a 24px button matters, one
 * pixel on a 1440px hero is rounding. Anything under one percent of the
 * expected size passes.
 */
export function compareBox(
  expected: { w: number; h: number },
  actual: { w: number; h: number },
  tolerance = 1,
): StyleDeviation[] {
  const deviations: StyleDeviation[] = []
  const dimensions: Array<['w' | 'h', string]> = [
    ['w', 'box.width'],
    ['h', 'box.height'],
  ]
  for (const [key, property] of dimensions) {
    const e = expected[key]
    const a = actual[key]
    const delta = Math.abs(e - a)
    if (delta <= Math.max(tolerance, Math.abs(e) * 0.01)) continue
    deviations.push({
      property,
      expected: `${e}px`,
      actual: `${a}px`,
      delta: Math.round(delta * 100) / 100,
      unit: 'px',
    })
  }
  return deviations
}
