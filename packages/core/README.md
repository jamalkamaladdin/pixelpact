# pixelpact-core

Measure what a reference page actually looks like, store it as a contract, then
hold an implementation to that contract.

Most visual testing compares a screenshot against an older screenshot of the
same thing. pixelpact compares an implementation against a **reference**: the
design you are rebuilding, the site you are migrating, the page your new
framework has to reproduce. The contract is measured, not written by hand, so
"it looks right" becomes a number.

## Install

```sh
npm install pixelpact-core
npm install playwright        # peer dependency
npx playwright install chromium
```

`playwright` is a peer dependency and is imported lazily. Reading, validating
and formatting contracts works without a browser installed.

## Quick start

```ts
import { check, extract, formatCheckReport, writeContract } from 'pixelpact-core'

const contract = await extract({
  url: 'https://reference.example',
  selector: 'main',
  screenshotDir: './pixelpact',
})
await writeContract('./pixelpact/contract.json', contract)

const report = await check(contract, { url: 'http://localhost:3000' })
process.stdout.write(formatCheckReport(report, { color: true }))
process.exitCode = report.ok ? 0 : 1
```

## What is measured

For every visible element under the root selector, at every viewport:

* the bounding box, in CSS pixels relative to the document
* around seventy computed properties: colour, typography, spacing, borders,
  radii, shadows, layout, transforms, transitions and animations
* the hover and focus states, by actually hovering and focusing the element and
  recording only the declarations that changed
* the `::before` and `::after` pseudo elements when they render content
* the CSS custom properties declared on `:root`, and every `@keyframes` rule
* a screenshot per viewport, when `screenshotDir` is set

## Figma as a source

A contract can also come from a Figma file, read over the REST API. No browser
is launched and nothing is rendered locally.

```ts
import { extractFromFigma, check, writeContract } from 'pixelpact-core'

const contract = await extractFromFigma({
  url: 'https://www.figma.com/design/<file-key>/Site?node-id=1-23',
  token: process.env.FIGMA_TOKEN,   // this is the default
  screenshotDir: './pixelpact',
})
await writeContract('./pixelpact/figma.contract.json', contract)

const report = await check(contract, { url: 'http://localhost:3000' })
```

The token is a Figma personal access token with file content read access,
created under Settings, Security, Personal access tokens. `extractFromFigma`
reads `FIGMA_TOKEN` unless you pass one.

### Matching is different, and this is the whole story

A Figma layer has no CSS selector, so a Figma contract cannot be matched by
path or by tag name. A layer type says nothing about which HTML element
implements it, so pixelpact does not guess. **Matching runs on the layer name.**

Give the layer a name in Figma, then put the same name in the markup:

```html
<a class="btn btn-primary" data-contract="Hero/CTA">Start free</a>
```

Every layer without a matching `data-contract` is reported as missing rather
than skipped. When a check finds no match at all, the report prints the reason
and what to do about it; `figmaMatchHint(report)` returns the same sentence for
a tool that formats its own output.

### What a layer contributes

| Figma | Contract |
| --- | --- |
| layer name | `contractId`, the only thing matching uses |
| node id | `selector`, written `figma:1:23` as a display label |
| node type | `tag`, lowercased: `frame`, `text`, `instance` |
| `absoluteBoundingBox` | `box`, translated so the root frame sits at `0, 0` |
| solid fill | `background-color`, or `color` on a text layer |
| stroke and `strokeWeight` | the four border widths, `border-top-style`, `border-top-color` |
| `cornerRadius`, `rectangleCornerRadii` | the four radius longhands |
| drop shadow | `box-shadow` |
| `opacity` below 1 | `opacity` |
| text style | font family, size, weight, line height, letter spacing, alignment, transform |
| auto layout | `display: flex`, direction, gap, the four paddings, `align-items`, `justify-content` |
| colour styles | `tokens`, keyed by the style name |

Only properties the layer actually carries are written. A gradient or image
fill has no single CSS colour, so the property is left out and the layer is
named in `contract.warnings`. A value that is not in the contract is never
asserted, which is the point: an empty assertion is honest, a guessed one
fails an implementation that is correct.

Hidden layers, and everything under them, are skipped. Hover, focus and pseudo
element states are absent, because Figma has none to read, so a check against a
Figma contract never reports them.

## API

| Function | What it does |
| --- | --- |
| `extract(options)` | Measure a reference page and return a `Contract` |
| `extractFromFigma(options)` | Read a Figma file over the REST API and return a `Contract` |
| `parseFigmaUrl(input)` | Read the file key and node id out of a figma.com url |
| `isFigmaUrl(input)` | True when a string is a figma.com url with a file key |
| `figmaMatchHint(report)` | The `data-contract` advice, when a Figma check matched nothing |
| `check(contract, options)` | Compare a live implementation against the contract |
| `diff(contract, options)` | Compare the implementation to the reference screenshot, pixel by pixel |
| `parseContract(input)` | Validate unknown data as a contract |
| `readContract(path)` | Read and validate a contract from disk |
| `writeContract(path, contract)` | Validate and write a contract as JSON |
| `formatCheckReport(report, options)` | Render a check report as an aligned table |
| `formatDiffReport(report, options)` | Render a diff report as a few lines |
| `DEFAULT_VIEWPORTS` | desktop 1440x900, tablet 768x1024, mobile 390x844 |

