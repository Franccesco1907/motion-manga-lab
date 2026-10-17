import { createHash } from 'node:crypto'
import { constants, createWriteStream } from 'node:fs'
import { lstat, mkdir, open, readdir, rm, writeFile } from 'node:fs/promises'
import { dirname, isAbsolute, join, parse, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { acquireStoreLock } from '../local-runtime/store-lock.mjs'

const FORMAT = 'motion-manga-account-backup'
const MAX_ENTRIES = 100_000
const MAX_MANIFEST_BYTES = 16 * 1024 * 1024
const checkout = fileURLToPath(new URL('../../', import.meta.url))
const invalid = () => new Error('Unsafe, changed or invalid private backup input. No destination was replaced.')
const inside = (parent, child) => { const path = relative(parent, child); return path === '' || path !== '..' && !path.startsWith(`..${sep}`) && !isAbsolute(path) }
const overlap = (a, b) => inside(a, b) || inside(b, a)

function absolutePath(value) {
  if (typeof value !== 'string' || !isAbsolute(value) || value.includes('\0') || value.includes('\\')) throw invalid()
  const parts = value.split(sep)
  if (parts.some(part => part === '.' || part === '..' || /\.lock(?:\.lock)*$/.test(part))) throw invalid()
  const path = resolve(value)
  if (path === parse(path).root || inside(checkout, path)) throw invalid()
  return path
}

async function ancestors(path, allowMissingLeaf = false) {
  let current = parse(path).root
  const parts = relative(current, path).split(sep)
  for (let index = 0; index < parts.length; index++) {
    current = join(current, parts[index])
    let info
    try { info = await lstat(current) }
    catch (error) { if (allowMissingLeaf && index === parts.length - 1 && error.code === 'ENOENT') return; throw invalid() }
    if (!info.isDirectory() || info.isSymbolicLink()) throw invalid()
  }
}

function privateNode(info, directory, root = false) {
  // The account root is the confidentiality boundary. Workers may produce
  // 0644 files/0755 directories beneath it; every copied node is normalized.
  if (info.isSymbolicLink() || (directory ? !info.isDirectory() : !info.isFile()) || (root && (info.mode & 0o077)) || (!directory && info.nlink !== 1)) throw invalid()
}
function portablePath(path) {
  if (typeof path !== 'string' || path.length > 4096 || path.split('/').length > 64 || !path.split('/').every(part => /^[a-zA-Z0-9_.-]+$/.test(part) && part !== '.' && part !== '..')) throw invalid()
  return path
}

// O_NOFOLLOW plus fstat prevents a swapped final-component symlink or special file
// from being read. Parent directories must remain operator-controlled while stopped.
async function readRegular(path, consume) {
  const before = await lstat(path)
  privateNode(before, false)
  if (constants.O_NOFOLLOW === undefined) throw new Error('This local backup requires no-follow file support.')
  const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK)
  try {
    const info = await file.stat()
    privateNode(info, false)
    if (info.ino !== before.ino || info.dev !== before.dev) throw invalid()
    const value = await consume(file, info)
    const after = await file.stat()
    const current = await lstat(path)
    if (after.size !== info.size || after.mtimeMs !== info.mtimeMs || after.ctimeMs !== info.ctimeMs || current.ino !== info.ino || current.dev !== info.dev || current.isSymbolicLink()) throw invalid()
    return value
  } finally { await file.close() }
}

async function digestFile(path, destination) {
  return readRegular(path, async (file, info) => {
    const hash = createHash('sha256')
    let bytes = 0
    const meter = new Transform({ transform(chunk, _encoding, done) { bytes += chunk.length; hash.update(chunk); done(null, chunk) } })
    const input = file.createReadStream({ autoClose: false })
    if (destination) {
      await pipeline(input, meter, createWriteStream(destination, { flags: 'wx', mode: 0o600, flush: true }))
    } else {
      for await (const chunk of input) { bytes += chunk.length; hash.update(chunk) }
    }
    if (bytes !== info.size) throw invalid()
    return { bytes, sha256: hash.digest('hex') }
  })
}

async function inventory(root) {
  const entries = []
  async function walk(path = '') {
    const directory = join(root, path)
    privateNode(await lstat(directory), true, path === '')
    for (const name of (await readdir(directory)).sort()) {
      const child = portablePath(path ? `${path}/${name}` : name), full = join(root, child), info = await lstat(full)
      if (++count > MAX_ENTRIES) throw invalid()
      if (info.isDirectory()) {
        privateNode(info, true); entries.push({ path: child, type: 'directory' }); await walk(child)
      } else {
        privateNode(info, false); entries.push({ path: child, type: 'file', ...await digestFile(full) })
      }
    }
  }
  let count = 0
  await walk()
  return entries.sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0)
}

