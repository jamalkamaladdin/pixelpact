import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { z } from 'zod'
import { ContractError } from './errors.js'
import type { BrowserOptions, Contract, Viewport } from './types.js'
import { CONTRACT_VERSION } from './types.js'

const viewportSchema = z.object({
  name: z.string().min(1),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
})

const styleMapSchema = z.record(z.string(), z.string())

const elementSchema = z.object({
  selector: z.string().min(1),
  tag: z.string().min(1),
  contractId: z.string().nullable().default(null),
  classes: z.array(z.string()).default([]),
  text: z.string().default(''),
  box: z.object({
    x: z.number(),
    y: z.number(),
    w: z.number(),
    h: z.number(),
  }),
  styles: styleMapSchema.default({}),
  interactive: z.boolean().default(false),
  hover: styleMapSchema.optional(),
  focus: styleMapSchema.optional(),
  before: styleMapSchema.optional(),
  after: styleMapSchema.optional(),
})

const snapshotSchema = z.object({
  documentHeight: z.number().default(0),
  truncated: z.boolean().default(false),
  visibleTotal: z.number().default(0),
  elements: z.array(elementSchema),
})

const keyframeStepSchema = z.object({ offset: z.string(), css: z.string() })

/**
 * Options are stored so a check can measure the implementation exactly the way
 * the reference was measured. Every field has a default, so a hand written
 * contract only has to declare what it wants to change.
 */
const optionsSchema = z.object({
  url: z.string().default(''),
  selector: z.string().nullable().default(null),
  viewports: z.array(viewportSchema).default([]),
  maxElements: z.number().default(600),
  maxStates: z.number().default(120),
  masks: z.array(z.string()).default([]),
  freezeAnimations: z.boolean().default(true),
  fullPage: z.boolean().default(true),
  screenshotDir: z.string().nullable().default(null),
  headless: z.boolean().default(true),
  channel: z.string().nullable().default(null),
  executablePath: z.string().nullable().default(null),
  locale: z.string().default('en-US'),
  timezone: z.string().default('UTC'),
  userAgent: z.string().nullable().default(null),
  stealth: z.boolean().default(true),
  wait: z.number().default(2000),
  dismissOverlays: z.boolean().default(true),
  timeout: z.number().default(30000),
})

/**
 * A contract written by 0.1.x has no `type` on its source, and every contract
 * written before Figma existed came from a url, so the default fills that in
 * and both shapes parse.
 */
const sourceSchema = z.object({
  type: z.enum(['url', 'figma']).default('url'),
  value: z.string().min(1),
})

/** Where in Figma the contract was taken from. Only on Figma contracts. */
const figmaOriginSchema = z.object({
  fileKey: z.string().min(1),
  nodeId: z.string().nullable().default(null),
  fileName: z.string().default(''),
  lastModified: z.string().default(''),
})

const contractSchema = z.object({
  version: z.literal(CONTRACT_VERSION),
  source: sourceSchema,
  figma: figmaOriginSchema.optional(),
  root: z.string().min(1).default('body'),
  extractedAt: z.string().min(1),
  viewports: z.array(viewportSchema).min(1),
  masks: z.array(z.string()).default([]),
  options: optionsSchema.default({
    url: '',
    selector: null,
    viewports: [],
    maxElements: 600,
    maxStates: 120,
    masks: [],
    freezeAnimations: true,
    fullPage: true,
    screenshotDir: null,
    headless: true,
    channel: null,
    executablePath: null,
    locale: 'en-US',
    timezone: 'UTC',
    userAgent: null,
    stealth: true,
    wait: 2000,
    dismissOverlays: true,
    timeout: 30000,
  }),
  tokens: z.record(z.string(), z.string()).default({}),
  keyframes: z.record(z.string(), z.array(keyframeStepSchema)).default({}),
  screenshots: z.record(z.string(), z.string()).default({}),
  byViewport: z.record(z.string(), snapshotSchema),
  warnings: z.array(z.string()).default([]),
})

/** Turn zod issues into something a person can act on without reading zod docs. */
function describe(error: z.ZodError): string {
  const lines = error.issues.slice(0, 20).map((issue) => {
    const path = issue.path.map((part) => String(part)).join('.')
    return `  ${path || '(root)'}: ${issue.message}`
  })
  const extra =
    error.issues.length > lines.length
      ? `\n  ... and ${error.issues.length - lines.length} more`
      : ''
  const count = error.issues.length === 1 ? '1 problem' : `${error.issues.length} problems`
  return `Contract is not valid (${count}):\n${lines.join('\n')}${extra}`
}

