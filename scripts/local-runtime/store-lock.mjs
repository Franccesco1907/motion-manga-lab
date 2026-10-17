import { lstat, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { dirname, isAbsolute, resolve, join } from 'node:path'

/** Process and stopped-store tools share a sibling lock; crashes require explicit operator recovery. */
export async function acquireStoreLock(input) {
  if (!isAbsolute(input) || resolve(input) === dirname(resolve(input))) throw new Error('Store lock requires an absolute private store path.')
  const root = resolve(input), path = `${root}.lock`
  let ancestor = root
  while (true) {
    try { if ((await lstat(ancestor)).isSymbolicLink()) throw new Error('Store lock paths must not use symlinks.') }
    catch (error) { if (error.code !== 'ENOENT') throw error }
    const parent = dirname(ancestor); if (parent === ancestor) break; ancestor = parent
  }
  await mkdir(dirname(path), { recursive: true, mode: 0o700 })
  try { await mkdir(path, { mode: 0o700 }) }
  catch (error) {
    if (error.code === 'EEXIST') throw new Error(`Private store is locked: ${path}. Stop all service/account/backup processes first. After verifying none remain, remove a stale lock manually; no automatic takeover is allowed.`)
    throw error
  }
  const token = randomUUID()
  try { await writeFile(join(path, 'owner.json'), JSON.stringify({ pid: process.pid, token }) + '\n', { flag: 'wx', mode: 0o600 }) }
  catch (error) { await rm(path, { recursive: true, force: true }); throw error }
  let released = false
  return async () => {
    if (released) return
    const owner = JSON.parse(await readFile(join(path, 'owner.json'), 'utf8'))
    if (owner.token !== token) throw new Error('Store lock ownership changed; refusing to remove another process lock.')
    await rm(path, { recursive: true }); released = true
  }
}
