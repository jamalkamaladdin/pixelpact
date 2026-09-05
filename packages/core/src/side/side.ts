import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import pixelmatch from 'pixelmatch'
import type { Browser } from 'playwright'
import { PNG } from 'pngjs'
import {
  freezeAnimations as applyAnimationFreeze,
  captureFullPage,
  closeQuietly,
  launchBrowser,
  openPage,
  type ShotOptions,
} from '../browser.js'
import { type ResolvedSideOptions, resolveSideOptions } from '../defaults.js'
import { resizeCanvas } from '../diff.js'
import { ContractError, TargetNotFoundError } from '../errors.js'
import type { ProgressEvent, SideOptions, SideReport, SideSection, Viewport } from '../types.js'
import { CONTRACT_VERSION } from '../types.js'
import { clusterMask, diffMask } from './cluster.js'
import { composeSideImage, type SideFact } from './compose.js'
import {
  commonCanvas,
  cropWindow,
  dedupeSlugs,
  deriveLabel,
  deriveSlug,
  matchesOnly,
  pairSections,
  type RawSection,
  type SectionScan,
  sectionScanner,
} from './segment.js'

type Progress = (event: ProgressEvent) => void

const announce = (onProgress: Progress | undefined, event: ProgressEvent): void => {
  if (onProgress) onProgress(event)
}

/** Viewport height every width is opened at before the page is measured. */
const CAPTURE_HEIGHT = 1000

/** A height difference larger than this is worth naming on the picture. */
const HEIGHT_TOLERANCE = 8

/** One page, captured whole and split into sections. */
interface PageCapture {
  image: PNG
  scan: SectionScan
}

/**
 * Run the segmenter inside the page.
 *
 * The function is sent as an expression rather than injected with a script tag,
 * so a site with a strict `script-src` policy cannot refuse it.
 */
function scanExpression(selector: string | null, minHeight: number): string {
  return `(${sectionScanner.toString()})(${JSON.stringify(selector)}, ${JSON.stringify(minHeight)})`
}

/** Cut one section out of a full page screenshot. */
function cropPng(png: PNG, top: number, height: number): PNG {
  const out = new PNG({ width: png.width, height })
  PNG.bitblt(png, out, 0, top, png.width, height, 0, 0)
  return out
}

/**
 * Load one page, screenshot the whole of it, and split it into sections.
 *
 * The sections are measured after the capture rather than before it: the
 * capture scrolls and decodes the page, and a section measured before that
 * carries the height of a hero whose image had not arrived yet.
 */
async function capturePage(
  browser: Browser,
  url: string,
  viewport: Viewport,
  options: ResolvedSideOptions,
  file: string,
): Promise<PageCapture> {
  const session = await openPage(browser, viewport, url, options)
  try {
    if (options.freezeAnimations) {
      await applyAnimationFreeze(session.page)
    }

    const shot: ShotOptions = { path: file }
    if (options.masks.length > 0) {
      shot.mask = options.masks.map((mask) => session.page.locator(mask))
      shot.maskColor = '#FF00FF'
    }
    await captureFullPage(session.page, shot)

    const scan = await session.page.evaluate<SectionScan>(
      scanExpression(options.sectionsSelector, options.minSectionHeight),
    )
    return { image: PNG.sync.read(await readFile(file)), scan }
  } finally {
    await closeQuietly(session.context)
  }
}

/** The message for a declared section root that is not on one of the pages. */
function missingRoot(selector: string, url: string, width: number): TargetNotFoundError {
  return new TargetNotFoundError(
    'The section root "' +
      selector +
      '" matches nothing at ' +
      url +
      ' (width ' +
      width +
      'px). Splitting a different element and calling its parts sections would ' +
      'put a picture of one thing under the name of another, so nothing was ' +
      'compared. Pass a selector that exists on both pages, or leave ' +
      'sectionsSelector unset to use main.',
  )
}

/** The evidence printed under the two pictures of one section. */
function factsFor(
  reference: RawSection,
  target: RawSection,
  differentPixels: number,
  totalPixels: number,
  percent: number,
  threshold: number,
): SideFact[] {
  const heightDelta = target.height - reference.height
  const signed = (value: number): string => (value > 0 ? `+${value}` : String(value))
  return [
    {
      state: percent <= threshold ? 'pass' : 'fail',
      text:
        `Pixels: ${differentPixels} of ${totalPixels} differ, ${percent.toFixed(3)}% ` +
        `against a budget of ${threshold}%.`,
    },
    {
      state: Math.abs(heightDelta) <= HEIGHT_TOLERANCE ? 'pass' : 'info',
      text:
        `Height: reference ${reference.height}px, implementation ${target.height}px ` +
        `(${signed(heightDelta)}px).`,
    },
    {
      state: 'info',
      text: `Elements: reference ${reference.elements}, implementation ${target.elements}.`,
    },
  ]
}

