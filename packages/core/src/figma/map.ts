import type { Box, ContractElement, StyleMap } from '../types.js'

/** A colour as Figma stores it: every channel between 0 and 1. */
export interface FigmaColor {
  r: number
  g: number
  b: number
  a?: number
}

/** One entry of a `fills` or `strokes` array. */
export interface FigmaPaint {
  type: string
  visible?: boolean
  /** Paint level alpha, multiplied with the colour's own alpha. */
  opacity?: number
  color?: FigmaColor
}

/** One entry of an `effects` array. Only `DROP_SHADOW` is mapped. */
export interface FigmaEffect {
  type: string
  visible?: boolean
  color?: FigmaColor
  offset?: { x: number; y: number }
  /** Blur radius. */
  radius?: number
  spread?: number
}

/** The typography block Figma puts on a `TEXT` node. */
export interface FigmaTextStyle {
  fontFamily?: string
  fontWeight?: number
  fontSize?: number
  letterSpacing?: number
  /** Line height in absolute pixels. */
  lineHeightPx?: number
  /** Line height as a percentage, used when the designer set a relative value. */
  lineHeightPercent?: number
  textAlignHorizontal?: string
  textCase?: string
}

/** Position and size in the file's absolute coordinate space. */
export interface FigmaRect {
  x: number
  y: number
  width: number
  height: number
}

/**
 * A node of the Figma document tree, narrowed to the fields that describe how
 * the layer looks. The REST API returns more; everything else is ignored.
 */
export interface FigmaNode {
  id: string
  name: string
  type: string
  /** Absent means visible. `false` skips the node and everything under it. */
  visible?: boolean
  opacity?: number
  absoluteBoundingBox?: FigmaRect | null
  fills?: FigmaPaint[]
  strokes?: FigmaPaint[]
  strokeWeight?: number
  cornerRadius?: number
  /** Per corner radii in the order top left, top right, bottom right, bottom left. */
  rectangleCornerRadii?: number[]
  effects?: FigmaEffect[]
  /** Text content, on `TEXT` nodes only. */
  characters?: string
  style?: FigmaTextStyle
  layoutMode?: string
  itemSpacing?: number
  paddingTop?: number
  paddingRight?: number
  paddingBottom?: number
  paddingLeft?: number
  primaryAxisAlignItems?: string
  counterAxisAlignItems?: string
  /** Style ids this node references, keyed by the property they paint. */
  styles?: Record<string, string>
  children?: FigmaNode[]
}

/** One entry of the file level `styles` map: the name behind a style id. */
export interface FigmaStyleMeta {
  key?: string
  name: string
  styleType: string
}

/** Everything a walk of one Figma subtree produces. */
export interface FigmaMapping {
  elements: ContractElement[]
  /** Colour styles used in the subtree, keyed by the style name. */
  tokens: Record<string, string>
  warnings: string[]
  /** True when the layer budget stopped the walk before the end of the tree. */
  truncated: boolean
  visibleTotal: number
  /** Size of the root frame, which becomes the contract's single viewport. */
  size: { width: number; height: number }
}

/** Input to {@link mapFigmaTree}. */
export interface MapFigmaTreeOptions {
  root: FigmaNode
  /** Layer budget. Default `600`. `0` means unbounded. */
  maxElements?: number
  /** The file level style map, used to name the colour tokens. */
  styles?: Record<string, FigmaStyleMeta>
}

/**
 * The one sentence that explains how a Figma contract is matched.
 *
 * Exported so the library, the CLI and the MCP server all say the same thing
 * about the same limitation instead of each inventing its own wording.
 */
export const FIGMA_MATCH_RULE =
  'A Figma layer has no css selector, so a Figma contract is matched through the ' +
  'data-contract attribute: put data-contract="Hero/CTA" on the element that implements ' +
  'the layer named Hero/CTA.'

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value))

const round = (value: number, places: number): number => {
  const factor = 10 ** places
  return Math.round(value * factor) / factor
}

