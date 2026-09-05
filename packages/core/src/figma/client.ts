import { mkdir, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { FigmaError } from '../errors.js'
import type { FigmaNode, FigmaStyleMeta } from './map.js'

/** Base of the Figma REST API. */
const API = 'https://api.figma.com'

/** The subtree one request brought back, with the file it came from. */
export interface FigmaDocument {
  /** Root of the walk: the requested node, or the first page of the file. */
  node: FigmaNode
  /** The node actually read, or `null` when the whole file was used. */
  nodeId: string | null
  fileName: string
  lastModified: string
  /** The file level style map, keyed by style id. */
  styles: Record<string, FigmaStyleMeta>
}

/** What every call needs: which file, which node, and who is asking. */
export interface FigmaRequest {
  fileKey: string
  nodeId: string | null
  token: string
  /** The original url, quoted back in error messages so the user sees the source. */
  sourceUrl: string
}

/**
 * Find the token to authenticate with.
 *
 * @throws FigmaError when neither the argument nor `FIGMA_TOKEN` has a value,
 *   naming the variable to set
 *
 * @example
 * ```ts
 * const token = resolveFigmaToken(options.token)
 * ```
 */
export function resolveFigmaToken(token?: string): string {
  const value = (token ?? process.env.FIGMA_TOKEN ?? '').trim()
  if (value.length === 0) {
    throw new FigmaError(
      'No Figma token. Set the FIGMA_TOKEN environment variable, or pass { token } to ' +
        'extractFromFigma(). A token is created in Figma under Settings, Security, ' +
        'Personal access tokens, and needs file content read access.',
    )
  }
  return value
}

/** Pull the human readable part out of a Figma error body, if there is one. */
function messageOf(body: string): string {
  try {
    const parsed: unknown = JSON.parse(body)
    if (parsed && typeof parsed === 'object') {
      const record = parsed as Record<string, unknown>
      const text = record.err ?? record.message
      if (typeof text === 'string' && text.length > 0) return text
    }
  } catch {
    // Not JSON, fall through to the raw text.
  }
  return body.slice(0, 200).trim()
}

/**
 * Turn an HTTP status from Figma into an error that says what to do next.
 *
 * The four statuses Figma actually answers with each mean something specific,
 * and each has a different fix, so none of them is reported as a bare number.
 */
function apiError(status: number, body: string, request: FigmaRequest): FigmaError {
  const detail = messageOf(body)
  const suffix = detail ? ` Figma said: ${detail}` : ''

  if (status === 401) {
    return new FigmaError(
      'Figma rejected the token (401). It is expired, mistyped, or not a personal access ' +
        'token. Create a new one under Settings, Security, Personal access tokens, and put ' +
        `it in FIGMA_TOKEN.${suffix}`,
    )
  }
  if (status === 403) {
    return new FigmaError(
      `The token cannot read the Figma file "${request.fileKey}" (403). The token itself is ` +
        'valid, so the account behind it has no access to that file. Open the file in Figma ' +
        `with the same account, or ask the owner for view access.${suffix}`,
    )
  }
  if (status === 404) {
    return new FigmaError(
      `Figma has no file with the key "${request.fileKey}" (404). The key was read out of ` +
        `${request.sourceUrl}. Check it against the url that Figma's Copy link gives you.` +
        suffix,
    )
  }
  if (status === 429) {
    return new FigmaError(
      'Figma rate limited this token (429). The REST API allows a limited number of file ' +
        `reads per minute, so wait a minute and run it again.${suffix}`,
    )
  }
  return new FigmaError(`The Figma API answered ${status} for file "${request.fileKey}".${suffix}`)
}

/** One authenticated GET, with network failure and status mapped to FigmaError. */
async function get(path: string, request: FigmaRequest): Promise<unknown> {
  let response: Response
  try {
    response = await fetch(`${API}${path}`, {
      headers: { 'X-Figma-Token': request.token, Accept: 'application/json' },
    })
  } catch (error) {
    throw new FigmaError(
      'Could not reach api.figma.com: ' +
        (error instanceof Error ? error.message : String(error)) +
        '. Check the network connection and any proxy settings.',
      { cause: error },
    )
  }

  if (!response.ok) {
    const body = await response.text().catch(() => '')
    throw apiError(response.status, body, request)
  }

  try {
    return (await response.json()) as unknown
  } catch (error) {
    throw new FigmaError('The Figma API answered with something that is not JSON.', {
      cause: error,
    })
  }
}

/** Narrow an unknown value to a plain object without reaching for `any`. */
function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
}

const asString = (value: unknown, fallback: string): string =>
  typeof value === 'string' && value.length > 0 ? value : fallback

const asStyles = (value: unknown): Record<string, FigmaStyleMeta> =>
  value && typeof value === 'object' ? (value as Record<string, FigmaStyleMeta>) : {}

