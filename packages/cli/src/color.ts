/** The subset of the runtime environment the colour decision depends on. */
export interface ColorEnv {
  isTTY: boolean
  noColor?: string
  forceColor?: string
}

/**
 * Decides whether coloured output should be produced.
 *
 * Rules: `FORCE_COLOR` always wins (a value of `0` or `false` forces colour off,
 * any other value forces it on). Otherwise `NO_COLOR` being set at all disables
 * colour. Otherwise colour follows whether stdout is a TTY.
 */
export function shouldUseColor(env: ColorEnv): boolean {
  if (env.forceColor !== undefined) {
    return env.forceColor !== '0' && env.forceColor.toLowerCase() !== 'false'
  }
  if (env.noColor !== undefined) {
    return false
  }
  return env.isTTY
}

/** Reads the colour decision straight from the current process. */
export function shouldUseColorForProcess(
  stream: { isTTY?: boolean },
  env: NodeJS.ProcessEnv,
): boolean {
  return shouldUseColor({
    isTTY: Boolean(stream.isTTY),
    noColor: env.NO_COLOR,
    forceColor: env.FORCE_COLOR,
  })
}