/**
 * Render a Figma colour as the css string a browser would compute.
 *
 * Figma keeps channels between 0 and 1, css wants 0 to 255. Alpha is the
 * colour's own alpha times the paint's opacity, and a fully opaque colour is
 * written as `rgb()` because that is what `getComputedStyle` returns.
 *
 * @param opacity - paint level opacity, multiplied into the alpha channel
 *
 * @example
 * ```ts
 * figmaColor({ r: 1, g: 0, b: 0 })              // 'rgb(255, 0, 0)'
 * figmaColor({ r: 0, g: 0, b: 0, a: 0.5 })      // 'rgba(0, 0, 0, 0.5)'
 * ```
 */
export function figmaColor(color: FigmaColor, opacity = 1): string {
  const channel = (value: number): number => Math.round(clamp01(value) * 255)
  const r = channel(color.r)
  const g = channel(color.g)
  const b = channel(color.b)
  const alpha = round(clamp01((color.a ?? 1) * clamp01(opacity)), 3)
  if (alpha >= 1) return `rgb(${r}, ${g}, ${b})`
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

/**
 * The colour of the first visible paint in a `fills` or `strokes` array.
 *
 * A gradient or an image paint has no single colour, so instead of inventing
 * one the layer is named in a warning and the property is left out of the
 * contract. A missing property is checked against nothing; a wrong one would
 * fail an implementation that is correct.
 *
 * @param kind - the word used in the warning, `fill` or `stroke`
 * @returns the css colour, or `null` when there is nothing solid to read
 */
export function paintColor(
  paints: FigmaPaint[] | undefined,
  kind: string,
  node: Pick<FigmaNode, 'id' | 'name'>,
  warnings: string[],
): string | null {
  const visible = (paints ?? []).filter((paint) => paint.visible !== false)
  const paint = visible[0]
  if (!paint) return null
  if (paint.type === 'SOLID' && paint.color) return figmaColor(paint.color, paint.opacity ?? 1)
  warnings.push(
    `Layer "${node.name}" (${node.id}) has a ${paint.type} ${kind}, which is not a single ` +
      'css colour. That property was left out of the contract, so nothing is asserted about it.',
  )
  return null
}

const TEXT_ALIGN: Record<string, string> = {
  LEFT: 'left',
  RIGHT: 'right',
  CENTER: 'center',
  JUSTIFIED: 'justify',
}

const TEXT_CASE: Record<string, string> = {
  ORIGINAL: 'none',
  UPPER: 'uppercase',
  LOWER: 'lowercase',
  TITLE: 'capitalize',
}

const FLEX_DIRECTION: Record<string, string> = {
  HORIZONTAL: 'row',
  VERTICAL: 'column',
}

const AXIS_ALIGN: Record<string, string> = {
  MIN: 'flex-start',
  CENTER: 'center',
  MAX: 'flex-end',
  SPACE_BETWEEN: 'space-between',
  BASELINE: 'baseline',
}

/**
 * Map the typography block of a `TEXT` node.
 *
 * Figma stores line height in one of two forms and css accepts both: an
 * absolute `lineHeightPx` becomes a px value, a relative `lineHeightPercent`
 * becomes the unitless ratio css treats as a multiple of the font size. Letter
 * spacing of zero is written as `normal`, which is what a browser computes for
 * text nobody tracked.
 */
function textStyles(style: FigmaTextStyle, out: StyleMap): void {
  if (style.fontFamily) out['font-family'] = style.fontFamily
  if (typeof style.fontSize === 'number') out['font-size'] = `${round(style.fontSize, 2)}px`
  if (typeof style.fontWeight === 'number') out['font-weight'] = String(style.fontWeight)

  if (typeof style.lineHeightPx === 'number') {
    out['line-height'] = `${round(style.lineHeightPx, 2)}px`
  } else if (typeof style.lineHeightPercent === 'number') {
    out['line-height'] = String(round(style.lineHeightPercent / 100, 2))
  }

  if (typeof style.letterSpacing === 'number') {
    out['letter-spacing'] =
      style.letterSpacing === 0 ? 'normal' : `${round(style.letterSpacing, 2)}px`
  }

  const align = style.textAlignHorizontal && TEXT_ALIGN[style.textAlignHorizontal]
  if (align) out['text-align'] = align

  const transform = style.textCase && TEXT_CASE[style.textCase]
  if (transform) out['text-transform'] = transform
}

/**
 * Map an auto layout frame to the flex properties it stands for.
 *
 * Padding is written even when it is zero, because a browser always computes a
 * length for padding and the two agree. Gap is written only when it is
 * positive: a browser computes `normal` for a gap nobody set, and `0px`
 * against `normal` would read as a difference where there is none.
 */
function layoutStyles(node: FigmaNode, out: StyleMap): void {
  const direction = node.layoutMode && FLEX_DIRECTION[node.layoutMode]
  if (!direction) return

  out.display = 'flex'
  out['flex-direction'] = direction

  if (typeof node.itemSpacing === 'number' && node.itemSpacing > 0) {
    out.gap = `${round(node.itemSpacing, 2)}px`
  }

  const paddings: Array<[keyof FigmaNode, string]> = [
    ['paddingTop', 'padding-top'],
    ['paddingRight', 'padding-right'],
    ['paddingBottom', 'padding-bottom'],
    ['paddingLeft', 'padding-left'],
  ]
  for (const [field, property] of paddings) {
    const value = node[field]
    if (typeof value === 'number') out[property] = `${round(value, 2)}px`
  }

  const counter = node.counterAxisAlignItems && AXIS_ALIGN[node.counterAxisAlignItems]
  if (counter) out['align-items'] = counter

  const primary = node.primaryAxisAlignItems && AXIS_ALIGN[node.primaryAxisAlignItems]
  if (primary) out['justify-content'] = primary
}

/**
 * Map the border of a node.
 *
 * The four width longhands and `border-top-color` are written rather than the
 * `border` shorthand, because those are the properties a browser reports and
 * therefore the only ones a check can compare.
 */
function borderStyles(node: FigmaNode, out: StyleMap, warnings: string[]): void {
  const hasStroke = (node.strokes ?? []).some((stroke) => stroke.visible !== false)
  if (!hasStroke) return

  if (typeof node.strokeWeight === 'number' && node.strokeWeight > 0) {
    const width = `${round(node.strokeWeight, 2)}px`
    out['border-top-width'] = width
    out['border-right-width'] = width
    out['border-bottom-width'] = width
    out['border-left-width'] = width
    out['border-top-style'] = 'solid'
  }

  const colour = paintColor(node.strokes, 'stroke', node, warnings)
  if (colour) out['border-top-color'] = colour
}

/**
 * Map corner radii.
 *
 * `rectangleCornerRadii` lists the four corners clockwise from the top left;
 * `cornerRadius` is the single value used when they are all the same. Both end
 * up as the four longhands, which is what a browser computes.
 */
function radiusStyles(node: FigmaNode, out: StyleMap): void {
  const corners = ['top-left', 'top-right', 'bottom-right', 'bottom-left']
  const radii = node.rectangleCornerRadii

  if (Array.isArray(radii) && radii.length === 4) {
    radii.forEach((value, index) => {
      if (typeof value === 'number') out[`border-${corners[index]}-radius`] = `${round(value, 2)}px`
    })
    return
  }

  if (typeof node.cornerRadius === 'number') {
    const value = `${round(node.cornerRadius, 2)}px`
    for (const corner of corners) out[`border-${corner}-radius`] = value
  }
}

/**
 * Map drop shadows to `box-shadow`, in the order css authors write them:
 * offset x, offset y, blur, spread, colour.
 */
function shadowStyles(node: FigmaNode, out: StyleMap): void {
  const shadows = (node.effects ?? [])
    .filter((effect) => effect.type === 'DROP_SHADOW' && effect.visible !== false)
    .map((effect) => {
      const x = round(effect.offset?.x ?? 0, 2)
      const y = round(effect.offset?.y ?? 0, 2)
      const blur = round(effect.radius ?? 0, 2)
      const spread = round(effect.spread ?? 0, 2)
      const colour = effect.color ? figmaColor(effect.color) : 'rgb(0, 0, 0)'
      return `${x}px ${y}px ${blur}px ${spread}px ${colour}`
    })
  if (shadows.length > 0) out['box-shadow'] = shadows.join(', ')
}

/**
 * Every style one node contributes, and nothing else.
 *
 * A property is written only when the node actually carries the value behind
 * it. A Figma layer says nothing about hover, focus or pseudo elements, so
 * those stay out of the contract entirely and a check never asserts them.
 *
 * @param warnings - collector, appended to when a value cannot be represented
 *
 * @example
 * ```ts
 * const warnings: string[] = []
 * mapNodeStyles({ id: '1:2', name: 'Card', type: 'FRAME', cornerRadius: 8 }, warnings)
 * // { 'border-top-left-radius': '8px', ... }
 * ```
 */
export function mapNodeStyles(node: FigmaNode, warnings: string[]): StyleMap {
  const styles: StyleMap = {}

  const fill = paintColor(node.fills, 'fill', node, warnings)
  if (fill) styles[node.type === 'TEXT' ? 'color' : 'background-color'] = fill

  borderStyles(node, styles, warnings)
  radiusStyles(node, styles)
  shadowStyles(node, styles)
  layoutStyles(node, styles)
  if (node.type === 'TEXT' && node.style) textStyles(node.style, styles)

  if (typeof node.opacity === 'number' && node.opacity !== 1) {
    styles.opacity = String(round(node.opacity, 3))
  }

  return styles
}

/** Translate the node's absolute box so the root of the walk sits at 0, 0. */
function mapBox(node: FigmaNode, origin: { x: number; y: number }): Box {
  const rect = node.absoluteBoundingBox
  if (!rect) return { x: 0, y: 0, w: 0, h: 0 }
  return {
    x: round(rect.x - origin.x, 2),
    y: round(rect.y - origin.y, 2),
    w: round(rect.width, 2),
    h: round(rect.height, 2),
  }
}

/**
 * Map one Figma node to a contract element.
 *
 * `contractId` is the layer name and is the only thing matching runs on, so it
 * is passed through unchanged: a layer named `Hero/CTA` is matched by
 * `data-contract="Hero/CTA"`. `selector` is a display label rather than a css
 * path, because a Figma layer has no css path and a made up one would match
 * the wrong element.
 *
 * @param origin - absolute position of the root of the walk
 * @param warnings - collector, appended to when a value cannot be represented
 *
 * @example
 * ```ts
 * const element = mapFigmaNode(node, { x: 0, y: 0 }, [])
 * element.selector // 'figma:1:23'
 * ```
 */
export function mapFigmaNode(
  node: FigmaNode,
  origin: { x: number; y: number },
  warnings: string[],
): ContractElement {
  return {
    selector: `figma:${node.id}`,
    tag: String(node.type ?? '').toLowerCase(),
    contractId: node.name,
    classes: [],
    text: node.type === 'TEXT' ? (node.characters ?? '') : '',
    box: mapBox(node, origin),
    styles: mapNodeStyles(node, warnings),
    // Figma has no hover state to read, so nothing here is interactive.
    interactive: false,
  }
}

/** Record the colour of a node under the name of the colour style it uses. */
function collectToken(
  node: FigmaNode,
  styles: StyleMap,
  meta: Record<string, FigmaStyleMeta> | undefined,
  tokens: Record<string, string>,
): void {
  const styleId = node.styles?.fill
  if (!styleId || !meta) return
  const entry = meta[styleId]
  if (entry?.styleType !== 'FILL') return
  const colour = styles.color ?? styles['background-color']
  if (colour && !(entry.name in tokens)) tokens[entry.name] = colour
}

/**
 * Union of the boxes on the shallowest level that has any.
 *
 * A url can point at a page rather than a frame, and a page carries no
 * `absoluteBoundingBox`. Its children are the artboards, so their union is the
 * design. Going deeper would be wrong: a frame that clips its content still
 * reports children far outside itself, and those would inflate the size of a
 * design nobody can see.
 */
function unionBounds(root: FigmaNode): FigmaRect | null {
  let level = (root.children ?? []).filter((node) => node.visible !== false)

  while (level.length > 0) {
    const boxed = level.filter((node) => node.absoluteBoundingBox)
    if (boxed.length > 0) {
      let left = Number.POSITIVE_INFINITY
      let top = Number.POSITIVE_INFINITY
      let right = Number.NEGATIVE_INFINITY
      let bottom = Number.NEGATIVE_INFINITY
      for (const node of boxed) {
        const rect = node.absoluteBoundingBox as FigmaRect
        left = Math.min(left, rect.x)
        top = Math.min(top, rect.y)
        right = Math.max(right, rect.x + rect.width)
        bottom = Math.max(bottom, rect.y + rect.height)
      }
      return { x: left, y: top, width: right - left, height: bottom - top }
    }
    level = level.flatMap((node) => (node.children ?? []).filter((c) => c.visible !== false))
  }

  return null
}

/**
 * Size of the design: the root frame when the url named one, otherwise the artboards it
 * contains. The extent of the mapped layers is only a last resort, because a frame that clips
 * its content still reports children beyond its own edges.
 */
function rootSize(
  root: FigmaNode,
  bounds: FigmaRect | null,
  elements: ContractElement[],
): { width: number; height: number } {
  const rect = root.absoluteBoundingBox ?? bounds
  if (rect && rect.width > 0 && rect.height > 0) {
    return {
      width: Math.max(1, Math.round(rect.width)),
      height: Math.max(1, Math.round(rect.height)),
    }
  }
  let width = 0
  let height = 0
  for (const element of elements) {
    width = Math.max(width, element.box.x + element.box.w)
    height = Math.max(height, element.box.y + element.box.h)
  }
  return { width: Math.max(1, Math.round(width)), height: Math.max(1, Math.round(height)) }
}

/**
 * Walk a Figma subtree depth first and turn it into contract elements.
 *
 * Pure: it touches no network and no disk, so the whole mapping can be tested
 * against a recorded API response. Hidden layers are skipped along with
 * everything under them, because a layer nobody can see is not part of how the
 * design looks.
 *
 * @example
 * ```ts
 * const { elements, warnings } = mapFigmaTree({ root: response.nodes['1:23'].document })
 * ```
 */
export function mapFigmaTree(options: MapFigmaTreeOptions): FigmaMapping {
  const budget = options.maxElements ?? 600
  const unbounded = budget === 0
  const bounds = unionBounds(options.root)
  const origin = options.root.absoluteBoundingBox ?? bounds ?? { x: 0, y: 0 }

  const elements: ContractElement[] = []
  const tokens: Record<string, string> = {}
  const warnings: string[] = []
  let visibleTotal = 0

  const walk = (node: FigmaNode): void => {
    if (node.visible === false) return

    // A node with no box, a page or the document itself, cannot be compared with
    // anything in a browser, so it is walked through rather than recorded.
    if (!node.absoluteBoundingBox) {
      for (const child of node.children ?? []) walk(child)
      return
    }

    visibleTotal++

    if (unbounded || elements.length < budget) {
      const element = mapFigmaNode(node, origin, warnings)
      elements.push(element)
      collectToken(node, element.styles, options.styles, tokens)
    }

    for (const child of node.children ?? []) walk(child)
  }

  walk(options.root)

  return {
    elements,
    tokens,
    warnings,
    truncated: !unbounded && visibleTotal > elements.length,
    visibleTotal,
    size: rootSize(options.root, bounds, elements),
  }
}
