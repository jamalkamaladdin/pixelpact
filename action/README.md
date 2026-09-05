# pixelpact check action

This action measures a deployed or locally served page against a pixelpact
visual contract and posts the deviation table as a pull request comment. It
also sets outputs so a workflow can react to the result on its own.

## Example workflow

This example builds a static site, serves the build output, waits for the
server to answer, then runs the check against it.

```yaml
name: Visual contract check

on:
  pull_request:

permissions:
  pull-requests: write

jobs:
  visual-check:
    runs-on: ubuntu-latest
    steps:
      - name: Check out the repository
        uses: actions/checkout@v5

      - name: Set up Node.js
        uses: actions/setup-node@v7
        with:
          node-version: '24'

      - name: Install dependencies
        run: npm ci

      - name: Build the static site
        run: npm run build

      - name: Serve the build output
        run: npx --yes serve -l 4173 ./dist &

      - name: Wait for the local server
        run: npx --yes wait-on http://localhost:4173

      - name: Measure against the visual contract
        uses: jamalkamaladdin/pixelpact/action@v1
        with:
          contract: contracts/homepage.json
          url: http://localhost:4173
```

If the implementation is already deployed, for example to a preview URL from
a hosting provider, skip the build and serve steps and pass that URL directly
to `url`.

## Permissions

The workflow that calls this action needs permission to write pull request
comments. The action needs no secret beyond the automatic `GITHUB_TOKEN`:

```yaml
permissions:
  pull-requests: write
```

## Inputs

| Name | Description | Required | Default |
| --- | --- | --- | --- |
| `contract` | Path to the contract JSON file in the repository. | yes | none |
| `url` | URL of the implementation to measure. | yes | none |
| `viewport` | Viewport name from the contract to check. | no | empty, uses the CLI default |
| `selector` | CSS selector to scope the check to. | no | empty, checks the whole contract |
| `tolerance` | Pixel tolerance passed to the check command. | no | empty, uses the CLI default |
| `version` | pixelpact version to run with `npx`. | no | `latest` |
| `comment` | Whether to post or update a pull request comment with the result. | no | `true` |
| `fail-on-deviation` | Whether a deviation or missing selector fails the job. | no | `true` |
| `report-path` | Where to write the JSON check report. | no | `pixelpact-report.json` |

## Outputs

| Name | Description |
| --- | --- |
| `ok` | `true` when the check passed cleanly, `false` otherwise. |
| `pass-rate` | Fraction of checked properties that passed, between 0 and 1. |
| `deviations` | Count of property checks that failed. |
| `missing` | Count of contract selectors that were not found on the page. |
| `report-path` | Path to the JSON report file that was written. |

## The contract file

The contract JSON is committed to the repository alongside the code it
describes. Regenerate it by running `pixelpact extract` against the reference
implementation whenever the design changes, then commit the updated file so
this action checks against the new contract on the next pull request.

## Comment behaviour

The action looks for a hidden marker in existing pull request comments and
updates that comment instead of adding a new one on every push, so a long
lived pull request gets one comment that stays current. Set `comment` to
`false` to skip posting entirely, for example on a workflow that only needs
the outputs.
