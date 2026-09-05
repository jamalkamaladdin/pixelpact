import { FIGMA_MATCH_RULE } from './figma/map.js'
import type { CheckReport, Deviation, DiffReport, FormatOptions, SideReport } from './types.js'

/** ANSI control sequence introducer, built without an escape literal. */
const CSI = `${String.fromCharCode(27)}[`

const CODES = {
  reset: `${CSI}0m`,
  bold: `${CSI}1m`,
  dim: `${CSI}2m`,
  red: `${CSI}31m`,
  green: `${CSI}32m`,
  yellow: `${CSI}33m`,
  cyan: `${CSI}36m`,
}

type Colour = keyof typeof CODES

/** Wrap text in an ANSI code, or leave it alone when colour is off. */
function paint(text: string, colour: Colour, enabled: boolean): string {
  return enabled ? CODES[colour] + text + CODES.reset : text
}

function truncate(value: string, max: number): string {
  const flat = value.replace(/\s+/g, ' ').trim()
  if (flat.length <= max) return flat
  return `${flat.slice(0, Math.max(1, max - 3))}...`
}

function pad(value: string, width: number): string {
  return value.length >= width ? value : value + ' '.repeat(width - value.length)
}

function field(label: string, value: string, enabled: boolean): string {
  return `  ${paint(pad(label, 10), 'dim', enabled)}${value}`
}

/** The difference column: a number where one exists, a word where it does not. */
function differenceOf(deviation: Deviation): string {
  if (deviation.delta === null) return 'differs'
  if (deviation.unit === 'px') return `${deviation.delta}px`
  if (deviation.unit === 'color') return `${deviation.delta} (color)`
  return String(deviation.delta)
}

/** `hover.color` reads better than a column that is almost always 'base'. */
function propertyOf(deviation: Deviation): string {
  return deviation.state === 'base'
    ? deviation.property
    : `${deviation.state}.${deviation.property}`
}

const COLUMN_CAPS = [44, 24, 22, 22, 12]

/**
 * The advice a check report needs when a Figma contract matched nothing.
 *
 * A run where every layer is missing almost always means the implementation
 * carries no `data-contract` attributes at all, which reads as total failure
 * while nothing is actually wrong with the css. Returns `null` for a url
 * contract and for any run where at least one element was found, so a caller
 * can print it unconditionally.
 *
 * @returns the hint, or `null` when there is nothing to say
 *
 * @example
 * ```ts
 * const hint = figmaMatchHint(report)
 * if (hint) process.stderr.write(hint + '\n')
 * ```
 */
export function figmaMatchHint(report: CheckReport): string | null {
  if (report.source.type !== 'figma') return null
  if (report.totals.elements === 0 || report.totals.matched > 0) return null
  return `Not one of the ${report.totals.elements} layers matched. ${FIGMA_MATCH_RULE}`
}

/**
 * Render a check report as a compact aligned table.
 *
 * The same string is meant to be read by a person scanning a terminal and by an
 * agent deciding what to fix next, so every row carries the selector, the
 * property, both values and the size of the difference. Long values are
 * shortened rather than wrapped: a table that keeps its columns is worth more
 * than one that shows every character.
 *
 * @param options - `color` emits ANSI codes (default `false`), `limit` caps the
 *   number of rows before a summary line (default `20`)
 *
 * @example
 * ```ts
 * const report = await check(contract, { url: 'http://localhost:3000' })
 * process.stdout.write(formatCheckReport(report, { color: true, limit: 40 }))
 * ```
 */
