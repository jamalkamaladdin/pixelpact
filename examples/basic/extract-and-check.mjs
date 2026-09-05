/**
 * Extract a visual contract from a reference page, then measure a second page against it.
 *
 * Run it with two urls:
 *   node extract-and-check.mjs https://reference.example.com http://localhost:3000
 *
 * Requires a browser:
 *   pnpm exec playwright install chromium
 */
import { mkdir } from 'node:fs/promises'
import { check, extract, formatCheckReport, writeContract } from '@pixelpact/core'

const [referenceUrl, implementationUrl] = process.argv.slice(2)

if (!referenceUrl || !implementationUrl) {
  console.error('usage: node extract-and-check.mjs <reference-url> <implementation-url>')
  process.exit(2)
}

const outDir = new URL('./out/', import.meta.url).pathname
await mkdir(outDir, { recursive: true })

const contract = await extract({
  url: referenceUrl,
  selector: 'body',
  viewports: [{ name: 'desktop', width: 1440, height: 900 }],
  screenshotDir: outDir,
  onProgress: (event) => process.stderr.write(`  ${event.phase}: ${event.message}\n`),
})

await writeContract(`${outDir}contract.json`, contract)

const elements = contract.byViewport.desktop?.elements.length ?? 0
console.log(`\ncontract written: ${elements} elements from ${referenceUrl}\n`)

const report = await check(contract, {
  url: implementationUrl,
  viewport: 'desktop',
  onProgress: (event) => process.stderr.write(`  ${event.phase}: ${event.message}\n`),
})

console.log(formatCheckReport(report, { color: process.stdout.isTTY === true }))

process.exitCode = report.ok ? 0 : 1
