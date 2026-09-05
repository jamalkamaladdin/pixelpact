import { writeFile } from 'node:fs/promises'
import type { CheckReport, DiffReport, ProgressEvent } from '@pixelpact/core'
import {
  check,
  diff,
  extract,
  formatCheckReport,
  formatDiffReport,
  readContract,
  writeContract,
} from '@pixelpact/core'
import cac from 'cac'
import pc from 'picocolors'
import { shouldUseColor } from './color.js'
import { describeError, EXIT_FAIL, EXIT_OK, EXIT_USAGE, exitCodeForReport } from './errors.js'
import type { CheckFlags, DiffFlags, ExtractFlags } from './options.js'
import { buildCheckOptions, buildDiffOptions, buildExtractOptions } from './options.js'
import { getVersion } from './version.js'

interface Paint {
  bold: (s: string) => string
  dim: (s: string) => string
  green: (s: string) => string
  red: (s: string) => string
  yellow: (s: string) => string
}

function makePaint(enabled: boolean): Paint {
  if (!enabled) {
    const identity = (s: string) => s
    return { bold: identity, dim: identity, green: identity, red: identity, yellow: identity }
  }
  return { bold: pc.bold, dim: pc.dim, green: pc.green, red: pc.red, yellow: pc.yellow }
}

function makeProgressWriter(quiet: boolean) {
  return (event: ProgressEvent) => {
    if (quiet) return
    const parts = [`[${event.phase}]`, event.message]
    if (event.viewport) parts.push(`(${event.viewport})`)
    if (event.current !== undefined && event.total !== undefined) {
      parts.push(`${event.current}/${event.total}`)
    }
    process.stderr.write(`${parts.join(' ')}\n`)
  }
}