export function formatCheckReport(report: CheckReport, options: FormatOptions = {}): string {
  const colour = options.color ?? false
  const limit = options.limit ?? 20
  const lines: string[] = []

  const verdict = report.ok ? paint('PASSED', 'green', colour) : paint('FAILED', 'red', colour)
  lines.push(`${paint('pixelpact check', 'bold', colour)}  ${verdict}`)

  const totals = report.totals
  const rate = Math.round(report.passRate * 1000) / 10
  lines.push(field('target', report.target, colour))
  lines.push(field('reference', report.source.value, colour))
  lines.push(
    field(
      'viewport',
      `${report.viewport.name} ${report.viewport.width}x${report.viewport.height}`,
      colour,
    ),
  )
  lines.push(
    field(
      'elements',
      `${totals.matched} matched, ${totals.missing} missing of ${totals.elements}`,
      colour,
    ),
  )
  lines.push(
    field(
      'checks',
      totals.passed +
        ' passed, ' +
        totals.failed +
        ' failed (' +
        rate +
        '% of ' +
        totals.checks +
        ')',
      colour,
    ),
  )

  const hint = figmaMatchHint(report)
  if (hint) {
    lines.push('')
    lines.push(paint(hint, 'yellow', colour))
  }

  if (report.missing.length > 0) {
    lines.push('')
    lines.push(paint(`missing in the implementation (${report.missing.length})`, 'bold', colour))
    for (const selector of report.missing.slice(0, limit)) {
      lines.push(`  ${paint(truncate(selector, 96), 'red', colour)}`)
    }
    const hidden = report.missing.length - Math.min(report.missing.length, limit)
    if (hidden > 0) lines.push(`  ${paint(`${hidden} more`, 'dim', colour)}`)
  }

  if (report.deviations.length > 0) {
    const shown = report.deviations.slice(0, limit)
    const rows = shown.map((deviation) => [
      truncate(deviation.selector, COLUMN_CAPS[0]),
      truncate(propertyOf(deviation), COLUMN_CAPS[1]),
      truncate(deviation.expected, COLUMN_CAPS[2]),
      truncate(deviation.actual, COLUMN_CAPS[3]),
      truncate(differenceOf(deviation), COLUMN_CAPS[4]),
    ])
    const head = ['SELECTOR', 'PROPERTY', 'EXPECTED', 'ACTUAL', 'DIFF']
    const widths = head.map((title, column) =>
      Math.max(title.length, ...rows.map((row) => row[column].length)),
    )
    const tint: Colour[] = ['cyan', 'reset', 'green', 'red', 'yellow']

    lines.push('')
    lines.push(paint(`deviations (${report.deviations.length})`, 'bold', colour))
    lines.push(
      paint(
        head
          .map((title, column) => pad(title, widths[column]))
          .join('  ')
          .trimEnd(),
        'dim',
        colour,
      ),
    )
    for (const row of rows) {
      const cells = row.map((cell, column) => {
        const padded = pad(cell, widths[column])
        return column === 1 ? padded : paint(padded, tint[column], colour)
      })
      lines.push(cells.join('  ').trimEnd())
    }
    const hidden = report.deviations.length - shown.length
    if (hidden > 0) lines.push(paint(`${hidden} more`, 'dim', colour))
  }

  if (report.ok) {
    lines.push('')
    lines.push('Every asserted property matched the contract.')
  }

  return lines.join('\n')
}

/**
 * Render a pixel diff report as a few aligned lines.
 *
 * @param options - `color` emits ANSI codes (default `false`)
 *
 * @example
 * ```ts
 * const report = await diff(contract, { url: 'http://localhost:3000' })
 * process.stdout.write(formatDiffReport(report))
 * ```
 */
export function formatDiffReport(report: DiffReport, options: FormatOptions = {}): string {
  const colour = options.color ?? false
  const verdict = report.ok ? paint('PASSED', 'green', colour) : paint('FAILED', 'red', colour)
  const percent = report.differentPercent.toFixed(3)
  const counted = paint(
    `${report.differentPixels} of ${report.totalPixels}`,
    report.ok ? 'green' : 'red',
    colour,
  )

  const lines = [
    `${paint('pixelpact diff', 'bold', colour)}  ${verdict}`,
    field('target', report.target, colour),
    field(
      'viewport',
      `${report.viewport.name} ${report.viewport.width}x${report.viewport.height}`,
      colour,
    ),
    field('pixels', `${counted} differ (${percent}%, threshold ${report.threshold}%)`, colour),
    field('reference', report.images.reference, colour),
    field('actual', report.images.actual, colour),
    field('diff', report.images.diff, colour),
  ]

  if (!report.ok) {
    lines.push('')
    lines.push('Open the diff image: red marks every pixel that does not match.')
  }

  return lines.join('\n')
}

