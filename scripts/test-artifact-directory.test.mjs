import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { createTestArtifactDirectory } from './test-artifact-directory.mjs'

it('provisions a missing artifact-test parent without requiring host setup or removing existing contents', async () => {
  const outer = await mkdtemp(join(tmpdir(), 'motion-manga-test-parent-'))
  const required = join(outer, 'missing-parent')
  try {
    const created = await createTestArtifactDirectory('case-', required)
    expect(created.startsWith(join(required, 'case-'))).toBe(true)
    await writeFile(join(required, 'keep.txt'), 'existing content')
    await createTestArtifactDirectory('second-', required)
    expect(await readFile(join(required, 'keep.txt'), 'utf8')).toBe('existing content')
  } finally { await rm(outer, { recursive: true, force: true }) }
})
