import type { ContractElement, KeyframeStep, PageExtractionResult, StyleMap } from './types.js'

/**
 * The DOM walker, executed inside the page.
 *
 * This function is handed to the browser as source text (`pageExtractor.toString()`)
 * and evaluated there, so at runtime it has no module around it: a reference to
 * anything declared outside would be `undefined` in the page and the walk would
 * throw. Everything it uses is therefore either a parameter, a browser global,
 * or declared in its own body. The only imports in this file are type-only,
 * which are erased before the function is ever stringified.
 *
 * Keep it free of TypeScript features that make the compiler emit helper
 * functions (enums, decorators, `using`, downlevelled class fields): a helper
 * would be defined next to the function rather than inside it, and would go
 * missing exactly the same way.
 *
 * @param props - kebab-case computed properties to record for every element
 * @param interactiveSelector - matches the elements worth probing for hover and focus
 * @param maxElements - element budget, `0` or less means unbounded
 * @param rootSelector - where the walk starts, `null` means `document.body`
 *
 * @example
 * ```ts
 * await page.addScriptTag({ content: `window.__pixelpact = ${pageExtractor.toString()}` })
 * const data = await page.evaluate(
 *   ([p, s, m, r]) => window.__pixelpact(p, s, m, r),
 *   [TRACKED_PROPS, INTERACTIVE_SELECTOR, 600, null],
 * )
 * ```
 */