function printJson(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`)
}

async function runExtract(url: string, flags: ExtractFlags, paint: Paint): Promise<number> {
  const { extractOptions, out, json, quiet } = buildExtractOptions(url, flags)
  const contract = await extract({ ...extractOptions, onProgress: makeProgressWriter(quiet) })
  await writeContract(out, contract)

  if (json) {
    printJson(contract)
    return EXIT_OK
  }

  const viewportCount = contract.viewports.length
  const elementCount = Object.values(contract.byViewport).reduce(
    (sum, snapshot) => sum + snapshot.elements.length,
    0,
  )
  process.stdout.write(
    `${paint.green('Extracted')} contract for ${url}: ${elementCount} element(s) across ${viewportCount} viewport(s).\n`,
  )
  process.stdout.write(`Written to ${out}\n`)
  if (contract.warnings.length > 0) {
    for (const warning of contract.warnings) {
      process.stdout.write(`${paint.yellow('warning:')} ${warning}\n`)
    }
  }
  return EXIT_OK
}

async function runCheck(
  contractPath: string,
  url: string,
  flags: CheckFlags,
  useColor: boolean,
): Promise<number> {
  const { checkOptions, out, json, quiet } = buildCheckOptions(url, flags)
  const contract = await readContract(contractPath)
  const report: CheckReport = await check(contract, {
    ...checkOptions,
    onProgress: makeProgressWriter(quiet),
  })

  if (out !== undefined) {
    await writeFile(out, JSON.stringify(report, null, 2), 'utf8')
  }

  if (json) {
    printJson(report)
  } else {
    process.stdout.write(`${formatCheckReport(report, { color: useColor })}\n`)
  }

  return exitCodeForReport(report)
}

async function runDiff(
  contractPath: string,
  url: string,
  flags: DiffFlags,
  useColor: boolean,
): Promise<number> {
  const { diffOptions, json, quiet } = buildDiffOptions(url, flags)
  const contract = await readContract(contractPath)
  const report: DiffReport = await diff(contract, {
    ...diffOptions,
    onProgress: makeProgressWriter(quiet),
  })

  if (json) {
    printJson(report)
  } else {
    process.stdout.write(`${formatDiffReport(report, { color: useColor })}\n`)
  }

  return exitCodeForReport(report)
}

/** Builds and parses the CLI, then runs whichever command matched. Never calls `process.exit`. */
export async function run(argv: string[]): Promise<number> {
  const useColor = shouldUseColor({
    isTTY: Boolean(process.stdout.isTTY),
    noColor: process.env.NO_COLOR,
    forceColor: process.env.FORCE_COLOR,
  })
  const paint = makePaint(useColor)

  const cli = cac('pixelpact')
  let exitCode = EXIT_OK

  cli
    .command('extract <url>', 'Extract a visual contract from a live page')
    .option('--out <path>', 'Where to write the contract JSON', {
      default: 'pixelpact.contract.json',
    })
    .option('--selector <css>', 'Restrict extraction to this CSS selector')
    .option(
      '--viewport <list>',
      'Comma separated viewport names or WIDTHxHEIGHT pairs, repeatable',
      { type: [] },
    )
    .option('--max-elements <n>', 'Maximum number of elements to walk, 0 means unbounded')
    .option('--max-states <n>', 'Maximum number of interactive elements to probe')
    .option('--mask <css>', 'CSS selector to mask out, repeatable', { type: [] })
    .option('--screenshots <dir>', 'Directory to write per-viewport screenshots to')
    .option('--wait <ms>', 'Extra settle time in milliseconds')
    .option('--timeout <ms>', 'Navigation timeout in milliseconds')
    .option('--headful', 'Show the browser window instead of running headless')
    .option('--channel <name>', 'Browser channel, e.g. chrome')
    .option('--locale <tag>', 'Browser locale, e.g. en-US')
    .option('--timezone <tz>', 'Browser timezone, e.g. UTC')
    .option('--no-stealth', 'Disable stealth mode')
    .option('--no-dismiss', 'Do not dismiss cookie banners and other overlays')
    .option('--no-freeze', 'Do not freeze CSS animations before extracting')
    .option('--no-full-page', 'Capture only the viewport instead of the full scrollable page')
    .option('--json', 'Print the contract as JSON to stdout instead of a summary')
    .option('--quiet', 'Suppress progress output on stderr')
    .action(async (url: string, flags: ExtractFlags) => {
      exitCode = await runExtract(url, flags, paint)
    })

  cli
    .command('check <contract> <url>', 'Measure an implementation against a contract')
    .option('--viewport <name>', 'Viewport name to check, default: the first one in the contract')
    .option('--selector <css>', 'Root selector to check, default: the contract root')
    .option('--tolerance <px>', 'Pixel tolerance for box and length values, default 1')
    .option('--out <path>', 'Also write the report JSON to this path')
    .option('--max-states <n>', 'Maximum number of interactive elements to probe, default 120')
    .option('--wait <ms>', 'Extra settle time in milliseconds')
    .option('--timeout <ms>', 'Navigation timeout in milliseconds')
    .option('--headful', 'Show the browser window instead of running headless')
    .option('--channel <name>', 'Browser channel, e.g. chrome')
    .option('--locale <tag>', 'Browser locale, e.g. en-US')
    .option('--timezone <tz>', 'Browser timezone, e.g. UTC')
    .option('--no-stealth', 'Disable stealth mode')
    .option('--no-dismiss', 'Do not dismiss cookie banners and other overlays')
    .option('--json', 'Print the report as JSON to stdout instead of a summary')
    .option('--quiet', 'Suppress progress output on stderr')
    .action(async (contractPath: string, url: string, flags: CheckFlags) => {
      exitCode = await runCheck(contractPath, url, flags, useColor)
    })

  cli
    .command('diff <contract> <url>', 'Compare screenshots pixel by pixel')
    .option('--viewport <name>', 'Viewport name to diff, default: the first one in the contract')
    .option('--selector <css>', 'Root selector to diff, default: the contract root')
    .option('--threshold <pct>', 'Allowed percent of differing pixels, default 0.5')
    .option('--out-dir <dir>', 'Directory to write the diff images to, default: the OS temp dir')
    .option('--mask <css>', 'CSS selector to mask out, repeatable', { type: [] })
    .option('--wait <ms>', 'Extra settle time in milliseconds')
    .option('--timeout <ms>', 'Navigation timeout in milliseconds')
    .option('--headful', 'Show the browser window instead of running headless')
    .option('--channel <name>', 'Browser channel, e.g. chrome')
    .option('--locale <tag>', 'Browser locale, e.g. en-US')
    .option('--timezone <tz>', 'Browser timezone, e.g. UTC')
    .option('--no-stealth', 'Disable stealth mode')
    .option('--no-dismiss', 'Do not dismiss cookie banners and other overlays')
    .option('--json', 'Print the report as JSON to stdout instead of a summary')
    .option('--quiet', 'Suppress progress output on stderr')
    .action(async (contractPath: string, url: string, flags: DiffFlags) => {
      exitCode = await runDiff(contractPath, url, flags, useColor)
    })

  cli.help((sections) => {
    sections.push({
      title: 'Examples',
      body: [
        '  $ pixelpact extract https://example.com --out example.contract.json',
        '  $ pixelpact check example.contract.json https://staging.example.com --tolerance 2',
      ].join('\n'),
    })
    sections.push({
      title: 'Exit codes',
      body: [
        '  0  success, no deviations',
        '  1  deviations found or the pixel threshold was exceeded',
        '  2  usage error: bad flags or a missing file',
        '  3  runtime failure: browser unavailable, navigation failed, or the page blocked access',
      ].join('\n'),
    })
  })
  cli.version(getVersion())

  try {
    const parsed = cli.parse(argv, { run: false })
    if (parsed.options.help || parsed.options.version) {
      return EXIT_OK
    }
    if (!cli.matchedCommand) {
      cli.outputHelp()
      process.stderr.write(
        `${paint.red('error:')} no command matched. Run "pixelpact --help" for usage.\n`,
      )
      return EXIT_USAGE
    }
    await cli.runMatchedCommand()
  } catch (err) {
    const commandName = cli.matchedCommandName
    const args = cli.args ?? []
    let file: string | undefined
    let url: string | undefined
    if (commandName === 'extract') {
      url = typeof args[0] === 'string' ? args[0] : undefined
    } else if (commandName === 'check' || commandName === 'diff') {
      file = typeof args[0] === 'string' ? args[0] : undefined
      url = typeof args[1] === 'string' ? args[1] : undefined
    }
    const { exitCode: code, message } = describeError(err, { file, url })
    process.stderr.write(`${paint.red('error:')} ${message}\n`)
    return code
  }

  if (exitCode === EXIT_FAIL) {
    process.stderr.write(`${paint.yellow('pixelpact: deviations found, see the report above.')}\n`)
  }
  return exitCode
}