function validateManifest(value) {
  if (!value || typeof value !== 'object' || value.format !== FORMAT || value.version !== 1 || !Array.isArray(value.entries) || value.entries.length > MAX_ENTRIES || Object.keys(value).sort().join(',') !== 'entries,format,version') throw invalid()
  const seen = new Map()
  for (const entry of value.entries) {
    if (!entry || typeof entry !== 'object') throw invalid()
    portablePath(entry.path)
    if (seen.has(entry.path)) throw invalid()
    const parent = entry.path.includes('/') ? entry.path.slice(0, entry.path.lastIndexOf('/')) : ''
    if (parent && seen.get(parent) !== 'directory') throw invalid()
    if (entry.type === 'directory') {
      if (Object.keys(entry).sort().join(',') !== 'path,type') throw invalid()
    } else if (entry.type === 'file') {
      if (Object.keys(entry).sort().join(',') !== 'bytes,path,sha256,type' || !Number.isSafeInteger(entry.bytes) || entry.bytes < 0 || typeof entry.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(entry.sha256)) throw invalid()
    } else throw invalid()
    seen.set(entry.path, entry.type)
  }
  return value.entries.map(entry => entry.type === 'directory' ? { path: entry.path, type: entry.type } : { path: entry.path, type: entry.type, bytes: entry.bytes, sha256: entry.sha256 })
}

async function readManifest(root) {
  privateNode(await lstat(root), true, true)
  if ((await readdir(root)).sort().join(',') !== 'manifest.json,store') throw invalid()
  return readRegular(join(root, 'manifest.json'), async (file, info) => {
    if (info.size > MAX_MANIFEST_BYTES) throw invalid()
    return validateManifest(JSON.parse(await file.readFile('utf8')))
  })
}

function sameInventory(actual, expected) { if (JSON.stringify(actual) !== JSON.stringify(expected)) throw invalid() }

async function copyInventory(source, destination, entries) {
  for (const entry of entries) {
    const target = join(destination, entry.path)
    if (entry.type === 'directory') await mkdir(target, { mode: 0o700 })
    else {
      const digest = await digestFile(join(source, entry.path), target)
      if (digest.bytes !== entry.bytes || digest.sha256 !== entry.sha256) throw invalid()
    }
  }
}

async function transfer(options, restore) {
  if (options?.serverStopped !== true) throw new Error('Stop the account service and workers first; explicitly acknowledge --server-stopped.')
  const source = absolutePath(options.source), destination = absolutePath(options.destination)
  if (overlap(source, destination) || overlap(`${source}.lock`, destination) || overlap(`${destination}.lock`, source)) throw invalid()
  await ancestors(source); await ancestors(destination, true)
  // Locks prevent participating service startup, account creation and other backup
  // operations. The explicit stop acknowledgement also covers older unguarded services.
  const releases = []
  let created = false
  try {
    for (const root of [source, destination].sort()) releases.push(await acquireStoreLock(root))
    await ancestors(source); await ancestors(destination, true)
    const payload = restore ? join(source, 'store') : source
    const entries = restore ? await readManifest(source) : await inventory(source)
    if (restore) sameInventory(await inventory(payload), entries)
    await mkdir(destination, { mode: 0o700 }); created = true
    const target = restore ? destination : join(destination, 'store')
    if (!restore) await mkdir(target, { mode: 0o700 })
    await copyInventory(payload, target, entries)
    // Recheck source and output before success: partial/corrupt copies are never
    // advertised as completed. No schema transformations or original rewrites.
    sameInventory(await inventory(payload), entries)
    sameInventory(await inventory(target), entries)
    if (!restore) {
      const manifest = JSON.stringify({ format: FORMAT, version: 1, entries }, null, 2) + '\n'
      if (Buffer.byteLength(manifest) > MAX_MANIFEST_BYTES) throw invalid()
      await writeFile(join(destination, 'manifest.json'), manifest, { flag: 'wx', mode: 0o600, flush: true })
    } else sameInventory(await readManifest(source), entries)
  } catch (error) {
    if (created) await rm(destination, { recursive: true, force: true })
    throw error
  } finally {
    for (const release of releases.reverse()) await release()
  }
}

export async function backupStore(options) { return transfer(options, false) }
export async function restoreStore(options) { return transfer(options, true) }
