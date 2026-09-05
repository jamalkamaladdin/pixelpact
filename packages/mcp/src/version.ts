import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

interface PackageJson {
  version: string
}

/** Reads this package's own version from its `package.json`, wherever it ends up on disk. */
export function getVersion(): string {
  const pkgPath = fileURLToPath(new URL('../package.json', import.meta.url))
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as PackageJson
  return pkg.version
}
