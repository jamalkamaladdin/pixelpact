# pixelpact

Command line interface for `@pixelpact/core`: extract a visual contract from a live page,
then measure or diff an implementation against it.

## Install

```bash
pnpm add -D pixelpact playwright
pnpm exec playwright install chromium
```

`playwright` is a peer dependency, so the browser download stays under your control. Node
20.19 or newer is required.

## Commands

### `pixelpact extract <url>`

Extracts a visual contract from a live page and writes it to disk.

| Flag | Description |
|---|---|
| `--out <path>` | Where to write the contract JSON. Default `pixelpact.contract.json`. |
| `--selector <css>` | Restrict extraction to this CSS selector. Default: the whole page. |
| `--viewport <list>` | Comma separated viewport names (`desktop`, `tablet`, `mobile`) or `WIDTHxHEIGHT` pairs. Repeatable. |
| `--max-elements <n>` | Maximum number of elements to walk. `0` means unbounded. |
| `--max-states <n>` | Maximum number of interactive elements to probe for hover/focus. |
| `--mask <css>` | CSS selector to mask out of the contract. Repeatable. |
| `--screenshots <dir>` | Directory to write per-viewport screenshots to. |
| `--wait <ms>` | Extra settle time after navigation. |
| `--timeout <ms>` | Navigation timeout. |
| `--headful` | Show the browser window instead of running headless. |
| `--channel <name>` | Browser channel, e.g. `chrome`. |
| `--locale <tag>` | Browser locale, e.g. `en-US`. |
| `--timezone <tz>` | Browser timezone, e.g. `UTC`. |
| `--no-stealth` | Disable stealth mode. |
| `--no-dismiss` | Do not dismiss cookie banners and other overlays. |
| `--no-freeze` | Do not freeze CSS animations before extracting. |
| `--no-full-page` | Capture only the viewport instead of the full scrollable page. |
| `--json` | Print the contract as JSON to stdout instead of a summary. |
| `--quiet` | Suppress progress output on stderr. |

### `pixelpact check <contract> <url>`

Measures a live implementation against a contract and reports deviations.

| Flag | Description |
|---|---|
| `--viewport <name>` | Viewport to check. Default: the first one in the contract. |
| `--selector <css>` | Root selector to check. Default: the contract root. |
| `--tolerance <px>` | Pixel tolerance for box and length values. Default `1`. |
| `--out <path>` | Also write the report JSON to this path. |
| `--max-states <n>` | Maximum number of interactive elements to probe. Default `120`. |
| `--wait <ms>`, `--timeout <ms>`, `--headful`, `--channel <name>`, `--locale <tag>`, `--timezone <tz>`, `--no-stealth`, `--no-dismiss` | Same as `extract`. |
| `--json` | Print the report as JSON to stdout instead of a summary. |
| `--quiet` | Suppress progress output on stderr. |

### `pixelpact diff <contract> <url>`

Pixel compares screenshots for an implementation against a contract's reference images.

| Flag | Description |
|---|---|
| `--viewport <name>` | Viewport to diff. Default: the first one in the contract. |
| `--selector <css>` | Root selector to diff. Default: the contract root. |
| `--threshold <pct>` | Allowed percent of differing pixels. Default `0.5`. |
| `--out-dir <dir>` | Directory to write the diff images to. Default: the OS temp dir. |
| `--mask <css>` | CSS selector to mask out. Repeatable. |
| `--wait <ms>`, `--timeout <ms>`, `--headful`, `--channel <name>`, `--locale <tag>`, `--timezone <tz>`, `--no-stealth`, `--no-dismiss` | Same as `extract`. |
| `--json` | Print the report as JSON to stdout instead of a summary. |
| `--quiet` | Suppress progress output on stderr. |

## Exit codes

| Code | Meaning |
|---|---|
| `0` | Success, no deviations. |
| `1` | Deviations found, or the pixel threshold was exceeded. |
| `2` | Usage error: bad flags or a missing file. |
| `3` | Runtime failure: browser unavailable, navigation failed, or the page blocked access. |

## Output

Progress is written to stderr so stdout stays pipeable. Human readable summaries are
written to stdout by default; pass `--json` on any command to print the raw contract or
report as JSON instead. Color is used only when stdout is a TTY and `NO_COLOR` is unset;
set `FORCE_COLOR` to override either way.

## Examples

```
pixelpact extract https://example.com --out example.contract.json
pixelpact check example.contract.json https://staging.example.com --tolerance 2
```
