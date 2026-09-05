# Example: extract and check

The shortest useful loop. It reads a reference page, writes a contract, then measures a second
page against that contract and prints the deviations.

## Run it

From the repository root:

```bash
pnpm install
pnpm exec playwright install chromium
pnpm --filter pixelpact-example-basic start https://reference.example.com http://localhost:3000
```

Or from this directory:

```bash
node extract-and-check.mjs https://reference.example.com http://localhost:3000
```

## What you get

`out/contract.json` holds the contract, `out/` also holds the reference screenshot, and the
deviation table goes to stdout. The process exits `1` when anything is outside tolerance, so
the same file works as a check in CI.

## Try it against itself

Pass the same url twice. Every check should pass, which is a quick way to confirm the browser
and the extraction path are working before you point it at real work.

```bash
node extract-and-check.mjs https://example.com https://example.com
```