export function pageExtractor(
  props: string[],
  interactiveSelector: string,
  maxElements: number,
  rootSelector: string | null,
): PageExtractionResult {
  const SKIP_TAGS = new Set([
    'SCRIPT',
    'STYLE',
    'META',
    'LINK',
    'TITLE',
    'HEAD',
    'NOSCRIPT',
    'BR',
    'TEMPLATE',
  ])

  const empty = (error: string | null): PageExtractionResult => ({
    url: location.href,
    title: document.title,
    root: rootSelector || 'body',
    tokens: {},
    keyframes: {},
    elements: [],
    truncated: false,
    visibleTotal: 0,
    documentHeight: document.documentElement.scrollHeight,
    error,
  })

  const contractIdOf = (el: Element): string | null => el.getAttribute('data-contract')

  /** A path that is stable enough to find the same node in a rebuilt DOM. */
  const cssPath = (el: Element): string => {
    const id = contractIdOf(el)
    if (id) return `[data-contract="${id}"]`
    const parts: string[] = []
    let node: Element | null = el
    while (node && node.nodeType === 1 && node.tagName !== 'HTML') {
      let part = node.tagName.toLowerCase()
      const parent: Element | null = node.parentElement
      if (parent) {
        const current: Element = node
        const sameTag = Array.from(parent.children).filter((c) => c.tagName === current.tagName)
        if (sameTag.length > 1) part += `:nth-of-type(${sameTag.indexOf(current) + 1})`
      }
      parts.unshift(part)
      node = node.parentElement
    }
    return parts.join(' > ')
  }

  const isVisible = (el: Element, rect: DOMRect, style: CSSStyleDeclaration): boolean => {
    if (SKIP_TAGS.has(el.tagName)) return false
    if (style.display === 'none' || style.visibility === 'hidden') return false
    if (Number.parseFloat(style.opacity) === 0) return false
    if (rect.width < 1 && rect.height < 1) return false
    return true
  }

  /** Text owned by the element itself, not by its children. */
  const ownText = (el: Element): string => {
    let text = ''
    for (const node of Array.from(el.childNodes)) {
      if (node.nodeType === 3) text += node.textContent ?? ''
    }
    return text.trim().replace(/\s+/g, ' ').slice(0, 120)
  }

  const collectStyles = (el: Element): StyleMap => {
    const cs = getComputedStyle(el)
    const out: StyleMap = {}
    for (const p of props) out[p] = cs.getPropertyValue(p).trim()
    return out
  }

  const classesOf = (el: Element): string[] => {
    const raw = el.className
    if (typeof raw !== 'string' || !raw.trim()) return []
    return raw.trim().split(/\s+/).slice(0, 6)
  }

  /** Pseudo element content is where missing icons and arrows hide. */
  const readPseudo = (el: Element, pseudo: string): StyleMap | null => {
    const ps = getComputedStyle(el, pseudo)
    const content = ps.content
    if (!content || content === 'none' || content === 'normal') return null
    return {
      content,
      width: ps.width,
      height: ps.height,
      'background-color': ps.backgroundColor,
      'background-image': ps.backgroundImage,
      transform: ps.transform,
    }
  }

  // Design tokens: custom properties declared on :root or html.
  const tokens: Record<string, string> = {}
  try {
    const rootStyle = getComputedStyle(document.documentElement)
    for (const sheet of Array.from(document.styleSheets)) {
      let rules: CSSRuleList | null = null
      try {
        rules = sheet.cssRules
      } catch {
        continue // cross-origin stylesheet, unreadable by design
      }
      for (const rule of Array.from(rules || [])) {
        const styleRule = rule as CSSStyleRule
        if (
          styleRule.style &&
          styleRule.selectorText &&
          /:root|html/.test(styleRule.selectorText)
        ) {
          for (const name of Array.from(styleRule.style)) {
            if (name.startsWith('--')) tokens[name] = rootStyle.getPropertyValue(name).trim()
          }
        }
      }
    }
  } catch {
    // no readable stylesheets at all
  }

  const keyframes: Record<string, KeyframeStep[]> = {}
  try {
    for (const sheet of Array.from(document.styleSheets)) {
      let rules: CSSRuleList | null = null
      try {
        rules = sheet.cssRules
      } catch {
        continue
      }
      for (const rule of Array.from(rules || [])) {
        const isKeyframes =
          rule.type === CSSRule.KEYFRAMES_RULE || rule.constructor.name === 'CSSKeyframesRule'
        if (!isKeyframes) continue
        const kf = rule as CSSKeyframesRule
        keyframes[kf.name] = Array.from(kf.cssRules).map((step) => ({
          offset: (step as CSSKeyframeRule).keyText,
          css: (step as CSSKeyframeRule).style.cssText,
        }))
      }
    }
  } catch {
    // ignore, animations are reported as absent
  }

  const root = rootSelector ? document.querySelector(rootSelector) : document.body
  if (!root) return empty(`root selector matched no element: ${rootSelector}`)

  const all = Array.from(root.querySelectorAll('*'))
  const interactive = new Set(Array.from(root.querySelectorAll(interactiveSelector)))
  const cap = maxElements && maxElements > 0 ? maxElements : Number.POSITIVE_INFINITY

  let visibleTotal = 0
  let truncated = false
  const elements: ContractElement[] = []

  for (const el of all) {
    if (elements.length >= cap) {
      truncated = true
      break
    }
    const rect = el.getBoundingClientRect()
    const cs = getComputedStyle(el)
    if (!isVisible(el, rect, cs)) continue
    visibleTotal++

    const record: ContractElement = {
      selector: cssPath(el),
      tag: el.tagName.toLowerCase(),
      contractId: contractIdOf(el),
      classes: classesOf(el),
      text: ownText(el),
      box: {
        x: Math.round(rect.x * 100) / 100,
        y: Math.round((rect.y + window.scrollY) * 100) / 100,
        w: Math.round(rect.width * 100) / 100,
        h: Math.round(rect.height * 100) / 100,
      },
      styles: collectStyles(el),
      interactive: interactive.has(el),
    }

    const before = readPseudo(el, '::before')
    if (before) record.before = before
    const after = readPseudo(el, '::after')
    if (after) record.after = after

    elements.push(record)
  }

  // Report how much of the page was left out instead of silently hiding it.
  if (truncated) {
    visibleTotal = 0
    for (const el of all) {
      if (isVisible(el, el.getBoundingClientRect(), getComputedStyle(el))) visibleTotal++
    }
  }

  return {
    url: location.href,
    title: document.title,
    root: rootSelector || 'body',
    tokens,
    keyframes,
    elements,
    truncated,
    visibleTotal,
    documentHeight: document.documentElement.scrollHeight,
    error: null,
  }
}