/** Section slugs stay readable well past this, so they are cut here. */
const SLUG_CAP = 36

/**
 * Render a side by side report as an aligned table, one row per section.
 *
 * The path of the composed image is printed under every failing row and nowhere
 * else: the picture is the thing to open when something is wrong, and printing
 * it for sections that passed would bury it.
 *
 * @param options - `color` emits ANSI codes (default `false`), `limit` caps the
 *   number of rows before a summary line (default `20`)
 *
 * @example
 * ```ts
 * const report = await side({ referenceUrl, targetUrl, outDir: './side' })
 * process.stdout.write(formatSideReport(report, { color: true }))
 * ```
 */
export function formatSideReport(report: SideReport, options: FormatOptions = {}): string {
  const colour = options.color ?? false
  const limit = options.limit ?? 20
  const lines: string[] = []

  const verdict = report.ok ? paint('PASSED', 'green', colour) : paint('FAILED', 'red', colour)
  lines.push(`${paint('pixelpact side', 'bold', colour)}  ${verdict}`)
  lines.push(field('reference', report.reference, colour))
  lines.push(field('target', report.target, colour))
  lines.push(field('widths', report.widths.map((width) => `${width}px`).join(', '), colour))
  lines.push(
    field(
      'sections',
      report.totals.passed +
        ' passed, ' +
        report.totals.failed +
        ' failed of ' +
        report.totals.sections +
        ' (threshold ' +
        report.threshold +
        '%)',
      colour,
    ),
  )

  const orphans = report.unmatched.reference + report.unmatched.target
  if (orphans > 0) {
    lines.push(
      field(
        'unmatched',
        `${report.unmatched.reference} in the reference, ` +
          `${report.unmatched.target} in the implementation, none compared`,
        colour,
      ),
    )
  }

  if (report.sections.length > 0) {
    const shown = report.sections.slice(0, limit)
    const rows = shown.map((section) => [
      String(section.index).padStart(2, '0'),
      truncate(section.slug, SLUG_CAP),
      `${section.width}px`,
      section.ok ? 'PASS' : 'FAIL',
      `${section.differentPercent.toFixed(3)}%`,
    ])
    const head = ['#', 'SECTION', 'WIDTH', 'VERDICT', 'DIFF']
    const widths = head.map((title, column) =>
      Math.max(title.length, ...rows.map((row) => row[column].length)),
    )

    lines.push('')
    lines.push(
      paint(
        head
          .map((title, column) => pad(title, widths[column]))
          .join('  ')
          .trimEnd(),
        'dim',
        colour,
      ),
    )
    for (let index = 0; index < rows.length; index++) {
      const section = shown[index]
      const cells = rows[index].map((cell, column) => {
        const padded = pad(cell, widths[column])
        if (column === 1) return paint(padded, 'cyan', colour)
        if (column === 3 || column === 4) {
          return paint(padded, section.ok ? 'green' : 'red', colour)
        }
        return padded
      })
      lines.push(cells.join('  ').trimEnd())
      if (!section.ok) lines.push(`  ${paint(section.image, 'dim', colour)}`)
    }
    const hidden = report.sections.length - shown.length
    if (hidden > 0) lines.push(paint(`${hidden} more`, 'dim', colour))
  }

  if (report.warnings.length > 0) {
    lines.push('')
    lines.push(paint(`warnings (${report.warnings.length})`, 'bold', colour))
    for (const warning of report.warnings.slice(0, limit)) {
      lines.push(`  ${paint(truncate(warning, 200), 'yellow', colour)}`)
    }
  }

  if (report.ok) {
    lines.push('')
    lines.push('Every section is inside the pixel budget.')
  }

  return lines.join('\n')
}
