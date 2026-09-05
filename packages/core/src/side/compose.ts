import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import type { Browser } from 'playwright'
import { PNG } from 'pngjs'
import { closeQuietly } from '../browser.js'
import type { DiffCluster } from './cluster.js'
import { scaleBox } from './segment.js'

/** One line of evidence printed under the two pictures. */
export interface SideFact {
  /** `pass` and `fail` carry a verdict, `info` is context that decides nothing. */
  state: 'pass' | 'fail' | 'info'
  text: string
}

/** Everything the report page needs, with the two pictures already addressable. */
export interface SideHtmlInput {
  slug: string
  label: string
  /** Viewport width this pair was captured at. */
  width: number
  /** Share of differing pixels, in percent. */
  percent: number
  /** The budget that percentage was judged against. */
  threshold: number
  ok: boolean
  referenceUrl: string
  targetUrl: string
  /** `src` of the reference picture, relative to the report page. */
  referenceImage: string
  /** `src` of the implementation picture, relative to the report page. */
  targetImage: string
  /** Width of the compared canvas, which both pictures share. */
  canvasWidth: number
  /** Width each picture is drawn at. */
  columnWidth: number
  /** Difference clusters, in canvas coordinates. */
  clusters: DiffCluster[]
  facts: SideFact[]
}

/** The two pictures as decoded images, for {@link composeSideImage}. */
export type SideImageInput = Omit<SideHtmlInput, 'referenceImage' | 'targetImage'> & {
  reference: PNG
  target: PNG
}

/** Text that goes between tags or inside an attribute has to be inert. */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

const MARK = { pass: '&#10003;', fail: '&#10007;', info: '&#183;' }

/**
 * Build the report page for one section.
 *
 * Pure on purpose: no browser and no disk, so the markup can be asserted on
 * directly. Both pictures are drawn at the same width, and the boxes are scaled
 * once from the shared canvas, which is what makes the two halves comparable by
 * eye rather than only by number.
 *
 * @example
 * ```ts
 * const html = buildSideHtml({ ...input, referenceImage: 'a.png', targetImage: 'b.png' })
 * ```
 */
