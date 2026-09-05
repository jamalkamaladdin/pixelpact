import {
  BlockedPageError,
  BrowserUnavailableError,
  ContractError,
  PixelpactError,
  TargetNotFoundError,
} from 'pixelpact-core'
import { UsageError } from './options.js'

/** Exit codes documented in the CLI help text and the README. */
export const EXIT_OK = 0
export const EXIT_FAIL = 1
export const EXIT_USAGE = 2
export const EXIT_RUNTIME = 3

export interface ErrorReport {
  exitCode: number
  message: string
}

interface ErrorContext {
  /** The contract or output file path involved, if any. */
  file?: string
  /** The target url involved, if any. */
  url?: string
}

function isNodeErrnoException(err: unknown): err is NodeJS.ErrnoException {
  return err instanceof Error && 'code' in err
}

/** True for errors thrown by cac itself, e.g. a missing required argument. */
function isCacError(err: unknown): err is Error {
  return err instanceof Error && err.name === 'CACError'
}

/** Turns any thrown value into an exit code and a message that names what to do next. */
export function describeError(err: unknown, context: ErrorContext = {}): ErrorReport {
  if (err instanceof UsageError) {
    return { exitCode: EXIT_USAGE, message: err.message }
  }

  if (isCacError(err)) {
    return {
      exitCode: EXIT_USAGE,
      message: `${err.message}. Run "pixelpact <command> --help" for usage.`,
    }
  }

  if (err instanceof ContractError) {
    const where = context.file ? ` (${context.file})` : ''
    return {
      exitCode: EXIT_USAGE,
      message: `Invalid contract${where}: ${err.message}. Re-extract the contract with "pixelpact extract" and try again.`,
    }
  }

  if (err instanceof BrowserUnavailableError) {
    return {
      exitCode: EXIT_RUNTIME,
      message: `No browser is available: ${err.message}. Install the Playwright browsers with "npx playwright install" and try again.`,
    }
  }

  if (err instanceof BlockedPageError) {
    const where = context.url ? ` at ${context.url}` : ''
    return {
      exitCode: EXIT_RUNTIME,
      message: `The page${where} blocked automated access: ${err.message}. Try again with --headful, a different --channel, or a longer --wait.`,
    }
  }

  if (err instanceof TargetNotFoundError) {
    const where = context.url ? ` on ${context.url}` : ''
    return {
      exitCode: EXIT_RUNTIME,
      message: `Selector not found${where}: ${err.message}. Check --selector or increase --wait/--timeout.`,
    }
  }

  // Matched on `code` rather than `instanceof FigmaError`: `pixelpact-core` may not export
  // that class yet, and every error it throws is a `PixelpactError` with `code` set.
  if (err instanceof PixelpactError && err.code === 'ERR_FIGMA') {
    const where = context.url ? ` for ${context.url}` : ''
    return {
      exitCode: EXIT_RUNTIME,
      message: `Figma extraction failed${where}: ${err.message}.`,
    }
  }

  if (err instanceof PixelpactError) {
    return { exitCode: EXIT_RUNTIME, message: `${err.code}: ${err.message}` }
  }

  if (isNodeErrnoException(err) && err.code === 'ENOENT') {
    const where = context.file ?? (err as { path?: string }).path ?? 'file'
    return {
      exitCode: EXIT_USAGE,
      message: `File not found: ${where}. Check the path and try again.`,
    }
  }

  if (err instanceof Error) {
    return { exitCode: EXIT_RUNTIME, message: `Unexpected failure: ${err.message}` }
  }

  return { exitCode: EXIT_RUNTIME, message: `Unexpected failure: ${String(err)}` }
}

/** `check`/`diff` reports carry their own pass/fail verdict; this maps it to an exit code. */
export function exitCodeForReport(report: { ok: boolean }): number {
  return report.ok ? EXIT_OK : EXIT_FAIL
}
