# Contributing to pixelpact

Thanks for looking at the code. This document assumes you have never seen this repository before.

## Prerequisites

- Node 22.12 or newer.
- pnpm 11 (this repo uses pnpm workspaces, not npm or yarn).
- For anything that touches a real browser (extracting a contract, running a check against a live page): `pnpm exec playwright install chromium`. A normal `pnpm install` does not download browser binaries, so tests or commands that launch Playwright will fail until you run this once.

## Getting set up

```bash
git clone https://github.com/jamalkamaladdin/pixelpact.git
cd pixelpact
pnpm install
```

That installs dependencies for every package in the workspace in one step.

## Repository layout

| Package | Published as | What it is |
|---|---|---|
| `packages/core` | `@pixelpact/core` | Extracts a visual contract from a reference page and measures an implementation against it. |
| `packages/cli` | `pixelpact` | The command line tool most users install, bin name `pixelpact`. |
| `packages/mcp` | `@pixelpact/mcp` | An MCP server so a coding agent can run the same checks itself. |

## Commands

Run these from the repository root.

```bash
pnpm lint          # biome check .
pnpm typecheck     # tsc across all packages
pnpm test          # vitest
pnpm test:coverage # vitest run --coverage
pnpm build         # builds all packages in dependency order
```

A pull request is expected to pass lint, typecheck, test and build before review.

## Making a change

1. Create a branch off `main`.
2. Make your change inside the relevant package. Keep the diff scoped to one concern.
3. If the change affects anything a user of `@pixelpact/core`, `pixelpact`, or `@pixelpact/mcp` would notice (a new flag, a fixed bug, a behavior change), add a changeset:

   ```bash
   pnpm changeset
   ```

   Pick the affected package(s), pick a semver bump (patch for a fix, minor for a new capability, major for a breaking change), and write a short summary in plain language. That summary becomes the changelog entry.

4. If the change is purely internal (refactor, test, docs, CI) no changeset is needed.

## Version and release flow

This repo uses Changesets. You do not run `version-packages` or `release` yourself, a workflow handles it:

- Merging a pull request with a changeset file causes a bot to open (or update) a "Version Packages" pull request that bumps versions and writes the changelog.
- Merging that version pull request triggers the actual `npm publish` for the affected packages.

## Commit messages

Format: `type(scope): subject`

Allowed types: `feat`, `fix`, `chore`, `refactor`, `docs`, `test`, `perf`.

Examples:

```
feat(cli): add --json output flag
fix(core): handle relative urls in extracted contract
docs(mcp): document the check tool's response shape
```

Scope is usually the package name without the `@pixelpact/` prefix (`core`, `cli`, `mcp`), or `repo` for changes that span the whole project.

## What a good pull request looks like

- One concern per pull request. A refactor and a feature in the same diff are hard to review and hard to revert.
- A description that says what changed, why, and how you verified it (which commands you ran, or a screenshot for anything visual).
- Tests for new behavior, and a regression test for any bug fix.
- A changeset when the change is user facing.
- CI green before requesting review.