/**
 * Validate unknown data as a {@link Contract}.
 *
 * Missing containers such as `masks`, `warnings` or `tokens` are filled in, so
 * a hand written contract stays short. Anything else that does not fit throws
 * a {@link ContractError} naming the exact path.
 *
 * @throws ContractError when the input is not a contract of this version
 *
 * @example
 * ```ts
 * const contract = parseContract(JSON.parse(text))
 * ```
 */
export function parseContract(input: unknown): Contract {
  const result = contractSchema.safeParse(input)
  if (!result.success) {
    const hint =
      '\nA contract is produced by extract() and written with writeContract().' +
      ' Expected version ' +
      CONTRACT_VERSION +
      '.'
    throw new ContractError(describe(result.error) + hint)
  }
  return result.data
}

/**
 * Read and validate a contract from disk.
 *
 * @throws ContractError when the file is missing, is not JSON, or is not a valid contract
 *
 * @example
 * ```ts
 * const contract = await readContract('./pixelpact.contract.json')
 * ```
 */
export async function readContract(path: string): Promise<Contract> {
  let text: string
  try {
    text = await readFile(path, 'utf8')
  } catch (error) {
    throw new ContractError(
      'Could not read the contract file "' +
        path +
        '": ' +
        (error instanceof Error ? error.message : String(error)) +
        '. Check the path, or create the contract with extract() and writeContract().',
      { cause: error },
    )
  }

  let data: unknown
  try {
    data = JSON.parse(text)
  } catch (error) {
    throw new ContractError(
      'The contract file "' +
        path +
        '" is not valid JSON: ' +
        (error instanceof Error ? error.message : String(error)),
      { cause: error },
    )
  }

  try {
    return parseContract(data)
  } catch (error) {
    if (error instanceof ContractError) {
      throw new ContractError(`${path}\n${error.message}`, { cause: error })
    }
    throw error
  }
}

/**
 * Validate a contract and write it as formatted JSON, creating the directory
 * if it does not exist.
 *
 * @throws ContractError when the contract does not validate
 *
 * @example
 * ```ts
 * await writeContract('./pixelpact.contract.json', contract)
 * ```
 */
export async function writeContract(path: string, contract: Contract): Promise<void> {
  const validated = parseContract(contract)
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, `${JSON.stringify(validated, null, 2)}\n`, 'utf8')
}

/**
 * Pick the viewport a check or a diff should run at.
 *
 * @param name - a viewport name from the contract, or `null` for the first one
 * @throws ContractError when the contract does not declare that viewport
 *
 * @example
 * ```ts
 * const viewport = selectViewport(contract, 'mobile')
 * ```
 */
export function selectViewport(contract: Contract, name: string | null): Viewport {
  const first = contract.viewports[0]
  if (!name) {
    if (!first) {
      throw new ContractError(
        'The contract declares no viewports, so there is nothing to compare against. ' +
          'Re-extract the reference.',
      )
    }
    return first
  }
  const found = contract.viewports.find((viewport) => viewport.name === name)
  if (!found) {
    throw new ContractError(
      'The contract has no viewport named "' +
        name +
        '". It declares: ' +
        contract.viewports.map((viewport) => viewport.name).join(', ') +
        '.',
    )
  }
  return found
}

/**
 * The rendering settings the reference was measured under.
 *
 * Locale, time zone, settle time, stealth and overlay handling decide what a
 * page renders, so an implementation measured with different values fails for
 * reasons that have nothing to do with its CSS. They are inherited from the
 * contract unless the caller states otherwise. Machine settings such as
 * `headless`, `channel`, `executablePath` and `timeout` are never inherited:
 * they describe the computer running the check, not the comparison.
 *
 * @example
 * ```ts
 * const merged = { ...options, ...inheritedRenderingOptions(contract, options) }
 * ```
 */
export function inheritedRenderingOptions(
  contract: Contract,
  options: BrowserOptions,
): BrowserOptions {
  const stored = contract.options
  return {
    locale: options.locale ?? stored.locale,
    timezone: options.timezone ?? stored.timezone,
    wait: options.wait ?? stored.wait,
    stealth: options.stealth ?? stored.stealth,
    dismissOverlays: options.dismissOverlays ?? stored.dismissOverlays,
    userAgent: options.userAgent ?? stored.userAgent,
  }
}
