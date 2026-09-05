import { BrowserUnavailableError, ContractError } from '@pixelpact/core'
import { describe, expect, it } from 'vitest'
import {
  describeError,
  EXIT_FAIL,
  EXIT_OK,
  EXIT_RUNTIME,
  EXIT_USAGE,
  exitCodeForReport,
} from '../src/errors.js'
import { UsageError } from '../src/options.js'

describe('exitCodeForReport', () => {
  it('maps an ok report to exit code 0', () => {
    expect(exitCodeForReport({ ok: true })).toBe(EXIT_OK)
  })

  it('maps a failing report (deviations or threshold exceeded) to exit code 1', () => {
    expect(exitCodeForReport({ ok: false })).toBe(EXIT_FAIL)
  })
})

describe('describeError', () => {
  it('maps a UsageError to exit code 2', () => {
    const { exitCode } = describeError(new UsageError('bad flag'))
    expect(exitCode).toBe(EXIT_USAGE)
  })

  it('maps a missing file (ENOENT) to exit code 2', () => {
    const err = Object.assign(new Error('no such file'), { code: 'ENOENT', path: 'contract.json' })
    const { exitCode, message } = describeError(err, { file: 'contract.json' })
    expect(exitCode).toBe(EXIT_USAGE)
    expect(message).toContain('contract.json')
  })

  it('maps a core ContractError to exit code 2', () => {
    const err = new ContractError('missing version field')
    const { exitCode } = describeError(err)
    expect(exitCode).toBe(EXIT_USAGE)
  })

  it('maps a core BrowserUnavailableError to exit code 3', () => {
    const err = new BrowserUnavailableError('no chromium binary found')
    const { exitCode } = describeError(err)
    expect(exitCode).toBe(EXIT_RUNTIME)
  })

  it('maps an unrecognised cac usage error (by name) to exit code 2', () => {
    const err = Object.assign(new Error('missing required arg `<url>`'), { name: 'CACError' })
    const { exitCode } = describeError(err)
    expect(exitCode).toBe(EXIT_USAGE)
  })

  it('maps an unexpected error to exit code 3', () => {
    const { exitCode } = describeError(new Error('boom'))
    expect(exitCode).toBe(EXIT_RUNTIME)
  })
})
