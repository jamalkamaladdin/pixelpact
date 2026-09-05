import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import { mapErrorToToolResult } from './errors.js'
import {
  checkImplementationInputShape,
  diffPixelsInputShape,
  extractContractInputShape,
  readContractSummaryInputShape,
} from './schemas.js'
import { checkImplementation, diffPixels, extractContract, readContractSummary } from './tools.js'
import { getVersion } from './version.js'

const SERVER_NAME = 'pixelpact-mcp'
const SERVER_VERSION = getVersion()

function jsonResult(value: unknown): CallToolResult {
  return { content: [{ type: 'text', text: JSON.stringify(value, null, 2) }] }
}

async function guarded(fn: () => Promise<CallToolResult>): Promise<CallToolResult> {
  try {
    return await fn()
  } catch (error) {
    console.error('[pixelpact-mcp] tool call failed:', error)
    return mapErrorToToolResult(error)
  }
}

/**
 * Builds the configured MCP server. Callers connect it to a transport, for example
 * `server.connect(new StdioServerTransport())` in `bin.ts`.
 */
export function createServer(): McpServer {
  const server = new McpServer({ name: SERVER_NAME, version: SERVER_VERSION })

  server.registerTool(
    'extract_contract',
    {
      title: 'Extract a visual contract',
      description:
        'Extracts a visual contract from a reference URL and saves it as JSON at outputPath. ' +
        'Call this once per reference design, before check_implementation or diff_pixels can be used, ' +
        'since both need a saved contract to compare against. Pass screenshotDir to also capture ' +
        'reference screenshots, which diff_pixels requires later. Returns a summary: the element ' +
        'count per viewport, any extraction warnings, and the path the contract was written to.',
      inputSchema: extractContractInputShape,
      annotations: { title: 'Extract contract', readOnlyHint: false, openWorldHint: true },
    },
    async (input) =>
      guarded(async () => {
        const result = await extractContract(input)
        return jsonResult(result)
      }),
  )

  server.registerTool(
    'check_implementation',
    {
      title: 'Check an implementation against a contract',
      description:
        'Measures an implementation URL against a previously saved visual contract: box position ' +
        'and size, computed styles, hover and focus states, and pseudo-elements. Call this after ' +
        'building or changing a UI to verify it matches the reference without a human looking at it. ' +
        'Needs contractPath from a prior extract_contract call. Returns a formatted deviation table ' +
        '(capped at 40 rows, with a note on how many were left out) plus the numeric totals, the pass ' +
        'rate, any missing selectors, and ok, which is true only when nothing deviated and nothing is missing.',
      inputSchema: checkImplementationInputShape,
      annotations: { title: 'Check implementation', readOnlyHint: true, openWorldHint: true },
    },
    async (input) =>
      guarded(async () => {
        const result = await checkImplementation(input)
        return jsonResult(result)
      }),
  )

  server.registerTool(
    'diff_pixels',
    {
      title: 'Pixel-diff an implementation against a contract screenshot',
      description:
        'Renders the implementation URL and compares it pixel by pixel against the reference ' +
        'screenshot stored in the contract. Use this for a stricter visual check than ' +
        'check_implementation, after the structural check passes or when a subtle rendering ' +
        'difference is suspected. Requires the contract to have been extracted with screenshotDir ' +
        'set. Returns the percentage of differing pixels, the threshold it was compared against, ' +
        'ok, and the filesystem path of the generated diff image.',
      inputSchema: diffPixelsInputShape,
      annotations: { title: 'Diff pixels', readOnlyHint: true, openWorldHint: true },
    },
    async (input) =>
      guarded(async () => {
        const result = await diffPixels(input)
        return jsonResult(result)
      }),
  )

  server.registerTool(
    'read_contract_summary',
    {
      title: 'Read a saved contract summary',
      description:
        'Reads a saved contract file and describes it without opening a browser or making any ' +
        'network request. Use this to inspect what a contract covers, for example before deciding ' +
        'whether diff_pixels is possible, since that needs screenshots to already exist. Returns ' +
        'the original source URL, when it was extracted, the viewports it covers, the element count ' +
        'per viewport, whether reference screenshots exist, and any warnings recorded at extraction time.',
      inputSchema: readContractSummaryInputShape,
      annotations: { title: 'Read contract summary', readOnlyHint: true, openWorldHint: false },
    },
    async (input) =>
      guarded(async () => {
        const result = await readContractSummary(input)
        return jsonResult(result)
      }),
  )

  return server
}
