/**
 * pixelpact core: measure a reference page, store what it looks like as a
 * contract, then hold an implementation to it.
 *
 * @example
 * ```ts
 * import { check, extract, formatCheckReport, writeContract } from 'pixelpact-core'
 *
 * const contract = await extract({ url: 'https://reference.example', selector: 'main' })
 * await writeContract('./pixelpact/contract.json', contract)
 *
 * const report = await check(contract, { url: 'http://localhost:3000' })
 * process.stdout.write(formatCheckReport(report, { color: true }))
 * ```
 *
 * @packageDocumentation
 */

export { check } from './check.js'
export { parseContract, readContract, writeContract } from './contract.js'
export { DEFAULT_VIEWPORTS } from './defaults.js'
export { diff } from './diff.js'
export {
  BlockedPageError,
  BrowserUnavailableError,
  ContractError,
  FigmaError,
  PixelpactError,
  TargetNotFoundError,
} from './errors.js'
export { extract } from './extract.js'
export { extractFromFigma } from './figma/extract.js'
export { FIGMA_MATCH_RULE } from './figma/map.js'
export type { FigmaTarget } from './figma/url.js'
export { isFigmaUrl, parseFigmaUrl } from './figma/url.js'
export { figmaMatchHint, formatCheckReport, formatDiffReport } from './report.js'
export type {
  Box,
  BrowserOptions,
  CheckOptions,
  CheckReport,
  Contract,
  ContractElement,
  ContractSource,
  Deviation,
  DeviationState,
  DiffOptions,
  DiffReport,
  ExtractOptions,
  FigmaExtractOptions,
  FigmaOrigin,
  FormatOptions,
  KeyframeStep,
  ProgressEvent,
  SerializedExtractOptions,
  StyleMap,
  Viewport,
  ViewportSnapshot,
} from './types.js'
export { CONTRACT_VERSION } from './types.js'
