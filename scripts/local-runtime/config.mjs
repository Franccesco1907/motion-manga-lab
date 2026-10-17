import { lstat, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path'
import { randomUUID } from 'node:crypto'
import { fileURLToPath } from 'node:url'

export const projectRoot = fileURLToPath(new URL('../../', import.meta.url))
const invalid = () => new Error('Invalid local configuration. Use local:configure with an absolute private --data-root and --port from 1024 through 65535; no credentials belong in this file.')
const inside = (parent, child) => { const path = relative(parent, child); return path === '' || (!path.startsWith('..') && !isAbsolute(path)) }

export async function assertNoSymlinks(path) {
  let current = resolve(path)
  while (true) {
    try { if ((await lstat(current)).isSymbolicLink()) throw new Error('Local configuration and private storage paths must not use symlinks.') }
    catch (error) { if (error.code !== 'ENOENT') throw error }
    const parent = dirname(current); if (parent === current) return; current = parent
  }
}

export async function validateLocalConfig(config, project = projectRoot) {
  if (!config || typeof config !== 'object' || Array.isArray(config) || Object.keys(config).sort().join(',') !== 'dataRoot,port,schemaVersion' || config.schemaVersion !== 1 || typeof config.dataRoot !== 'string' || !isAbsolute(config.dataRoot) || config.dataRoot.includes('\0') || !Number.isInteger(config.port) || config.port < 1024 || config.port > 65535) throw invalid()
  const root = resolve(config.dataRoot), checkout = resolve(project)
  if (inside(checkout, root) || inside(root, checkout)) throw new Error('Local private storage must remain outside the project checkout and its served/build trees.')
  await assertNoSymlinks(root)
  return { schemaVersion: 1, dataRoot: root, port: config.port }
}

function configPath(env) {
  const home = env.HOME || homedir(), base = env.XDG_CONFIG_HOME || join(home, '.config')
  if (!isAbsolute(base)) throw invalid()
  return join(base, 'motion-manga-lab', 'local.json')
}

export async function loadLocalConfig({ env = process.env, project = projectRoot } = {}) {
  const path = configPath(env)
  try {
    await assertNoSymlinks(path)
    const info = await lstat(path)
    if (!info.isFile() || info.size > 4096 || (info.mode & 0o077)) throw invalid()
    return { path, persisted: true, config: await validateLocalConfig(JSON.parse(await readFile(path, 'utf8')), project) }
  } catch (error) {
    if (error.code !== 'ENOENT') throw new Error(`Local configuration is unreadable or invalid. ${error.message}`)
    const data = env.XDG_DATA_HOME || join(env.HOME || homedir(), '.local/share')
    if (!isAbsolute(data)) throw invalid()
    return { path, persisted: false, config: await validateLocalConfig({ schemaVersion: 1, dataRoot: join(data, 'motion-manga-lab/self-hosted-v1'), port: 8080 }, project) }
  }
}

export async function saveLocalConfig(value, { env = process.env, project = projectRoot } = {}) {
  const config = await validateLocalConfig(value, project), path = configPath(env)
  if (inside(resolve(project), path)) throw new Error('Local configuration must remain outside the project checkout.')
  await assertNoSymlinks(path)
  await mkdir(dirname(path), { recursive: true, mode: 0o700 })
  const folder = await lstat(dirname(path))
  if (!folder.isDirectory() || (folder.mode & 0o077)) throw new Error('Local configuration directory must have private permissions (0700).')
  const temporary = join(dirname(path), `${basename(path)}.${randomUUID()}.tmp`)
  try { await writeFile(temporary, JSON.stringify(config, null, 2) + '\n', { flag: 'wx', mode: 0o600 }); await rename(temporary, path) }
  finally { await rm(temporary, { force: true }) }
  return { config, path, persisted: true }
}

export function localEnvironment(config, env = process.env) {
  const runtime = { ...env, PORT: String(config.port), MOTION_MANGA_ACCOUNT_DATA: config.dataRoot }
  delete runtime.PUBLIC_ORIGIN
  // Packaged local runtime has no model assets; optional setup is never inherited from a shell.
  delete runtime.MOTION_MANGA_MODEL_PROJECT
  return runtime
}
