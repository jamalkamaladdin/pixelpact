<div align="center">

# pixelpact

**Measure a UI against the design it is supposed to match, before any baseline exists.**

[![CI](https://github.com/jamalkamaladdin/pixelpact/actions/workflows/ci.yml/badge.svg)](https://github.com/jamalkamaladdin/pixelpact/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/pixelpact.svg?color=0b7285)](https://www.npmjs.com/package/pixelpact)
[![node](https://img.shields.io/node/v/pixelpact.svg?color=0b7285)](https://nodejs.org)
[![license](https://img.shields.io/npm/l/pixelpact.svg?color=0b7285)](./LICENSE)

</div>

Someone says the page is done. You look at it and it does not match. Nothing in the room is
measured, so the conversation becomes opinion: that gap looks too big, no it does not.

pixelpact reads the reference (a live page today, a Figma file later) and writes down what it
actually renders: sizes, colors, spacing, typography, hover and focus states, animation
keyframes, design tokens. That file is the **contract**. Point pixelpact at your
implementation and it answers with numbers, one line per property that drifted.

```bash
npx pixelpact extract https://reference.example.com -o contract.json
npx pixelpact check contract.json http://localhost:3000
```

## Why this is not visual regression testing

Percy, Chromatic, Applitools, BackstopJS and Pixeleye all compare your page against a baseline
that you approved earlier. That model works once the page already looks right and you want to
keep it that way. While you are still building toward a design, there is no baseline to
compare with, and the first run of a regression tool simply records whatever you produced.

|                              | Visual regression tools            | pixelpact                          |
| ---------------------------- | ---------------------------------- | ---------------------------------- |
| Compares against             | a snapshot you approved earlier    | the reference design itself        |
| Useful when                  | the UI is already correct          | the UI is being built              |
| First run on a new page      | records, cannot judge              | measures against the reference     |
| Answer you get               | an image diff to inspect by eye    | a value per property, with a delta |
| Fits an autonomous agent     | needs a human to approve the diff  | the numbers close the loop         |

The two models are complementary. Use a regression tool to keep a finished page finished, and
pixelpact to get it finished in the first place.

## Install

```bash
pnpm add -D pixelpact playwright
pnpm exec playwright install chromium
```

`playwright` is a peer dependency, so the browser download stays under your control and a
project that already has Playwright installs nothing extra. Node 22.12 or newer is required.

## Quickstart

**1. Extract the contract from the reference.**

```bash
npx pixelpact extract https://reference.example.com \
  --selector "main" \
  --viewport desktop,mobile \
  --screenshots .pixelpact/shots \
  -o contract.json
```

**2. Measure your implementation.**

```bash
npx pixelpact check contract.json http://localhost:3000 --viewport desktop
```

**3. Fix what it reports, then run it again.** The command exits `0` when everything is inside
tolerance and `1` when it is not, so it drops straight into a script or a CI job.

## What a contract looks like

A contract is plain JSON, readable and diffable, with no proprietary format and no service
behind it.

```jsonc
{
  "version": 1,
  "source": { "type": "url", "value": "https://reference.example.com" },
  "root": "main",
  "extractedAt": "2026-09-06T01:20:44.812Z",
  "viewports": [{ "name": "desktop", "width": 1440, "height": 900 }],
  "tokens": { "--brand-600": "rgb(11, 114, 133)" },
  "keyframes": { "fade-up": [{ "offset": "0%", "css": "opacity: 0" }] },
  "byViewport": {
    "desktop": {
      "documentHeight": 4218,
      "elements": [
        {
          "selector": "main > header > a.cta",
          "tag": "a",
          "text": "Get started",
          "box": { "x": 120, "y": 32, "w": 148, "h": 44 },
          "styles": {
            "background-color": "rgb(11, 114, 133)",
            "font-size": "16px",
            "border-radius": "8px"
          },
          "hover": { "background-color": "rgb(8, 90, 105)" },
          "focus": { "outline": "2px solid rgb(11, 114, 133)" }
        }
      ]
    }
  }
}
```

Because it is a file, you can commit it, review it in a pull request, hand it to another
developer, or hand it to an agent.

## What a check prints

<!-- SAMPLE:CHECK -->

```text
pixelpact check  FAILED
  target    http://localhost:4173/impl.html
  reference http://localhost:4173/ref.html
  viewport  desktop 1440x900
  elements  14 matched, 0 missing of 14
  checks    1056 passed, 10 failed (99.1% of 1066)

deviations (10)
SELECTOR          PROPERTY                  EXPECTED                ACTUAL                  DIFF
body > main > h1  font-size                 48px                    44px                    4px
body > main > a   box.width                 117.75px                109.75px                8px
body > main > a   padding-right             24px                    20px                    4px
body > main > a   padding-left              24px                    20px                    4px
body > main > a   background-color          rgb(11, 114, 133)       rgb(37, 99, 235)        60.1 (color)
body > main > a   border-top-left-radius    8px                     4px                     4px
body > main > a   border-top-right-radius   8px                     4px                     4px
body > main > a   border-bottom-left-ra...  8px                     4px                     4px
body > main > a   border-bottom-right-r...  8px                     4px                     4px
body > main > a   focus.outline             rgb(11, 114, 133) s...  rgb(37, 99, 235) so...  differs
```

<!-- /SAMPLE:CHECK -->

That is a real run against two copies of one page with four declarations changed. Four edits
produce ten measured deviations, because padding moves the box width and one `border-radius`
shorthand sets four corners. Run the same check against the reference itself and all 1066
assertions pass, which is the property that matters: a passing check has to mean something.

Add `--json` to get the same report as a data structure, which is what CI jobs and agents read.

## Commands

| Command                              | What it does                                                  |
| ------------------------------------ | ------------------------------------------------------------- |
| `pixelpact extract <url>`            | Reads the reference and writes a contract file                 |
| `pixelpact check <contract> <url>`   | Measures an implementation, prints deviations, sets exit code  |
| `pixelpact diff <contract> <url>`    | Pixel comparison against the screenshot stored in the contract |

Shared flags cover the browser context (`--viewport`, `--selector`, `--wait`, `--timeout`,
`--locale`, `--timezone`, `--channel`, `--headful`), the output (`--out`, `--json`,
`--quiet`), and the parts of extraction you may want to cap (`--max-elements`, `--max-states`,
`--mask`). Run `pixelpact <command> --help` for the full list.

### Exit codes

| Code | Meaning                                                        |
| ---- | -------------------------------------------------------------- |
| `0`  | Everything inside tolerance                                     |
| `1`  | Deviations found, or the pixel threshold was exceeded           |
| `2`  | Usage error, for example a bad flag or a contract file that is missing |
| `3`  | Runtime failure, for example no browser available or the page would not load |

## Programmatic use

```ts
import { extract, check, formatCheckReport, writeContract } from '@pixelpact/core'

const contract = await extract({
  url: 'https://reference.example.com',
  selector: 'main',
  screenshotDir: '.pixelpact/shots',
})
await writeContract('contract.json', contract)

const report = await check(contract, { url: 'http://localhost:3000' })

console.log(formatCheckReport(report, { color: true }))
if (!report.ok) process.exitCode = 1
```

Everything is typed, and the contract and report shapes are validated at the boundary, so a
malformed file fails with a readable message instead of a stack trace.

## For coding agents

An agent that writes UI code cannot tell whether it succeeded. `@pixelpact/mcp` gives it the
measurement, so the loop closes without a person in the middle: extract the contract once,
then let the agent check its own work, read the deviation list, fix, and check again.

```jsonc
// .mcp.json
{
  "mcpServers": {
    "pixelpact": { "command": "npx", "args": ["-y", "@pixelpact/mcp"] }
  }
}
```

Tools exposed: `extract_contract`, `check_implementation`, `diff_pixels`,
`read_contract_summary`.

## In CI

The Action measures a preview deployment against the contract committed in the repository and
keeps a single pull request comment up to date instead of adding one per push.

```yaml
- uses: jamalkamaladdin/pixelpact/action@v0
  with:
    contract: contract.json
    url: ${{ steps.preview.outputs.url }}
    viewport: desktop
    tolerance: 1
```

It needs `permissions: pull-requests: write` and no secret beyond the automatic
`GITHUB_TOKEN`. Every input, every output and a complete workflow are in
[action/README.md](./action/README.md).

## How it works

1. Playwright opens the reference at each requested viewport, waits for fonts, network and
   paint to settle, and dismisses cookie overlays.
2. A single function is evaluated inside the page. It walks the DOM under your root selector
   and records the computed style of every visible element, plus custom properties, keyframes,
   and the geometry of each box.
3. Interactive elements are hovered and focused, and only the properties that actually change
   are stored, so a contract stays small enough to read.
4. Checking repeats step 2 against your implementation, matches elements by
   `data-contract` attribute, then by selector, then by tag and text, and compares property by
   property. Lengths use a pixel tolerance, colors use a perceptual distance, and animations
   are compared by name and timing rather than by string equality.

## Repository layout

| Package                                | Published as       | What it is                      |
| -------------------------------------- | ------------------ | ------------------------------- |
| [`packages/core`](./packages/core)     | `@pixelpact/core`  | Extraction, checking, reporting |
| [`packages/cli`](./packages/cli)       | `pixelpact`        | The `pixelpact` command         |
| [`packages/mcp`](./packages/mcp)       | `@pixelpact/mcp`   | MCP server for coding agents    |
| [`action`](./action)                   | used from GitHub   | Action for pull request checks  |

## Status

Version 0.1. Extraction, checking, the pixel diff, the MCP server and the Action are built,
and the numbers shown above come from a real run. Planned and not built yet, so nothing here
describes them as available:

- Figma as a contract source, next to live urls
- Section by section side by side rendering as a first class command

## Contributing

Development setup, the commands, and the pull request flow are in
[CONTRIBUTING.md](./CONTRIBUTING.md). Security reports go through
[SECURITY.md](./SECURITY.md).

## License

[MIT](./LICENSE) © Jamal Kamaladdin