/**
 * Read one node subtree, or the first page when no node was named.
 *
 * A url that points at a layer gives a node id, and only that subtree is
 * fetched. A url that points at the file as a whole has nothing to narrow by,
 * so the file is read and its first page becomes the root.
 *
 * @throws FigmaError when the token, the file key or the node id is wrong
 *
 * @example
 * ```ts
 * const document = await fetchFigmaDocument({ fileKey, nodeId, token, sourceUrl })
 * ```
 */
export async function fetchFigmaDocument(request: FigmaRequest): Promise<FigmaDocument> {
  if (request.nodeId) {
    const path = `/v1/files/${encodeURIComponent(request.fileKey)}/nodes?ids=${encodeURIComponent(
      request.nodeId,
    )}&geometry=paths`
    const payload = asRecord(await get(path, request))
    const nodes = asRecord(payload.nodes)
    const entry = asRecord(nodes[request.nodeId] ?? Object.values(nodes)[0])
    const node = entry.document as FigmaNode | undefined

    if (!node || typeof node.id !== 'string') {
      throw new FigmaError(
        `The Figma file "${request.fileKey}" has no node "${request.nodeId}". That node id ` +
          `was read out of ${request.sourceUrl}. Select the frame in Figma, use Copy link to ` +
          'selection, and extract from that url.',
      )
    }

    return {
      node,
      nodeId: node.id,
      fileName: asString(payload.name, request.fileKey),
      lastModified: asString(payload.lastModified, ''),
      styles: asStyles(entry.styles),
    }
  }

  const payload = asRecord(await get(`/v1/files/${encodeURIComponent(request.fileKey)}`, request))
  const document = payload.document as FigmaNode | undefined
  const page = document?.children?.[0]

  if (!page) {
    throw new FigmaError(
      `The Figma file "${request.fileKey}" has no pages to read. Add a node id to the url, ` +
        'for example ?node-id=1-23, to extract one frame instead.',
    )
  }

  return {
    node: page,
    nodeId: null,
    fileName: asString(payload.name, request.fileKey),
    lastModified: asString(payload.lastModified, ''),
    styles: asStyles(payload.styles),
  }
}

/**
 * Ask Figma to render a node as a png and return the temporary url it lands on.
 *
 * The url Figma answers with expires, so it is downloaded straight away by
 * {@link downloadFigmaImage} rather than stored.
 *
 * @param scale - render scale, clamped to the 0.01 to 4 the API accepts
 * @throws FigmaError when the node cannot be rendered
 *
 * @example
 * ```ts
 * const href = await fetchFigmaImageUrl(request, 2)
 * ```
 */
export async function fetchFigmaImageUrl(request: FigmaRequest, scale: number): Promise<string> {
  if (!request.nodeId) {
    throw new FigmaError(
      'A reference png needs a node to render. Add a node id to the url, for example ' +
        '?node-id=1-23, or leave screenshotDir unset.',
    )
  }

  const safeScale = Math.min(4, Math.max(0.01, Number.isFinite(scale) ? scale : 1))
  const path =
    `/v1/images/${encodeURIComponent(request.fileKey)}` +
    `?ids=${encodeURIComponent(request.nodeId)}&format=png&scale=${safeScale}`
  const payload = asRecord(await get(path, request))

  const err = payload.err
  if (typeof err === 'string' && err.length > 0) {
    throw new FigmaError(`Figma could not render node "${request.nodeId}" as a png: ${err}`)
  }

  const images = asRecord(payload.images)
  const href = images[request.nodeId] ?? Object.values(images)[0]
  if (typeof href !== 'string' || href.length === 0) {
    throw new FigmaError(
      `Figma returned no image for node "${request.nodeId}". A page or a layer with nothing ` +
        'painted in it cannot be rendered; point the url at a frame instead.',
    )
  }
  return href
}

/**
 * Download a rendered png to disk, creating the directory if it is missing.
 *
 * @throws FigmaError when the temporary url has expired or the write fails
 *
 * @example
 * ```ts
 * await downloadFigmaImage(href, './pixelpact/reference-figma.png')
 * ```
 */
export async function downloadFigmaImage(href: string, path: string): Promise<void> {
  let response: Response
  try {
    response = await fetch(href)
  } catch (error) {
    throw new FigmaError(
      'Could not download the rendered png from Figma: ' +
        (error instanceof Error ? error.message : String(error)),
      { cause: error },
    )
  }

  if (!response.ok) {
    throw new FigmaError(
      `Downloading the rendered png failed with ${response.status}. The link Figma hands out ` +
        'is temporary, so try the extraction again.',
    )
  }

  const bytes = Buffer.from(await response.arrayBuffer())
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, bytes)
}
