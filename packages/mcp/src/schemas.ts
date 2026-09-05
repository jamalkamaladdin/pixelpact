import { z } from 'zod'

const viewportShape = z.object({
  name: z.string().min(1),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
})

const browserOptionsShape = {
  headless: z.boolean().optional().describe('Run the browser headless. Defaults to true.'),
  timeout: z
    .number()
    .int()
    .positive()
    .optional()
    .describe('Navigation timeout in milliseconds. Defaults to 30000.'),
  wait: z
    .number()
    .int()
    .min(0)
    .optional()
    .describe('Extra settle time in milliseconds after navigation. Defaults to 2000.'),
}

export const extractContractInputShape = {
  url: z.string().min(1).describe('The reference URL to extract a visual contract from.'),
  outputPath: z
    .string()
    .min(1)
    .describe('Filesystem path to write the contract JSON to, for example ./contracts/home.json.'),
  selector: z
    .string()
    .min(1)
    .optional()
    .describe('CSS selector to scope the walk to. Defaults to the document body.'),
  viewports: z
    .array(viewportShape)
    .optional()
    .describe(
      'Viewports to capture. Defaults to desktop 1440x900, tablet 768x1024, mobile 390x844.',
    ),
  maxElements: z
    .number()
    .int()
    .min(0)
    .optional()
    .describe('Maximum elements to walk, 0 means unbounded. Defaults to 600.'),
  maxStates: z
    .number()
    .int()
    .min(0)
    .optional()
    .describe('Maximum interactive elements to probe for hover and focus. Defaults to 120.'),
  masks: z
    .array(z.string().min(1))
    .optional()
    .describe('CSS selectors to exclude from the walk, for example ads or timestamps.'),
  freezeAnimations: z
    .boolean()
    .optional()
    .describe('Freeze CSS animations before measuring. Defaults to true.'),
  fullPage: z
    .boolean()
    .optional()
    .describe('Capture the full scrollable page instead of only the viewport. Defaults to true.'),
  screenshotDir: z
    .string()
    .min(1)
    .optional()
    .describe(
      'Directory to save reference screenshots to. Required later for diff_pixels to work.',
    ),
  ...browserOptionsShape,
}
export const extractContractInputSchema = z.object(extractContractInputShape)
export type ExtractContractInput = z.infer<typeof extractContractInputSchema>

export const checkImplementationInputShape = {
  contractPath: z
    .string()
    .min(1)
    .describe('Path to a contract JSON file previously written by extract_contract.'),
  url: z.string().min(1).describe('The implementation URL to measure against the contract.'),
  viewport: z
    .string()
    .min(1)
    .optional()
    .describe(
      'Viewport name to check, for example desktop. Defaults to the first viewport in the contract.',
    ),
  selector: z
    .string()
    .min(1)
    .optional()
    .describe('CSS selector to scope the check to. Defaults to the contract root.'),
  tolerance: z
    .number()
    .min(0)
    .optional()
    .describe('Allowed pixel tolerance for box and length values. Defaults to 1.'),
  maxStates: z
    .number()
    .int()
    .min(0)
    .optional()
    .describe('Maximum interactive elements to probe. Defaults to 120.'),
  ...browserOptionsShape,
}
export const checkImplementationInputSchema = z.object(checkImplementationInputShape)
export type CheckImplementationInput = z.infer<typeof checkImplementationInputSchema>

export const diffPixelsInputShape = {
  contractPath: z
    .string()
    .min(1)
    .describe('Path to a contract JSON file previously written by extract_contract.'),
  url: z.string().min(1).describe('The implementation URL to capture and compare pixel by pixel.'),
  viewport: z
    .string()
    .min(1)
    .optional()
    .describe('Viewport name to compare. Defaults to the first viewport in the contract.'),
  selector: z
    .string()
    .min(1)
    .optional()
    .describe('CSS selector to scope the comparison to. Defaults to the contract root.'),
  threshold: z
    .number()
    .min(0)
    .max(100)
    .optional()
    .describe('Allowed percent of differing pixels before the comparison fails. Defaults to 0.5.'),
  masks: z
    .array(z.string().min(1))
    .optional()
    .describe('CSS selectors to blank out before comparing, for example ads or timestamps.'),
  outDir: z
    .string()
    .min(1)
    .optional()
    .describe('Directory to write the diff image to. Defaults to the OS temp directory.'),
  ...browserOptionsShape,
}
export const diffPixelsInputSchema = z.object(diffPixelsInputShape)
export type DiffPixelsInput = z.infer<typeof diffPixelsInputSchema>

export const readContractSummaryInputShape = {
  contractPath: z
    .string()
    .min(1)
    .describe('Path to a contract JSON file previously written by extract_contract.'),
}
export const readContractSummaryInputSchema = z.object(readContractSummaryInputShape)
export type ReadContractSummaryInput = z.infer<typeof readContractSummaryInputSchema>
