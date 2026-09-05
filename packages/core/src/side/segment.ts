import type { Box } from '../types.js'

/** A width and a height in pixels. */
export interface Size {
  width: number
  height: number
}

/**
 * One element child of the section root, as measured inside the page.
 *
 * Everything here is a plain value so the result can cross the browser
 * boundary, and so every function below can be tested without a browser.
 */
export interface RawSection {
  /** 1-based position among the root's element children, including skipped ones. */
  childIndex: number
  /** Lowercase tag name, for example `section`. */
  tag: string
  /** The `id` attribute, or an empty string. */
  id: string
  /** The `class` attribute, or an empty string. */
  className: string
  /** Text of the first heading inside the section, collapsed. Empty when there is none. */
  heading: string
  /** Start of the section's rendered text, collapsed. Empty when it renders none. */
  text: string
  /** Distance from the top of the document, in CSS pixels. */
  top: number
  /** Rendered height, in CSS pixels. */
  height: number
  /** How many descendants the section holds. */
  elements: number
}

/** What {@link sectionScanner} reports about one page. */
export interface SectionScan {
  /** The selector the sections were taken from. */
  root: string
  /** False only when a selector the caller declared matched nothing. */
  rootFound: boolean
  sections: RawSection[]
}

/**
 * Split a page into sections, executed inside the page.
 *
 * This function is handed to the browser as source text
 * (`sectionScanner.toString()`) and evaluated there, so at runtime it has no
 * module around it: a reference to anything declared outside would be
 * `undefined` in the page. Everything it uses is a parameter, a browser global,
 * or declared in its own body, and the only imports in this file are type-only,
 * which are erased before the function is ever stringified.
 *
 * @param rootSelector - container whose element children are the sections,
 *   `null` cascades from `main` to `body`
 * @param minHeight - children shorter than this are slivers, not sections
 *
 * @example
 * ```ts
 * const expression = `(${sectionScanner.toString()})(null, 24)`
 * const scan = await page.evaluate<SectionScan>(expression)
 * ```
 */
export function sectionScanner(rootSelector: string | null, minHeight: number): SectionScan {
  const fallback = document.querySelector('main') ? 'main' : 'body'
  const root = rootSelector === null ? fallback : rootSelector
  const host = document.querySelector(root)
  if (!host) return { root, rootFound: false, sections: [] }

  const SKIP = ['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE', 'LINK', 'META']
  const flatten = (value: string): string => value.replace(/\s+/g, ' ').trim()

  const sections: RawSection[] = []
  const children = Array.from(host.children)
  for (let i = 0; i < children.length; i++) {
    const child = children[i]
    if (SKIP.indexOf(child.tagName) >= 0) continue

    const style = getComputedStyle(child)
    if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') continue

    const rect = child.getBoundingClientRect()
    const height = Math.round(rect.height)
    if (height < minHeight || rect.width < 1) continue

    const heading = child.querySelector('h1, h2, h3, h4, h5, h6')
    const className = typeof child.className === 'string' ? child.className : ''
    sections.push({
      childIndex: i + 1,
      tag: child.tagName.toLowerCase(),
      id: child.id || '',
      className: flatten(className).slice(0, 80),
      heading: heading ? flatten(heading.textContent || '').slice(0, 80) : '',
      text: flatten((child as HTMLElement).innerText || '').slice(0, 80),
      top: Math.round(rect.top + window.scrollY),
      height,
      elements: child.querySelectorAll('*').length,
    })
  }

  return { root, rootFound: true, sections }
}

/** How many characters of a derived slug are kept. */
const SLUG_MAX = 40

/**
 * Turn arbitrary text into a file name safe, url safe slug.
 *
 * @returns the slug, or an empty string when nothing usable was left
 *
 * @example
 * ```ts
 * slugify('Our  Pricing!') // 'our-pricing'
 * ```
 */
export function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+/, '')
    .slice(0, SLUG_MAX)
    .replace(/-+$/, '')
}

/**
 * Name a section: its `id` first, then its first heading, then its position.
 *
 * The id is preferred because it is the one label the page author chose on
 * purpose, and it survives a copy edit of the heading.
 *
 * @param index - 1-based position among the sections that were kept
 *
 * @example
 * ```ts
 * deriveSlug({ ...section, id: '', heading: 'What we do' }, 3) // 'what-we-do'
 * ```
 */
export function deriveSlug(section: RawSection, index: number): string {
  return slugify(section.id) || slugify(section.heading) || `section-${index}`
}

