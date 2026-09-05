/** What a figma.com url points at. */
export interface FigmaTarget {
  /** The file key, the opaque id in the second path segment. */
  fileKey: string
  /** Node id in the API's colon form, or `null` when the url names no node. */
  nodeId: string | null
}

/** The url path segments that introduce a file key. */
const FILE_SEGMENTS = new Set(['file', 'design', 'proto', 'board', 'slides'])

/** File keys are opaque, alphanumeric and never short. */
const FILE_KEY = /^[A-Za-z0-9]{8,}$/

/**
 * Turn a node id from a url into the form the REST API uses.
 *
 * Figma writes `1:23` as `1-23` in a url because a colon has to be escaped.
 * A value that already carries a colon is left alone, so a hand written
 * `node-id=1:23` and a copied `node-id=1-23` both arrive as `1:23`.
 */
function normaliseNodeId(raw: string): string | null {
  const value = raw.trim()
  if (value.length === 0) return null
  if (value.includes(':')) return value
  return value.replace(/-/g, ':')
}

/**
 * Read the file key and node id out of a figma.com url.
 *
 * Both url shapes Figma has shipped are accepted: the current
 * `figma.com/design/<key>/<name>` and the older `figma.com/file/<key>/<name>`,
 * as well as `proto`, `board` and `slides`. Anything that is not a figma.com
 * url, or that carries no file key, returns `null` rather than a guess.
 *
 * @returns the parsed target, or `null` when the input is not a figma file url
 *
 * @example
 * ```ts
 * parseFigmaUrl('https://www.figma.com/design/abc123XYZ/Site?node-id=1-23')
 * // { fileKey: 'abc123XYZ', nodeId: '1:23' }
 * ```
 */
export function parseFigmaUrl(input: string): FigmaTarget | null {
  const text = String(input ?? '').trim()
  if (text.length === 0) return null

  let url: URL
  try {
    url = new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`)
  } catch {
    return null
  }

  const host = url.hostname.toLowerCase()
  if (host !== 'figma.com' && !host.endsWith('.figma.com')) return null

  const segments = url.pathname.split('/').filter(Boolean).map(decodeURIComponent)
  const index = segments.findIndex((segment) => FILE_SEGMENTS.has(segment.toLowerCase()))
  if (index === -1) return null

  const fileKey = segments[index + 1]
  if (!fileKey || !FILE_KEY.test(fileKey)) return null

  const raw = url.searchParams.get('node-id')
  return { fileKey, nodeId: raw === null ? null : normaliseNodeId(raw) }
}

/**
 * True when a string is a figma.com url a file key can be read out of.
 *
 * This is the test a caller uses to decide between `extract` and
 * `extractFromFigma` without having to catch an error first.
 *
 * @example
 * ```ts
 * isFigmaUrl('https://www.figma.com/file/abc123XYZ/Site') // true
 * isFigmaUrl('https://example.com') // false
 * ```
 */
export function isFigmaUrl(input: string): boolean {
  return parseFigmaUrl(input) !== null
}
