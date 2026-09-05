import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  inheritedRenderingOptions,
  parseContract,
  readContract,
  selectViewport,
  writeContract,
} from '../src/contract.js'
import { ContractError } from '../src/errors.js'
import type { Contract } from '../src/types.js'

const minimal = () => ({
  version: 1,
  source: { type: 'url', value: 'https://reference.example' },
  extractedAt: '2026-01-01T00:00:00.000Z',
  viewports: [
    { name: 'desktop', width: 1440, height: 900 },
    { name: 'mobile', width: 390, height: 844 },
  ],
  byViewport: {
    desktop: {
      documentHeight: 2400,
      truncated: false,
      visibleTotal: 2,
      elements: [
        {
          selector: 'main > h1',
          tag: 'h1',
          box: { x: 0, y: 120, w: 600, h: 48 },
          styles: { color: 'rgb(0, 0, 0)', 'font-size': '48px' },
          hover: { color: 'rgb(0, 90, 200)' },
        },
      ],
    },
  },
})

let directory: string

beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), 'pixelpact-contract-'))
})

afterAll(async () => {
  await rm(directory, { recursive: true, force: true })
})

describe('parseContract', () => {
  it('fills in the containers a hand written contract leaves out', () => {
    const contract = parseContract(minimal())
    expect(contract.root).toBe('body')
    expect(contract.masks).toEqual([])
    expect(contract.warnings).toEqual([])
    expect(contract.tokens).toEqual({})
    expect(contract.screenshots).toEqual({})
  })

  it('fills in the extraction options with the portable defaults', () => {
    const contract = parseContract(minimal())
    expect(contract.options.timezone).toBe('UTC')
    expect(contract.options.locale).toBe('en-US')
    expect(contract.options.maxElements).toBe(600)
  })

  it('keeps the measured element and its hover state', () => {
    const contract = parseContract(minimal())
    const element = contract.byViewport.desktop?.elements[0]
    expect(element?.selector).toBe('main > h1')
    expect(element?.contractId).toBeNull()
    expect(element?.interactive).toBe(false)
    expect(element?.hover).toEqual({ color: 'rgb(0, 90, 200)' })
  })

  it('refuses a contract written by a different format version', () => {
    const wrong = { ...minimal(), version: 2 }
    expect(() => parseContract(wrong)).toThrow(ContractError)
    expect(() => parseContract(wrong)).toThrow(/Expected version 1/)
  })

  it('names the exact path of a bad value', () => {
    const broken = minimal()
    broken.viewports[0].width = -5
    expect(() => parseContract(broken)).toThrow(/viewports\.0\.width/)
  })

  it('refuses a contract with no measurements at all', () => {
    const broken: Record<string, unknown> = { ...minimal() }
    delete broken.byViewport
    expect(() => parseContract(broken)).toThrow(/byViewport/)
  })

  it('refuses something that is not an object', () => {
    const error = (() => {
      try {
        parseContract('not a contract')
        return null
      } catch (thrown) {
        return thrown
      }
    })()
    expect(error).toBeInstanceOf(ContractError)
    expect((error as ContractError).code).toBe('ERR_CONTRACT')
  })
})

describe('readContract and writeContract', () => {
  it('survives a round trip through disk', async () => {
    const path = join(directory, 'roundtrip.json')
    const original = parseContract(minimal())
    await writeContract(path, original)
    const reloaded = await readContract(path)
    expect(reloaded).toEqual(original)
  })

  it('creates the directory it writes into', async () => {
    const path = join(directory, 'nested', 'deeper', 'contract.json')
    await writeContract(path, parseContract(minimal()))
    await expect(readContract(path)).resolves.toMatchObject({ version: 1 })
  })

  it('explains a missing file by naming it', async () => {
    const path = join(directory, 'absent.json')
    await expect(readContract(path)).rejects.toThrow(ContractError)
    await expect(readContract(path)).rejects.toThrow(/absent\.json/)
  })

  it('explains a file that is not JSON', async () => {
    const path = join(directory, 'broken.json')
    await writeFile(path, '{ this is not json', 'utf8')
    await expect(readContract(path)).rejects.toThrow(/not valid JSON/)
  })

  it('refuses to write something that is not a contract', async () => {
    const path = join(directory, 'never-written.json')
    const invalid = { version: 1 } as unknown as Contract
    await expect(writeContract(path, invalid)).rejects.toThrow(ContractError)
  })
})

describe('selectViewport', () => {
  it('takes the first viewport when none is named', () => {
    expect(selectViewport(parseContract(minimal()), null).name).toBe('desktop')
  })

  it('takes the viewport that was asked for', () => {
    expect(selectViewport(parseContract(minimal()), 'mobile').width).toBe(390)
  })

  it('lists what the contract does have when the name is unknown', () => {
    expect(() => selectViewport(parseContract(minimal()), 'watch')).toThrow(/desktop, mobile/)
  })
})

describe('inheritedRenderingOptions', () => {
  it('takes the rendering settings the reference was measured under', () => {
    const contract = parseContract({
      ...minimal(),
      options: { locale: 'de-DE', timezone: 'Europe/Berlin', wait: 5000 },
    })
    const inherited = inheritedRenderingOptions(contract, {})
    expect(inherited.locale).toBe('de-DE')
    expect(inherited.timezone).toBe('Europe/Berlin')
    expect(inherited.wait).toBe(5000)
  })

  it('lets the caller override any of them', () => {
    const contract = parseContract({ ...minimal(), options: { locale: 'de-DE' } })
    const inherited = inheritedRenderingOptions(contract, { locale: 'fr-FR' })
    expect(inherited.locale).toBe('fr-FR')
  })

  it('never inherits machine settings such as the channel', () => {
    const contract = parseContract({ ...minimal(), options: { channel: 'chrome' } })
    expect(inheritedRenderingOptions(contract, {})).not.toHaveProperty('channel')
  })
})