/** A selector that points at the section, for a report line or an error message. */
export function sectionSelector(section: RawSection): string {
  if (section.id) return `${section.tag}#${section.id}`
  const first = section.className.split(' ').filter(Boolean)[0]
  if (first) return `${section.tag}.${first}`
  return `${section.tag}:nth-child(${section.childIndex})`
}

/**
 * The label a person reads: the heading when the section has one, otherwise a
 * selector that locates it.
 */
export function deriveLabel(section: RawSection): string {
  return section.heading || sectionSelector(section)
}

/**
 * Make a list of slugs unique, so two sections never write to the same file.
 *
 * Repeats are numbered from the second occurrence: `hero`, `hero-2`, `hero-3`.
 *
 * @example
 * ```ts
 * dedupeSlugs(['hero', 'hero']) // ['hero', 'hero-2']
 * ```
 */
export function dedupeSlugs(slugs: string[]): string[] {
  const seen = new Map<string, number>()
  return slugs.map((slug) => {
    const used = seen.get(slug) ?? 0
    seen.set(slug, used + 1)
    return used === 0 ? slug : `${slug}-${used + 1}`
  })
}

/** Two sections that sit at the same position on both pages. */
export interface SectionPair {
  /** 1-based position, shared by both sides. */
  index: number
  reference: RawSection
  target: RawSection
}

/** The pairs that exist, and how many sections were left over on each side. */
export interface SectionPairing {
  pairs: SectionPair[]
  unmatched: { reference: number; target: number }
}

/**
 * Pair two section lists by position.
 *
 * When the counts differ the surplus is counted rather than guessed at: a
 * report that invented a counterpart would put a picture of one section under
 * the name of another.
 *
 * @example
 * ```ts
 * const { pairs, unmatched } = pairSections(reference, target)
 * // 5 reference sections, 3 target sections: 3 pairs, unmatched.reference === 2
 * ```
 */
export function pairSections(reference: RawSection[], target: RawSection[]): SectionPairing {
  const shared = Math.min(reference.length, target.length)
  const pairs: SectionPair[] = []
  for (let i = 0; i < shared; i++) {
    pairs.push({ index: i + 1, reference: reference[i], target: target[i] })
  }
  return {
    pairs,
    unmatched: {
      reference: reference.length - shared,
      target: target.length - shared,
    },
  }
}

/**
 * Decide whether a section is the one the caller asked for.
 *
 * A number, or a string of digits, selects by 1-based index. Any other string
 * selects every section whose slug contains it, so `pricing` finds
 * `02-pricing-plans` without the caller knowing the number.
 *
 * @param only - the selection, `null` or an empty string meaning every section
 */
export function matchesOnly(index: number, slug: string, only: string | number | null): boolean {
  if (only === null) return true
  if (typeof only === 'number') return only === index
  const wanted = only.trim()
  if (wanted === '') return true
  if (/^\d+$/.test(wanted)) return Number(wanted) === index
  return slug.toLowerCase().includes(wanted.toLowerCase())
}

/**
 * The canvas two crops have to share before pixelmatch can compare them.
 *
 * The larger of each dimension is taken, never the smaller: cropping both to
 * the shorter one would hide the very difference that made them differ.
 */
export function commonCanvas(a: Size, b: Size): Size {
  return { width: Math.max(a.width, b.width), height: Math.max(a.height, b.height) }
}

/**
 * Clamp a section's window to the page image it is cut from.
 *
 * A page that finished loading after it was measured is taller in the
 * measurement than in the screenshot, and an unclamped crop of it would read
 * past the end of the buffer.
 */
export function cropWindow(
  top: number,
  height: number,
  imageHeight: number,
): { top: number; height: number } {
  if (imageHeight <= 0) return { top: 0, height: 0 }
  const safeTop = Math.min(Math.max(0, Math.round(top)), imageHeight - 1)
  const safeHeight = Math.min(Math.max(1, Math.round(height)), imageHeight - safeTop)
  return { top: safeTop, height: safeHeight }
}

/**
 * Scale a box from image coordinates to the coordinates of the rendered column.
 *
 * Both halves of a composed image are drawn at the same width, so the same
 * scale applies to both and one set of boxes fits over either picture.
 */
export function scaleBox(box: Box, scale: number): Box {
  return {
    x: Math.round(box.x * scale),
    y: Math.round(box.y * scale),
    w: Math.max(1, Math.round(box.w * scale)),
    h: Math.max(1, Math.round(box.h * scale)),
  }
}
