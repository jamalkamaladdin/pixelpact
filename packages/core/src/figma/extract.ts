import { join } from 'node:path'
import { resolveExtractOptions } from '../defaults.js'
import { FigmaError } from '../errors.js'
import type {
  Contract,
  FigmaExtractOptions,
  ProgressEvent,
  Viewport,
  ViewportSnapshot,
} from '../types.js'
import { CONTRACT_VERSION } from '../types.js'
import {
  downloadFigmaImage,
  type FigmaRequest,
  fetchFigmaDocument,
  fetchFigmaImageUrl,
  resolveFigmaToken,
} from './client.js'
import { mapFigmaTree } from './map.js'
import { parseFigmaUrl } from './url.js'

/**
 * Extract a contract from a Figma file.
 *
 * The design is read over the Figma REST API, so no browser is launched and
 * nothing is rendered locally. Everything the API reports about a layer is
 * translated into the css a browser would compute for it, which is what lets
 * `check` and `diff` treat a Figma contract exactly like one taken from a live
 * page. Values that have no single css form, such as a gradient fill, are left
 * out and named in `warnings` instead of being guessed at.
 *
 * Matching works differently from a url contract, and that is the whole reason
 * `contractId` is the layer name: the implementation declares which element
 * answers for which layer through a `data-contract` attribute. A layer with no
 * such element is reported as missing, never guessed at from a tag name.
 *
 * @throws FigmaError when the url, the token, the file key or the node id is
 *   wrong, or when the layer holds nothing visible
 *
 * @example
 * ```ts
 * const contract = await extractFromFigma({
 *   url: 'https://www.figma.com/design/abc123XYZ/Site?node-id=1-23',
 *   token: process.env.FIGMA_TOKEN,
 *   screenshotDir: './pixelpact',
 * })
 * await writeContract('./pixelpact/contract.json', contract)
 * ```
 */
export async function extractFromFigma(options: FigmaExtractOptions): Promise<Contract> {
  const target = parseFigmaUrl(options.url ?? '')
  if (!target) {
    throw new FigmaError(
      `"${options.url}" is not a Figma file url. It should look like ` +
        'https://www.figma.com/design/<file-key>/<name>?node-id=1-23, which is what the ' +
        'Copy link button in Figma gives you.',
    )
  }

  const onProgress = options.onProgress
  const report = (event: ProgressEvent): void => {
    if (onProgress) onProgress(event)
  }

  const viewportName = options.viewportName ?? 'figma'
  const maxElements = options.maxElements ?? 600
  const screenshotDir = options.screenshotDir ?? null
  const nodeId = 'nodeId' in options ? (options.nodeId ?? null) : target.nodeId

  const request: FigmaRequest = {
    fileKey: target.fileKey,
    nodeId,
    token: resolveFigmaToken(options.token),
    sourceUrl: options.url,
  }

  report({ phase: 'navigate', message: `reading the Figma file ${target.fileKey}` })
  const document = await fetchFigmaDocument(request)

  report({ phase: 'extract', message: `mapping the layer tree of ${document.node.name}` })
  const mapping = mapFigmaTree({
    root: document.node,
    maxElements,
    styles: document.styles,
  })

  if (mapping.elements.length === 0) {
    throw new FigmaError(
      `The Figma layer "${document.node.name}" holds nothing visible, so there is nothing to ` +
        'put in a contract. Check the layer is not hidden, and point the url at the frame ' +
        'you want measured.',
    )
  }

  const warnings = [...mapping.warnings]
  if (mapping.truncated) {
    warnings.push(
      `The layer budget ran out after ${mapping.elements.length} of ${mapping.visibleTotal} ` +
        'visible layers, and the rest of the design is not in this contract. Raise ' +
        'maxElements, or point the url at a smaller frame.',
    )
  }

  const viewport: Viewport = {
    name: viewportName,
    width: mapping.size.width,
    height: mapping.size.height,
  }

  const screenshots: Record<string, string> = {}
  if (screenshotDir) {
    report({ phase: 'screenshot', message: 'rendering the reference png', viewport: viewportName })
    const path = join(screenshotDir, `reference-${viewportName}.png`)
    try {
      const href = await fetchFigmaImageUrl(
        { ...request, nodeId: document.nodeId },
        options.scale ?? 1,
      )
      await downloadFigmaImage(href, path)
      screenshots[viewportName] = path
    } catch (error) {
      // A contract without its png is still a contract, so this is reported
      // rather than thrown: only diff() needs the image.
      warnings.push(
        'The reference png could not be produced, so diff() has nothing to compare against: ' +
          (error instanceof Error ? error.message : String(error)),
      )
    }
  }

  const snapshot: ViewportSnapshot = {
    documentHeight: viewport.height,
    truncated: mapping.truncated,
    visibleTotal: mapping.visibleTotal,
    elements: mapping.elements,
  }

  report({ phase: 'done', message: 'contract ready' })

  return {
    version: CONTRACT_VERSION,
    source: { type: 'figma', value: options.url },
    figma: {
      fileKey: target.fileKey,
      nodeId: document.nodeId,
      fileName: document.fileName,
      lastModified: document.lastModified,
    },
    // The walk root of the implementation, not of the design: a Figma frame is
    // the whole picture, so a check measures the whole page against it.
    root: 'body',
    extractedAt: new Date().toISOString(),
    viewports: [viewport],
    masks: [],
    options: resolveExtractOptions({
      url: options.url,
      viewports: [viewport],
      maxElements,
      screenshotDir,
    }),
    tokens: mapping.tokens,
    keyframes: {},
    screenshots,
    byViewport: { [viewportName]: snapshot },
    warnings,
  }
}
