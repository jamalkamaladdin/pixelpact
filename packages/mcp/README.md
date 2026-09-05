# pixelpact-mcp

An MCP server that lets a coding agent measure its own UI work against a visual contract,
without a human in the loop. It wraps `pixelpact-core`.

## Install

```
pnpm add -D pixelpact-mcp
```

## Run

```
pixelpact-mcp
```

The binary speaks the Model Context Protocol over stdio. Point an MCP client at it, for
example by adding it to the client's server list with the command `pixelpact-mcp`.

## Tools

- `extract_contract` extracts a visual contract from a reference URL and saves it as JSON.
- `check_implementation` measures an implementation URL against a saved contract and returns
  a formatted deviation table plus numeric totals.
- `diff_pixels` compares an implementation URL against the contract's reference screenshot
  pixel by pixel.
- `read_contract_summary` reads a saved contract and describes it without opening a browser.

A typical loop: `extract_contract` once against the reference design, then
`check_implementation` after each change, then `diff_pixels` for a stricter final check.

## Requirements

Node >= 22.12. Playwright browsers must be installed separately, for example
`pnpm exec playwright install chromium`, since `playwright` is a peer dependency.
