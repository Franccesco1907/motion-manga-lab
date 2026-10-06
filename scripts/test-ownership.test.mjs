import { execFile } from 'node:child_process'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { promisify } from 'node:util'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const execute = promisify(execFile)
const configPath = resolve('vite.config.ts')
const cliPath = resolve('node_modules/vitest/vitest.mjs')
const applicationTests = ['src/App.test.tsx', 'scripts/tool.test.mjs', 'scripts/tool.spec.js']
const laboratoryTests = ['experiments/a-workbench/engine/renderer.test.mjs']
const defaultExcludedTests = ['node_modules/vendor/example.test.mjs', '.git/example.test.mjs']

describe('root test ownership', () => {
  let directory
  let discovered

  beforeAll(async () => {
    directory = await mkdtemp(join(tmpdir(), 'motion-manga-test-ownership-'))
    for (const filename of [...applicationTests, ...laboratoryTests, ...defaultExcludedTests]) {
      const target = join(directory, filename)
      await mkdir(dirname(target), { recursive: true })
      // Discovery must never import or execute any fixture, including application files.
      await writeFile(target, "throw new Error('Discovery fixtures must not execute')\n")
    }

    const { stdout } = await execute(process.execPath, [
      cliPath, 'list', '--filesOnly', '--json', '--root', directory, '--config', configPath,
    ], { timeout: 10_000 })
    discovered = JSON.parse(stdout).map(({ file }) => relative(directory, file).split(sep).join('/'))
  })

  afterAll(async () => {
    if (directory) await rm(directory, { recursive: true, force: true })
  })

  it('retains source and script suites using the default filename patterns', () => {
    for (const filename of applicationTests) expect(discovered).toContain(filename)
  })

  it('leaves laboratory Node test suites to their separate runner', () => {
    for (const filename of laboratoryTests) expect(discovered).not.toContain(filename)
  })

  it('preserves default dependency and Git metadata exclusions', () => {
    for (const filename of defaultExcludedTests) expect(discovered).not.toContain(filename)
  })
})