/**
 * Compare a reference page against an implementation, section by section.
 *
 * `check` returns properties and `diff` returns one percentage for a whole
 * page. Neither says *where* a page is wrong. This splits both pages into
 * sections, pairs them by position, and writes one image per pair: the
 * reference on the left, the implementation on the right, both at the same
 * scale, the differing clusters boxed in red, and a header carrying the slug,
 * the width and the percentage. That image is the artefact a person looks at
 * before calling a page finished.
 *
 * Sections are the visible element children of `sectionsSelector`, or of `main`
 * when the page has one and `body` otherwise. Pairing is by position: when the
 * two pages disagree on how many sections they have, the surplus is counted in
 * `unmatched` and reported as a warning rather than paired with a guess.
 *
 * @throws TargetNotFoundError when a page does not load, when a declared
 *   section root matches nothing, or when no section could be compared at all
 * @throws ContractError when the options ask for no width at all
 * @throws BrowserUnavailableError when playwright or a browser binary is missing
 *
 * @example
 * ```ts
 * const report = await side({
 *   referenceUrl: 'https://reference.example',
 *   targetUrl: 'http://localhost:3000',
 *   outDir: './pixelpact/side',
 *   widths: [1440, 390],
 * })
 * process.stdout.write(formatSideReport(report, { color: true }))
 * process.exitCode = report.ok ? 0 : 1
 * ```
 */
