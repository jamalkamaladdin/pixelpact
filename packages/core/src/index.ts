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
  PixelpactError,
  TargetNotFoundError,
} from './errors.js'
export { extract } from './extract.js'
export { formatCheckReport, formatDiffReport } from './report.js'
export type {
  Box,
  BrowserOptions,
  CheckOptions,
  CheckReport,
  Contract,
  ContractElement,
  Deviation,
  DeviationState,
  DiffOptions,
  DiffReport,
  ExtractOptions,
  FormatOptions,
  KeyframeStep,
  ProgressEvent,
  SerializedExtractOptions,
  StyleMap,
  Viewport,
  ViewportSnapshot,
} from './types.js'
export { CONTRACT_VERSION } from './types.js'
