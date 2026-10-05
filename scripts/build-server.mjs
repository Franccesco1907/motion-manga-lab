import { spawnSync } from 'node:child_process'
import { copyFile, mkdir, rm, readdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { join, dirname } from 'node:path'
const root = fileURLToPath(new URL('../', import.meta.url))
await rm(join(root, 'dist-server'), { recursive: true, force: true })
const result = spawnSync(process.execPath, [join(root, 'node_modules/typescript/bin/tsc'), '-p', join(root, 'tsconfig.server.json')], { stdio: 'inherit' })
if (result.status !== 0) process.exit(result.status ?? 1)
// Copy only server source adapters, never model weights, user projects or private generated output.
const engine = 'src/features/animation/engine'
const kernels = (await readdir(join(root, engine), { withFileTypes: true })).filter(entry => entry.isFile() && entry.name.endsWith('.mjs') && !entry.name.endsWith('.test.mjs')).map(entry => `${engine}/${entry.name}`)
for (const relative of [...kernels, 'scripts/local-projects/model-worker.py', 'scripts/local-projects/model_contract.py']) {
  const destination = join(root, 'dist-server', relative)
  await mkdir(dirname(destination), { recursive: true })
  await copyFile(join(root, relative), destination)
}
