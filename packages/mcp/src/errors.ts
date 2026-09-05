export type ToolTextContent = {
  type: 'text'
  text: string
}

export type ToolErrorResult = {
  content: ToolTextContent[]
  isError: true
}

interface MaybeCodedError {
  code?: unknown
  message?: unknown
}

function readCode(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null) {
    return undefined
  }
  const code = (error as MaybeCodedError).code
  return typeof code === 'string' ? code : undefined
}

function readMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }
  if (
    typeof error === 'object' &&
    error !== null &&
    typeof (error as MaybeCodedError).message === 'string'
  ) {
    return (error as MaybeCodedError).message as string
  }
  return String(error)
}

/**
 * Turns any thrown value into a tool result the calling agent can act on.
 * Keys off the `code` string that every `@pixelpact/core` error carries instead of
 * `instanceof` checks, so this also works for plain objects in tests and across
 * duplicate module instances.
 */
export function mapErrorToToolResult(error: unknown): ToolErrorResult {
  const code = readCode(error)
  const message = readMessage(error)
  return { content: [{ type: 'text', text: describeError(code, message) }], isError: true }
}

function describeError(code: string | undefined, message: string): string {
  switch (code) {
    case 'ERR_CONTRACT':
      return `Contract error: ${message}. Check that the contract file is valid JSON produced by extract_contract, and that any screenshot directory it references still exists.`
    case 'ERR_BROWSER':
      return `Browser unavailable: ${message}. Install a Playwright browser, for example "pnpm exec playwright install chromium", or set PIXELPACT_CHROMIUM to a Chromium executable path.`
    case 'ERR_BLOCKED':
      return `The target page blocked automated access: ${message}. Retry with a different user agent or confirm the page is reachable without a bot challenge.`
    case 'ERR_TARGET':
      return `Target not found: ${message}. Confirm the url and selector resolve to a real element on the page.`
    default:
      return `Unexpected error: ${message}`
  }
}