export async function side(options: SideOptions): Promise<SideReport> {
  const resolved = resolveSideOptions(options)
  const onProgress = options.onProgress

  if (!resolved.referenceUrl || !resolved.targetUrl) {
    throw new TargetNotFoundError(
      'side() needs both a referenceUrl and a targetUrl: it compares the page ' +
        'being reproduced against the page reproducing it.',
    )
  }

  const widths = resolved.widths
    .map((width) => Math.round(width))
    .filter((width) => Number.isFinite(width) && width > 0)
  if (widths.length === 0) {
    throw new ContractError(
      'side() was given no usable width. Pass widths as positive numbers, for ' +
        'example widths: [1440, 390].',
    )
  }

  await mkdir(resolved.outDir, { recursive: true })
  const scratch = await mkdtemp(join(tmpdir(), 'pixelpact-side-'))

  const sections: SideSection[] = []
  const warnings: string[] = []
  const unmatched = { reference: 0, target: 0 }

  announce(onProgress, { phase: 'launch', message: 'starting the browser' })
  const browser = await launchBrowser(resolved)

  try {
    for (const width of widths) {
      const viewport: Viewport = { name: `${width}px`, width, height: CAPTURE_HEIGHT }

      announce(onProgress, {
        phase: 'navigate',
        message: `opening ${resolved.referenceUrl}`,
        viewport: viewport.name,
      })
      const reference = await capturePage(
        browser,
        resolved.referenceUrl,
        viewport,
        resolved,
        join(scratch, `reference-${width}.png`),
      )

      announce(onProgress, {
        phase: 'navigate',
        message: `opening ${resolved.targetUrl}`,
        viewport: viewport.name,
      })
      const target = await capturePage(
        browser,
        resolved.targetUrl,
        viewport,
        resolved,
        join(scratch, `target-${width}.png`),
      )

      const declared = resolved.sectionsSelector
      if (declared) {
        if (!reference.scan.rootFound) throw missingRoot(declared, resolved.referenceUrl, width)
        if (!target.scan.rootFound) throw missingRoot(declared, resolved.targetUrl, width)
      }

      const pairing = pairSections(reference.scan.sections, target.scan.sections)
      unmatched.reference += pairing.unmatched.reference
      unmatched.target += pairing.unmatched.target

      if (pairing.unmatched.reference > 0 || pairing.unmatched.target > 0) {
        warnings.push(
          `At ${width}px the reference has ${reference.scan.sections.length} sections under ` +
            `"${reference.scan.root}" and the implementation has ` +
            `${target.scan.sections.length} under "${target.scan.root}". The ` +
            `${pairing.unmatched.reference + pairing.unmatched.target} section(s) with no ` +
            'counterpart were not compared, because pairing them with something else would ' +
            'report on the wrong element.',
        )
      }

      if (pairing.pairs.length === 0) {
        warnings.push(
          `At ${width}px there was no section to compare: "${reference.scan.root}" has no ` +
            `visible child taller than ${resolved.minSectionHeight}px on both pages. Pass ` +
            'sectionsSelector to point at the container that holds the sections.',
        )
        continue
      }

      const widthDir = join(resolved.outDir, String(width))
      await mkdir(widthDir, { recursive: true })

      const slugs = dedupeSlugs(
        reference.scan.sections.map((section, index) => deriveSlug(section, index + 1)),
      )

      for (const pair of pairing.pairs) {
        const slug = slugs[pair.index - 1]
        if (!matchesOnly(pair.index, slug, resolved.only)) continue

        announce(onProgress, {
          phase: 'compare',
          message: `comparing ${slug}`,
          viewport: viewport.name,
          current: pair.index,
          total: pairing.pairs.length,
        })

        const referenceWindow = cropWindow(
          pair.reference.top,
          pair.reference.height,
          reference.image.height,
        )
        const targetWindow = cropWindow(pair.target.top, pair.target.height, target.image.height)
        const left = cropPng(reference.image, referenceWindow.top, referenceWindow.height)
        const right = cropPng(target.image, targetWindow.top, targetWindow.height)

        const canvas = commonCanvas(left, right)
        const a = resizeCanvas(left, canvas.width, canvas.height)
        const b = resizeCanvas(right, canvas.width, canvas.height)
        const output = new PNG({ width: canvas.width, height: canvas.height })
        const differentPixels = pixelmatch(
          a.data,
          b.data,
          output.data,
          canvas.width,
          canvas.height,
          { threshold: 0.1, includeAA: false, alpha: 0.3, diffColor: [255, 0, 0] },
        )

        const totalPixels = canvas.width * canvas.height
        const raw = totalPixels > 0 ? (differentPixels / totalPixels) * 100 : 0
        const percent = Math.round(raw * 1000) / 1000
        const ok = percent <= resolved.threshold
        const clusters = clusterMask(
          diffMask(output.data, canvas.width, canvas.height),
          canvas.width,
          canvas.height,
        )

        const image = join(widthDir, `${String(pair.index).padStart(2, '0')}-${slug}.png`)
        announce(onProgress, {
          phase: 'screenshot',
          message: `composing ${slug}`,
          viewport: viewport.name,
        })
        await composeSideImage(
          browser,
          {
            slug,
            label: deriveLabel(pair.reference),
            width,
            percent,
            threshold: resolved.threshold,
            ok,
            referenceUrl: resolved.referenceUrl,
            targetUrl: resolved.targetUrl,
            canvasWidth: canvas.width,
            columnWidth: resolved.columnWidth,
            clusters,
            facts: factsFor(
              pair.reference,
              pair.target,
              differentPixels,
              totalPixels,
              percent,
              resolved.threshold,
            ),
            reference: a,
            target: b,
          },
          image,
        )

        sections.push({
          index: pair.index,
          slug,
          label: deriveLabel(pair.reference),
          width,
          totalPixels,
          differentPixels,
          differentPercent: percent,
          ok,
          image,
          boxes: clusters.map((cluster) => ({
            x: cluster.x,
            y: cluster.y,
            w: cluster.w,
            h: cluster.h,
          })),
        })
      }
    }
  } finally {
    await closeQuietly(browser)
    await rm(scratch, { recursive: true, force: true })
  }

  if (sections.length === 0) {
    throw new TargetNotFoundError(
      'Not one section was compared, so there is no number and no picture to ' +
        'show. ' +
        (resolved.only === null
          ? 'Neither page offered a section under the root that was used: pass ' +
            'sectionsSelector to point at the container that holds them.'
          : `Nothing matched only: ${JSON.stringify(resolved.only)}. Run without ` +
            'only to see the sections and their slugs.'),
    )
  }

  const passed = sections.filter((section) => section.ok).length
  announce(onProgress, { phase: 'done', message: 'side by side comparison complete' })

  return {
    version: CONTRACT_VERSION,
    reference: resolved.referenceUrl,
    target: resolved.targetUrl,
    checkedAt: new Date().toISOString(),
    widths,
    threshold: resolved.threshold,
    sections,
    unmatched,
    totals: {
      sections: sections.length,
      passed,
      failed: sections.length - passed,
    },
    ok: passed === sections.length && unmatched.reference === 0 && unmatched.target === 0,
    warnings,
  }
}
