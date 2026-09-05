import type { CheckReport } from 'pixelpact-core'
import {
  check,
  diff,
  extract,
  formatCheckReport,
  readContract,
  writeContract,
} from 'pixelpact-core'
import { capDeviations, omittedRowsNote } from './format.js'
import type {
  CheckImplementationInput,
  DiffPixelsInput,
  ExtractContractInput,
  ReadContractSummaryInput,
} from './schemas.js'

const MAX_DEVIATION_ROWS = 40

export interface ExtractContractResult {
  contractPath: string
  viewports: string[]
  elementCounts: Record<string, number>
  warnings: string[]
}

export async function extractContract(input: ExtractContractInput): Promise<ExtractContractResult> {
  const contract = await extract({
    url: input.url,
    selector: input.selector ?? null,
    viewports: input.viewports,
    maxElements: input.maxElements,
    maxStates: input.maxStates,
    masks: input.masks,
    freezeAnimations: input.freezeAnimations,
    fullPage: input.fullPage,
    screenshotDir: input.screenshotDir ?? null,
    headless: input.headless,
    timeout: input.timeout,
    wait: input.wait,
  })
  await writeContract(input.outputPath, contract)

  const elementCounts: Record<string, number> = {}
  for (const [name, snapshot] of Object.entries(contract.byViewport)) {
    elementCounts[name] = snapshot.elements.length
  }

  return {
    contractPath: input.outputPath,
    viewports: contract.viewports.map((viewport) => viewport.name),
    elementCounts,
    warnings: contract.warnings,
  }
}

export interface CheckImplementationResult {
  ok: boolean
  passRate: number
  totals: CheckReport['totals']
  missing: string[]
  omittedDeviations: number
  report: string
}

export async function checkImplementation(
  input: CheckImplementationInput,
): Promise<CheckImplementationResult> {
  const contract = await readContract(input.contractPath)
  const report = await check(contract, {
    url: input.url,
    viewport: input.viewport ?? null,
    selector: input.selector ?? null,
    tolerance: input.tolerance,
    maxStates: input.maxStates,
    headless: input.headless,
    timeout: input.timeout,
    wait: input.wait,
  })

  const { kept, omitted } = capDeviations(report.deviations, MAX_DEVIATION_ROWS)
  const cappedReport: CheckReport = omitted > 0 ? { ...report, deviations: kept } : report
  const table =
    omitted > 0
      ? `${formatCheckReport(cappedReport, { color: false })}\n${omittedRowsNote(omitted)}`
      : formatCheckReport(cappedReport, { color: false })

  return {
    ok: report.ok,
    passRate: report.passRate,
    totals: report.totals,
    missing: report.missing,
    omittedDeviations: omitted,
    report: table,
  }
}

export interface DiffPixelsResult {
  ok: boolean
  differentPercent: number
  threshold: number
  diffImagePath: string
}

export async function diffPixels(input: DiffPixelsInput): Promise<DiffPixelsResult> {
  const contract = await readContract(input.contractPath)
  const report = await diff(contract, {
    url: input.url,
    viewport: input.viewport ?? null,
    selector: input.selector ?? null,
    threshold: input.threshold,
    masks: input.masks,
    outDir: input.outDir,
    headless: input.headless,
    timeout: input.timeout,
    wait: input.wait,
  })

  return {
    ok: report.ok,
    differentPercent: report.differentPercent,
    threshold: report.threshold,
    diffImagePath: report.images.diff,
  }
}

export interface ContractSummaryResult {
  source: string
  extractedAt: string
  viewports: string[]
  elementCounts: Record<string, number>
  hasScreenshots: boolean
  screenshotViewports: string[]
  warnings: string[]
}

export async function readContractSummary(
  input: ReadContractSummaryInput,
): Promise<ContractSummaryResult> {
  const contract = await readContract(input.contractPath)

  const elementCounts: Record<string, number> = {}
  for (const [name, snapshot] of Object.entries(contract.byViewport)) {
    elementCounts[name] = snapshot.elements.length
  }
  const screenshotViewports = Object.keys(contract.screenshots)

  return {
    source: contract.source.value,
    extractedAt: contract.extractedAt,
    viewports: contract.viewports.map((viewport) => viewport.name),
    elementCounts,
    hasScreenshots: screenshotViewports.length > 0,
    screenshotViewports,
    warnings: contract.warnings,
  }
}
