import { existsSync, realpathSync } from 'node:fs'
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path'
function canonical(path: string): string {
  let parent = resolve(path)
  const suffix: string[] = []
  while (!existsSync(parent)) { suffix.unshift(basename(parent)); const next = dirname(parent); if (next === parent) break; parent = next }
  return resolve(realpathSync(parent), ...suffix)
}
function inside(parent: string, child: string) { const path = relative(parent, child); return path === '' || !path.startsWith('..') && !isAbsolute(path) }
/** Prevent a later frontend build from copying operator credentials or private derivatives. */
export function assertPrivateStorage(root: string, staticRoot: string) {
  const privateRoot = canonical(root), frontend = canonical(staticRoot), publicInputs = canonical(join(dirname(staticRoot), 'public')), serverBuild = canonical(join(dirname(staticRoot), 'dist-server'))
  const sourceInputs = ['src', 'scripts'].map(folder => canonical(join(dirname(staticRoot), folder)))
  for (const tree of [frontend, publicInputs, serverBuild, ...sourceInputs]) if (inside(tree, privateRoot) || inside(privateRoot, tree)) {
    throw new Error('Private account storage must remain outside the served frontend, source/public inputs and generated server-build trees.')
  }
}