export function buildSideHtml(input: SideHtmlInput): string {
  const column = Math.max(1, Math.round(input.columnWidth))
  const scale = input.canvasWidth > 0 ? column / input.canvasWidth : 1
  const verdict = input.ok ? 'PASS' : 'FAIL'
  const percent = input.percent.toFixed(3)

  const boxes = input.clusters
    .map((cluster, index) => {
      const box = scaleBox(cluster, scale)
      const style = `left:${box.x}px;top:${box.y}px;width:${box.w}px;height:${box.h}px`
      return `<div class="box" style="${style}"><span class="tag">${index + 1}</span></div>`
    })
    .join('')

  const half = (kind: string, caption: string, url: string, image: string): string =>
    `<figure class="col"><figcaption class="cap ${kind}">${caption} &mdash; ` +
    `<span class="url">${escapeHtml(url)}</span></figcaption>` +
    `<div class="frame"><img alt="${caption}" src="${escapeHtml(image)}">${boxes}</div></figure>`

  const facts = input.facts
    .map(
      (fact) =>
        `<li class="fact ${fact.state}"><b>${MARK[fact.state]}</b><span>${fact.text}</span></li>`,
    )
    .join('')

  const spots = input.clusters
    .map(
      (cluster, index) =>
        `<li class="fact spot"><b>${index + 1}</b><span>Difference of ` +
        `${cluster.w}&times;${cluster.h}px, ${cluster.y}px below the top of the section.` +
        '</span></li>',
    )
    .join('')

  const title = `${escapeHtml(input.slug)} at ${input.width}px`

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${title}</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{background:#0d0d10;color:#fff;padding:24px;
 font-family:"DejaVu Sans","Liberation Sans",Arial,Helvetica,sans-serif}
.head{border-left:6px solid ${input.ok ? '#2ecc71' : '#ff2d2d'};padding:2px 0 2px 14px;margin-bottom:18px}
.head h1{font-size:22px;letter-spacing:.2px}
.head .meta{font-size:15px;margin-top:6px}
.head .meta b{color:${input.ok ? '#7ee2a8' : '#ff8a8a'}}
.head .label{font-size:13px;color:#9aa3b2;margin-top:4px}
.cols{display:flex;gap:22px;align-items:flex-start}
.col{width:${column}px}
.cap{font-size:14px;font-weight:700;padding:7px 10px;border-radius:6px;margin-bottom:8px;
 white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.cap.ref{background:#14361f;color:#b9f6ca}
.cap.imp{background:#3b1717;color:#ffc9c9}
.cap .url{font-weight:400;opacity:.75}
.frame{position:relative;line-height:0;border:2px solid #2a2a33;border-radius:6px;overflow:hidden;
 background:#fff}
.frame img{width:${column}px;display:block}
.box{position:absolute;border:3px solid #ff2d2d;border-radius:4px;
 box-shadow:0 0 0 1px rgba(0,0,0,.6),0 0 14px rgba(255,45,45,.5)}
.box .tag{position:absolute;left:-3px;top:-3px;background:#ff2d2d;color:#fff;
 font:700 13px/22px Arial,sans-serif;width:22px;height:22px;text-align:center;
 border-radius:4px 0 6px 0}
.facts{list-style:none;margin-top:18px;width:${column * 2 + 22}px;
 display:flex;flex-direction:column;gap:7px}
.fact{display:flex;gap:10px;font-size:14px;line-height:1.45;background:#16161c;
 padding:9px 12px;border-radius:6px;border-left:3px solid #2a2a33}
.fact b{flex:0 0 auto;width:22px;height:22px;border-radius:4px;color:#fff;
 font:700 13px/22px Arial,sans-serif;text-align:center;background:#2a2a33}
.fact.pass{border-left-color:#2ecc71}
.fact.pass b{background:#1b8f3a}
.fact.fail{border-left-color:#ff2d2d}
.fact.fail b{background:#ff2d2d}
.fact.spot b{background:#ff2d2d}
</style>
</head>
<body>
<header class="head">
<h1>${escapeHtml(input.slug)}</h1>
<p class="meta">${input.width}px &middot; <b>${percent}% different</b> &middot; budget ${input.threshold}% &middot; <b>${verdict}</b></p>
<p class="label">${escapeHtml(input.label)}</p>
</header>
<div class="cols">
${half('ref', 'REFERENCE', input.referenceUrl, input.referenceImage)}
${half('imp', 'IMPLEMENTATION', input.targetUrl, input.targetImage)}
</div>
<ul class="facts">${facts}${spots}</ul>
</body>
</html>`
}

/** Space around and between the two columns of the report page. */
const PAGE_GUTTER = 90

/** Report pages are screenshotted whole, so the viewport only has to be small. */
const SHORT_VIEWPORT = 200

/** How long the local report page may take to load. */
const LOAD_TIMEOUT = 30000

/** Time for fonts and layout to settle before the shot. */
const SETTLE_MS = 250

/**
 * Render the report page and screenshot it into one png.
 *
 * The page is written to a scratch directory under the system temp directory
 * together with the two pictures, loaded from there, and the whole directory is
 * removed afterwards. Only `outFile` survives, and only where the caller asked
 * for it.
 *
 * @param outFile - absolute path of the composed png
 *
 * @example
 * ```ts
 * await composeSideImage(browser, input, '/tmp/out/1440/01-hero.png')
 * ```
 */
export async function composeSideImage(
  browser: Browser,
  input: SideImageInput,
  outFile: string,
): Promise<void> {
  const scratch = await mkdtemp(join(tmpdir(), 'pixelpact-side-'))
  const referenceImage = 'reference.png'
  const targetImage = 'target.png'

  try {
    await writeFile(join(scratch, referenceImage), PNG.sync.write(input.reference))
    await writeFile(join(scratch, targetImage), PNG.sync.write(input.target))
    const page = join(scratch, 'report.html')
    await writeFile(page, buildSideHtml({ ...input, referenceImage, targetImage }))

    const column = Math.max(1, Math.round(input.columnWidth))
    // A short viewport with a full page screenshot: the shot is then exactly as
    // tall as the report, instead of carrying a strip of empty background
    // whenever the section is small.
    const shot = await browser.newPage({
      viewport: { width: column * 2 + PAGE_GUTTER, height: SHORT_VIEWPORT },
      deviceScaleFactor: 1,
    })
    try {
      await shot.goto(pathToFileURL(page).href, { waitUntil: 'load', timeout: LOAD_TIMEOUT })
      await shot.waitForTimeout(SETTLE_MS)
      await shot.screenshot({ path: outFile, fullPage: true })
    } finally {
      await closeQuietly(shot)
    }
  } finally {
    await rm(scratch, { recursive: true, force: true })
  }
}
