import { mkdir, mkdtemp } from 'node:fs/promises'
import { join } from 'node:path'

// Test setup only: the generator's production path gate remains unchanged.
export async function createTestArtifactDirectory(prefix, root = '/tmp/opencode') {
  await mkdir(root, { recursive: true, mode: 0o700 })
  return mkdtemp(join(root, prefix))
}
