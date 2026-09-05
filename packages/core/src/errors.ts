/**
 * Base class for every error pixelpact throws on purpose.
 *
 * Catching this one class separates "the tool has something to tell you" from
 * a genuine crash, and `code` lets a caller branch without matching on text.
 *
 * @example
 * ```ts
 * try {
 *   await check(contract, { url: 'http://localhost:3000' })
 * } catch (error) {
 *   if (error instanceof PixelpactError) process.exitCode = 1
 * }
 * ```
 */
export class PixelpactError extends Error {
  /** Stable machine readable identifier, for example `ERR_CONTRACT`. */
  readonly code: string

  constructor(message: string, code = 'ERR_PIXELPACT', options?: ErrorOptions) {
    super(message, options)
    this.name = new.target.name
    this.code = code
  }
}

/**
 * A contract could not be read, parsed or validated, or it is missing
 * something a later step needs.
 */
export class ContractError extends PixelpactError {
  constructor(message: string, options?: ErrorOptions) {
    super(message, 'ERR_CONTRACT', options)
  }
}

/**
 * Playwright is not installed, or no browser binary could be launched.
 * The message always says which command fixes it.
 */
export class BrowserUnavailableError extends PixelpactError {
  constructor(message: string, options?: ErrorOptions) {
    super(message, 'ERR_BROWSER', options)
  }
}

/**
 * The page that loaded is a bot challenge or an error page rather than the
 * site itself, so measuring it would describe the wrong thing.
 */
export class BlockedPageError extends PixelpactError {
  constructor(message: string, options?: ErrorOptions) {
    super(message, 'ERR_BLOCKED', options)
  }
}

/** A url would not load, or a selector matched no element on the page. */
export class TargetNotFoundError extends PixelpactError {
  constructor(message: string, options?: ErrorOptions) {
    super(message, 'ERR_TARGET', options)
  }
}
