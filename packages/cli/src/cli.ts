import { writeFile } from 'node:fs/promises'
import cac from 'cac'
import pc from 'picocolors'
import type { CheckReport, Contract, DiffReport, ProgressEvent, SideReport } from 'pixelpact-core'
import {
  check,
  diff,
  extract,
  extractFromFigma,
  formatCheckReport,
  formatDiffReport,
  formatSideReport,
  isFigmaUrl,
  readContract,
  side,
  writeContract,
} from 'pixelpact-core'
import { shouldUseColor } from './color.js'
import { describeError, EXIT_FAIL, EXIT_OK, EXIT_USAGE, exitCodeForReport } from './errors.js'
import type { CheckFlags, DiffFlags, ExtractFlags, SideFlags } from './options.js'
import {
  buildCheckOptions,
  buildDiffOptions,
  buildExtractOptions,
  buildFigmaExtractOptions,
  buildSideOptions,
  DEFAULT_SIDE_OUT_DIR,
  findFigmaIncompatibleFlags,
  findHttpIncompatibleFlags,
  isMalformedFigmaUrl,
  UsageError,
} from './options.js'
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

async function runExtract(source: string, flags: ExtractFlags, paint: Paint): Promise<number> {
  let contract: Contract
  let out: string
  let json: boolean
  let quiet: boolean

  if (isMalformedFigmaUrl(source)) {
    throw new UsageError(
      `"${source}" points at figma.com but no file key could be read from it. A Figma url looks like https://www.figma.com/design/<fileKey>/<name>?node-id=1-23.`,
    )
  }

  if (isFigmaUrl(source)) {
    const incompatible = findFigmaIncompatibleFlags(flags)
    if (incompatible.length > 0) {
      throw new UsageError(
        `These flags do not apply to a Figma source: ${incompatible.join(', ')}. Remove them and try again.`,
      )
    }
    const built = buildFigmaExtractOptions(source, flags)
    out = built.out
    json = built.json
    quiet = built.quiet
    contract = await extractFromFigma({
      ...built.figmaOptions,
      onProgress: makeProgressWriter(quiet),
    })
  } else {
    const incompatible = findHttpIncompatibleFlags(flags)
    if (incompatible.length > 0) {
      throw new UsageError(
        `These flags only apply to a Figma source: ${incompatible.join(', ')}. Remove them and try again.`,
      )
    }
    const built = buildExtractOptions(source, flags)
    out = built.out
    json = built.json
    quiet = built.quiet
    contract = await extract({ ...built.extractOptions, onProgress: makeProgressWriter(quiet) })
  }

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
    `${paint.green('Extracted')} contract for ${source}: ${elementCount} element(s) across ${viewportCount} viewport(s).\n`,
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

async function runSide(
  referenceUrl: string,
  targetUrl: string,
  flags: SideFlags,
  useColor: boolean,
): Promise<number> {
  const { sideOptions, json, quiet } = buildSideOptions(referenceUrl, targetUrl, flags)
  const report: SideReport = await side({
    ...sideOptions,
    onProgress: makeProgressWriter(quiet),
  })

  if (json) {
    printJson(report)
    return exitCodeForReport(report)
  }

  process.stdout.write(`${formatSideReport(report, { color: useColor })}\n`)
  // The images are the point of this command, so a failing report always says where to look.
  if (!report.ok) {
    process.stdout.write(`Images written to ${sideOptions.outDir}\n`)
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
    .command('extract <source>', 'Extract a visual contract from a live page or a Figma file')
    .option('-o, --out <path>', 'Where to write the contract JSON', {
      default: 'pixelpact.contract.json',
    })
    .option('--selector <css>', 'Restrict extraction to this CSS selector (http source only)')
    .option(
      '--viewport <list>',
      'Comma separated viewport names or WIDTHxHEIGHT pairs, repeatable (http source only)',
      { type: [] },
    )
    .option('--max-elements <n>', 'Maximum number of elements to walk, 0 means unbounded')
    .option(
      '--max-states <n>',
      'Maximum number of interactive elements to probe (http source only)',
    )
    .option('--mask <css>', 'CSS selector to mask out, repeatable', { type: [] })
    .option('--screenshots <dir>', 'Directory to write per-viewport screenshots to')
    .option('--wait <ms>', 'Extra settle time in milliseconds (http source only)')
    .option('--timeout <ms>', 'Navigation timeout in milliseconds (http source only)')
    .option('--headful', 'Show the browser window instead of running headless (http source only)')
    .option('--channel <name>', 'Browser channel, e.g. chrome (http source only)')
    .option('--locale <tag>', 'Browser locale, e.g. en-US')
    .option('--timezone <tz>', 'Browser timezone, e.g. UTC')
    .option('--no-stealth', 'Disable stealth mode (http source only)')
    .option('--no-dismiss', 'Do not dismiss cookie banners and other overlays (http source only)')
    .option('--no-freeze', 'Do not freeze CSS animations before extracting (http source only)')
    .option(
      '--no-full-page',
      'Capture only the viewport instead of the full scrollable page (http source only)',
    )
    .option(
      '--figma-token <token>',
      'Figma personal access token, default $FIGMA_TOKEN (Figma source only)',
    )
    .option('--node <id>', 'Overrides the node id in the url (Figma source only)')
    .option(
      '--scale <n>',
      'PNG scale for the downloaded reference image, default 1 (Figma source only)',
    )
    .option('--json', 'Print the contract as JSON to stdout instead of a summary')
    .option('--quiet', 'Suppress progress output on stderr')
    .action(async (source: string, flags: ExtractFlags) => {
      exitCode = await runExtract(source, flags, paint)
    })

  cli
    .command('check <contract> <url>', 'Measure an implementation against a contract')
    .option('--viewport <name>', 'Viewport name to check, default: the first one in the contract')
    .option('--selector <css>', 'Root selector to check, default: the contract root')
    .option('--tolerance <px>', 'Pixel tolerance for box and length values, default 1')
    .option('-o, --out <path>', 'Also write the report JSON to this path')
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

  cli
    .command(
      'side <referenceUrl> <targetUrl>',
      'Compare two pages section by section, side by side',
    )
    .option('--widths <list>', 'Comma separated list of viewport widths, default 1440,390')
    .option(
      '--sections <css>',
      'Root selector whose direct children become sections, default: main then body',
    )
    .option('--only <n|slug>', 'Restrict the comparison to a single section, by index or slug')
    .option('--threshold <pct>', 'Allowed percent of differing pixels per section, default 0.5')
    .option(
      '--out-dir <dir>',
      `Directory to write the composed images to, default ${DEFAULT_SIDE_OUT_DIR}`,
    )
    .option('--mask <css>', 'CSS selector to mask out, repeatable', { type: [] })
    .option(
      '--column-width <px>',
      'Width in pixels of each half of the composed image, default 900',
    )
    .option('--wait <ms>', 'Extra settle time in milliseconds')
    .option('--timeout <ms>', 'Navigation timeout in milliseconds')
    .option('--headful', 'Show the browser window instead of running headless')
    .option('--channel <name>', 'Browser channel, e.g. chrome')
    .option('--locale <tag>', 'Browser locale, e.g. en-US')
    .option('--timezone <tz>', 'Browser timezone, e.g. UTC')
    .option('--no-stealth', 'Disable stealth mode')
    .option('--no-dismiss', 'Do not dismiss cookie banners and other overlays')
    .option('--no-freeze', 'Do not freeze CSS animations before comparing')
    .option('--json', 'Print the report as JSON to stdout instead of a summary')
    .option('--quiet', 'Suppress progress output on stderr')
    .action(async (referenceUrl: string, targetUrl: string, flags: SideFlags) => {
      exitCode = await runSide(referenceUrl, targetUrl, flags, useColor)
    })

  cli.help((sections) => {
    sections.push({
      title: 'Examples',
      body: [
        '  $ pixelpact extract https://example.com --out example.contract.json',
        '  $ pixelpact check example.contract.json https://staging.example.com --tolerance 2',
        '  $ pixelpact extract "https://www.figma.com/design/abc123/Site?node-id=1-23" \\',
        '      --figma-token $FIGMA_TOKEN --out figma.contract.json',
        '  $ pixelpact side https://reference.example https://staging.example.com',
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
    } else if (commandName === 'side') {
      url = typeof args[0] === 'string' ? args[0] : undefined
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
