import { closeQuietly, launchBrowser, openPage } from './browser.js'
import {
  buildMatchIndex,
  compareBox,
  compareProperty,
  compareStyles,
  findMatch,
  isLooping,
  type StyleDeviation,
} from './compare.js'
import { inheritedRenderingOptions, selectViewport } from './contract.js'
import { resolveCheckOptions } from './defaults.js'
import { ContractError } from './errors.js'
import { measurePage } from './extract.js'
import type {
  CheckOptions,
  CheckReport,
  Contract,
  ContractElement,
  Deviation,
  DeviationState,
  StyleMap,
} from './types.js'
import { CONTRACT_VERSION } from './types.js'

const toDeviation = (
  selector: string,
  state: DeviationState,
  deviation: StyleDeviation,
): Deviation => ({
  selector,
  state,
  property: deviation.property,
  expected: deviation.expected,
  actual: deviation.actual,
  delta: deviation.delta,
  unit: deviation.unit,
})

/** How many properties of `expected` the implementation reported at all. */
const comparableCount = (expected: StyleMap, actual: StyleMap): number =>
  Object.keys(expected).filter((property) => actual[property] !== undefined).length

const summarise = (styles: StyleMap): string => {
  const text = Object.entries(styles)
    .map(([property, value]) => `${property}: ${value}`)
    .join('; ')
  return text.length > 160 ? `${text.slice(0, 157)}...` : text
}

/**
 * Measure an implementation and report every way it departs from the contract.
 *
 * The implementation is walked with no element budget: a contract that asserts
 * four elements in a footer still needs the walker to reach the end of a long
 * page, and a budget there would report elements as missing when they are
 * merely late.
 *
 * @throws ContractError when the contract has nothing to compare at this viewport
 * @throws TargetNotFoundError when the implementation does not load
 * @throws BlockedPageError when the implementation answers with a bot challenge
 * @throws BrowserUnavailableError when playwright or a browser binary is missing
 *
 * @example
 * ```ts
 * const report = await check(contract, { url: 'http://localhost:3000', tolerance: 2 })
 * if (!report.ok) process.stderr.write(formatCheckReport(report))
 * ```
 */
export async function check(contract: Contract, options: CheckOptions): Promise<CheckReport> {
  const resolved = resolveCheckOptions({
    ...options,
    ...inheritedRenderingOptions(contract, options),
  })
  const viewport = selectViewport(contract, resolved.viewport)
  const snapshot = contract.byViewport[viewport.name]
  const expectedElements: ContractElement[] = snapshot ? snapshot.elements : []

  if (expectedElements.length === 0) {
    throw new ContractError(
      'The contract has no measured elements for viewport "' +
        viewport.name +
        '", so there is nothing to check. Re-extract the reference with this viewport included.',
    )
  }

  const selector = resolved.selector ?? (contract.root !== 'body' ? contract.root : null)
  const onProgress = options.onProgress

  if (onProgress) onProgress({ phase: 'launch', message: 'starting the browser' })
  const browser = await launchBrowser(resolved)

  let actualElements: ContractElement[] = []
  let actualKeyframes: Record<string, unknown> = {}

  try {
    if (onProgress) {
      onProgress({ phase: 'navigate', message: `opening ${resolved.url}`, viewport: viewport.name })
    }
    const session = await openPage(browser, viewport, resolved.url, resolved)
    try {
      const { data } = await measurePage(session.page, session.status, {
        url: resolved.url,
        selector,
        // No budget: see the note on this function.
        maxElements: 0,
        maxStates: resolved.maxStates,
        viewport: viewport.name,
        onProgress,
      })
      actualElements = data.elements
      actualKeyframes = data.keyframes
    } finally {
      await closeQuietly(session.context)
    }
  } finally {
    await closeQuietly(browser)
  }

  if (onProgress) {
    onProgress({
      phase: 'compare',
      message: `comparing ${expectedElements.length} elements`,
      viewport: viewport.name,
      total: expectedElements.length,
    })
  }

  const index = buildMatchIndex(actualElements)
  const deviations: Deviation[] = []
  const missing: string[] = []
  let checks = 0
  let failed = 0
  let matched = 0

  const fail = (deviation: Deviation): void => {
    deviations.push(deviation)
    failed++
  }

  for (const expected of expectedElements) {
    checks++
    const { element: actual } = findMatch(expected, index)
    if (!actual) {
      missing.push(expected.selector)
      failed++
      continue
    }
    matched++

    checks += 2
    for (const deviation of compareBox(expected.box, actual.box, resolved.tolerance)) {
      fail(toDeviation(expected.selector, 'base', deviation))
    }

    // A looping animation's transform is a reading of a moment, not a promise.
    const expectedStyles: StyleMap = { ...expected.styles }
    if (isLooping(expected) && isLooping(actual)) delete expectedStyles.transform

    checks += comparableCount(expectedStyles, actual.styles)
    for (const deviation of compareStyles(expectedStyles, actual.styles, {
      tolerance: resolved.tolerance,
    })) {
      fail(toDeviation(expected.selector, 'base', deviation))
    }

    for (const state of ['hover', 'focus'] as const) {
      const expectedState = expected[state]
      if (!expectedState) continue
      const actualState = actual[state]
      if (!actualState) {
        checks++
        fail({
          selector: expected.selector,
          state,
          property: state,
          expected: summarise(expectedState),
          actual: `no ${state} change`,
          delta: null,
          unit: null,
        })
        continue
      }
      for (const [property, value] of Object.entries(expectedState)) {
        checks++
        const found = actualState[property]
        if (found === undefined) {
          fail({
            selector: expected.selector,
            state,
            property,
            expected: value,
            actual: 'unchanged',
            delta: null,
            unit: null,
          })
          continue
        }
        const deviation = compareProperty(property, value, found, resolved.tolerance)
        if (deviation) fail(toDeviation(expected.selector, state, deviation))
      }
    }

    for (const pseudo of ['before', 'after'] as const) {
      const expectedPseudo = expected[pseudo]
      if (!expectedPseudo) continue
      checks++
      const actualPseudo = actual[pseudo]
      if (!actualPseudo) {
        fail({
          selector: expected.selector,
          state: pseudo,
          property: 'content',
          expected: expectedPseudo.content ?? summarise(expectedPseudo),
          actual: 'not rendered',
          delta: null,
          unit: null,
        })
        continue
      }
      checks += comparableCount(expectedPseudo, actualPseudo)
      for (const deviation of compareStyles(expectedPseudo, actualPseudo, {
        tolerance: resolved.tolerance,
      })) {
        fail(toDeviation(expected.selector, pseudo, deviation))
      }
    }
  }

  for (const name of Object.keys(contract.keyframes)) {
    checks++
    if (!(name in actualKeyframes)) {
      fail({
        selector: `@keyframes ${name}`,
        state: 'base',
        property: 'animation-name',
        expected: name,
        actual: 'not defined',
        delta: null,
        unit: null,
      })
    }
  }

  const passed = Math.max(0, checks - failed)
  if (onProgress) onProgress({ phase: 'done', message: 'check complete' })

  return {
    version: CONTRACT_VERSION,
    target: resolved.url,
    source: contract.source,
    viewport,
    checkedAt: new Date().toISOString(),
    totals: {
      elements: expectedElements.length,
      matched,
      missing: missing.length,
      checks,
      passed,
      failed,
    },
    passRate: checks > 0 ? Math.round((passed / checks) * 10000) / 10000 : 1,
    missing,
    deviations,
    ok: deviations.length === 0 && missing.length === 0,
  }
}