### Options

Every browser backed entry point accepts the browser options: `headless`, `channel`,
`executablePath`, `locale`, `timezone`, `userAgent`, `stealth`, `wait`,
`dismissOverlays` and `timeout`. Defaults are portable: locale `en-US`,
time zone `UTC`, and the browser's own user agent.

`extract` adds `selector`, `viewports`, `maxElements`, `maxStates`, `masks`,
`freezeAnimations`, `fullPage` and `screenshotDir`.
`check` adds `viewport`, `selector`, `tolerance` and `maxStates`.
`diff` adds `viewport`, `selector`, `threshold`, `masks` and `outDir`.

`extractFromFigma` launches no browser, so none of the browser options apply to
it. It takes `url`, `token`, `nodeId`, `viewportName`, `maxElements`,
`screenshotDir`, `scale` and `onProgress`.

Configuration is arguments only. Nothing is read from a config file, from the
current working directory or from the environment, with two exceptions:
`executablePath` falls back to `PIXELPACT_CHROMIUM`, so a machine that already
has a browser does not have to download another, and the Figma `token` falls
back to `FIGMA_TOKEN`, so a secret never has to be written into a script.

`check` and `diff` inherit `locale`, `timezone`, `wait`, `stealth`,
`dismissOverlays` and `userAgent` from the contract unless you pass your own.
Those settings decide what a page renders, and measuring the implementation
under different ones produces failures that have nothing to do with its CSS.
Machine settings such as `headless`, `channel` and `timeout` are never
inherited.

### Progress

The library never prints. Pass `onProgress` to follow a long run:

```ts
await extract({
  url: 'https://reference.example',
  onProgress: (event) => process.stderr.write(`${event.phase}: ${event.message}\n`),
})
```

## Reading a check report

```
pixelpact check  FAILED
  target    http://localhost:3000
  reference https://reference.example
  viewport  desktop 1440x900
  elements  128 matched, 2 missing of 130
  checks    2841 passed, 19 failed (99.3% of 2860)

deviations (19)
SELECTOR                    PROPERTY     EXPECTED           ACTUAL             DIFF
main > section > h2         font-size    32px               28px               4px
nav > a:nth-of-type(2)      hover.color  rgb(0, 90, 200)    rgb(0, 0, 0)       76.5 (color)
```

`formatCheckReport` takes `color` (default `false`, ANSI codes emitted by the
library itself) and `limit` (default 20 rows, then a line counting the rest).

## How elements are matched

An implementation rarely has the same DOM as its reference, so matching runs in
three passes, most trustworthy first:

1. `data-contract="..."` on both sides. Add the attribute where you want a
   guaranteed match.
2. An identical CSS path.
3. The same tag carrying the same text.

An element that answers to none of the three is reported as missing. A Figma
contract uses the first pass only, for the reason given above.

## Tolerances

* Lengths pass within `tolerance` pixels, default 1.
* Box dimensions also pass within one percent of the expected size: a pixel on
  a 24px button matters, a pixel on a 1440px hero is rounding.
* Colours are compared by perceived distance, not by string. A difference above
  roughly 2 is visible side by side and is reported. A difference in alpha is
  always reported.
* `width` and `height` are compared from the bounding box only, so a mismatch
  is never reported twice.
* The transform of an element that animates forever is skipped: it is a reading
  of a moment, not a promise.

## Pixel diffing

`diff` needs a reference screenshot, so the contract must have been extracted
with `screenshotDir`. If the contract declares a root selector, that selector
has to exist in the implementation too: comparing a whole page against a shot
of one section produces a number that measures nothing, so it fails instead.

Output goes to `outDir`, which defaults to the system temp directory.

## Errors

Every error thrown on purpose extends `PixelpactError` and carries a `code`.

| Class | Code | When |
| --- | --- | --- |
| `ContractError` | `ERR_CONTRACT` | The contract is missing, unreadable, invalid, or lacks what a step needs |
| `BrowserUnavailableError` | `ERR_BROWSER` | playwright is not installed, or no browser could be launched |
| `BlockedPageError` | `ERR_BLOCKED` | The page answered with a bot challenge and nothing could be measured |
| `TargetNotFoundError` | `ERR_TARGET` | A url would not load, or a selector matched nothing |
| `FigmaError` | `ERR_FIGMA` | The Figma url, token, file key or node id is wrong, or the API refused |

## Determinism

Two runs of the same page should produce the same numbers, so the browser is
launched with a fixed sRGB colour profile and hinting disabled, the locale and
time zone are always set, animations are frozen before a screenshot, and the
page is scrolled and decoded before it is captured. Hover states are read after
the element's own transition has finished rather than after a fixed delay,
which is what keeps a 250ms fade from being sampled mid flight.

## License

MIT
