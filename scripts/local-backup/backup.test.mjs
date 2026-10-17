// @vitest-environment node
import { afterEach, expect, it } from 'vitest'
import { mkdtemp, mkdir, writeFile, readFile, readdir, lstat, rm, symlink, chmod } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { tmpdir } from 'node:os'
import { spawnSync } from 'node:child_process'
import { backupStore, restoreStore } from './backup.mjs'
import { acquireStoreLock } from '../local-runtime/store-lock.mjs'

const roots = []
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }) })
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'mml-backup-')); roots.push(root)
  const source = join(root, 'account-store'), destination = join(root, 'backup'), restored = join(root, 'restored')
  await mkdir(source, { mode: 0o700 })
  const files = {
    'auth/users/test.json': '{"id":"synthetic-owner","salt":"synthetic-salt","hash":"synthetic-password-hash"}',
    'auth/sessions/session.json': '{"csrfToken":"synthetic-session"}',
    'owners/synthetic-owner/project/original': Buffer.from([0, 255, 17, 83]),
    'owners/synthetic-owner/project/project.json': '{"owner":"synthetic-owner"}',
    'owners/synthetic-owner/project/draft.json': '{"revision":7,"layers":["synthetic"]}',
    'owners/synthetic-owner/project/artifacts/frame.png': Buffer.from([1, 2, 3]),
    'shares/link.json': '{"projectId":"synthetic-project","revoked":false}',
  }
  for (const [name, bytes] of Object.entries(files)) {
    await mkdir(dirname(join(source, name)), { recursive: true, mode: 0o700 })
    await writeFile(join(source, name), bytes, { mode: 0o600 })
  }
  await mkdir(join(source, 'empty'), { mode: 0o700 })
  return { root, source, destination, restored, files }
}
const options = (source, destination) => ({ source, destination, serverStopped: true })
async function absent(path) { await expect(lstat(path)).rejects.toMatchObject({ code: 'ENOENT' }) }
async function editManifest(backup, update) {
  const path = join(backup, 'manifest.json'), manifest = JSON.parse(await readFile(path, 'utf8'))
  update(manifest); await writeFile(path, JSON.stringify(manifest), { mode: 0o600 })
}

it('round-trips every original byte and account relation, empty directories and private permissions', async () => {
  const { source, destination, restored, files } = await fixture()
  await backupStore(options(source, destination))
  const manifest = JSON.parse(await readFile(join(destination, 'manifest.json'), 'utf8'))
  expect(manifest).toMatchObject({ format: 'motion-manga-account-backup', version: 1 })
  expect(JSON.stringify(manifest)).not.toContain('synthetic-password-hash')
  expect(manifest.entries.find(entry => entry.path.endsWith('/original'))).toMatchObject({ bytes: 4, sha256: expect.stringMatching(/^[a-f0-9]{64}$/) })
  await restoreStore(options(destination, restored))
  for (const [name, bytes] of Object.entries(files)) {
    expect(await readFile(join(restored, name))).toEqual(Buffer.from(bytes))
    expect((await lstat(join(restored, name))).mode & 0o777).toBe(0o600)
    expect(await readFile(join(source, name))).toEqual(Buffer.from(bytes))
  }
  expect(await readdir(join(restored, 'empty'))).toEqual([])
  for (const path of [destination, restored, join(restored, 'empty')]) expect((await lstat(path)).mode & 0o777).toBe(0o700)
  await absent(`${source}.lock`); await absent(`${destination}.lock`); await absent(`${restored}.lock`)
})

it('requires explicit server-stopped acknowledgement before reading or creating output', async () => {
  const { source, destination } = await fixture()
  await expect(backupStore({ source, destination })).rejects.toThrow(/stopped/i)
  await expect(restoreStore({ source, destination })).rejects.toThrow(/stopped/i)
  await absent(destination)
})

it('refuses a live store lock without disturbing the store or lock', async () => {
  const { source, destination, restored } = await fixture()
  const release = await acquireStoreLock(source)
  try {
    await expect(backupStore(options(source, destination))).rejects.toThrow(/lock|running|use/i)
    await absent(destination)
  } finally { await release() }
  await backupStore(options(source, destination))
  const releaseDestination = await acquireStoreLock(restored)
  try { await expect(restoreStore(options(destination, restored))).rejects.toThrow(/lock|running|use/i) }
  finally { await releaseDestination() }
  await absent(restored)
})

it('never overwrites existing destinations, even empty directories', async () => {
  const { source, destination, restored } = await fixture()
  await mkdir(destination, { mode: 0o700 })
  await expect(backupStore(options(source, destination))).rejects.toThrow()
  expect(await readdir(destination)).toEqual([])
  await rm(destination, { recursive: true }); await backupStore(options(source, destination))
  await mkdir(restored, { mode: 0o700 }); await writeFile(join(restored, 'keep'), 'existing', { mode: 0o600 })
  await expect(restoreStore(options(destination, restored))).rejects.toThrow()
  expect(await readFile(join(restored, 'keep'), 'utf8')).toBe('existing')
})

it('rejects relative paths, traversal, containment, equality and conflicting lock destinations', async () => {
  const { root, source, destination } = await fixture()
  for (const target of [source, join(source, 'nested'), root, `${source}.lock`, `${source}.lock/child`, `${source}.lock.lock`, `${root}/extra/../backup`, 'relative-backup']) {
    await expect(backupStore(options(source, target))).rejects.toThrow()
  }
  await absent(destination)
  await expect(backupStore(options(`${root}/missing/../account-store`, destination))).rejects.toThrow()
})

it('rejects source, destination and ancestor symlinks without following or removing them', async () => {
  const { root, source, destination } = await fixture()
  await symlink(source, join(root, 'alias'), 'dir')
  await expect(backupStore(options(join(root, 'alias'), destination))).rejects.toThrow()
  await symlink(source, destination, 'dir')
  await expect(backupStore(options(source, destination))).rejects.toThrow()
  expect((await lstat(destination)).isSymbolicLink()).toBe(true)
  await rm(destination)
  await expect(backupStore(options(source, join(root, 'alias', 'output')))).rejects.toThrow()
  await symlink(join(source, 'auth/users/test.json'), join(source, 'linked.json'))
  await expect(backupStore(options(source, destination))).rejects.toThrow()
  await absent(destination)
})

it('rejects a non-private account root without changing its permissions', async () => {
  const { source, destination } = await fixture()
  await chmod(source, 0o755)
  await expect(backupStore(options(source, destination))).rejects.toThrow()
  expect((await lstat(source)).mode & 0o777).toBe(0o755)
  await absent(destination)
})

it('preserves generated artifacts with default nested modes inside a private root, making copies private', async () => {
  const { source, destination, restored } = await fixture()
  const artifact = 'owners/synthetic-owner/project/artifacts/frame.png'
  await chmod(join(source, artifact), 0o644)
  await chmod(dirname(join(source, artifact)), 0o755)
  await backupStore(options(source, destination)); await restoreStore(options(destination, restored))
  expect(await readFile(join(restored, artifact))).toEqual(Buffer.from([1, 2, 3]))
  expect((await lstat(join(source, artifact))).mode & 0o777).toBe(0o644)
  expect((await lstat(dirname(join(source, artifact)))).mode & 0o777).toBe(0o755)
  expect((await lstat(join(restored, artifact))).mode & 0o777).toBe(0o600)
  expect((await lstat(dirname(join(restored, artifact)))).mode & 0o777).toBe(0o700)
})

it.each(['tampered', 'missing', 'extra', 'symlink', 'manifest-symlink', 'extra-top-level'])('refuses %s backup content before publishing a restored store', async mutation => {
  const { root, source, destination, restored } = await fixture()
  await backupStore(options(source, destination))
  const original = join(destination, 'store/owners/synthetic-owner/project/original')
  if (mutation === 'tampered') await writeFile(original, 'corrupted')
  if (mutation === 'missing') await rm(original)
  if (mutation === 'extra') await writeFile(join(destination, 'store/extra'), 'unlisted', { mode: 0o600 })
  if (mutation === 'symlink') { await rm(original); await symlink(join(source, 'auth/users/test.json'), original) }
  if (mutation === 'manifest-symlink') { await rm(join(destination, 'manifest.json')); await symlink(join(root, 'missing'), join(destination, 'manifest.json')) }
  if (mutation === 'extra-top-level') await writeFile(join(destination, 'extra'), 'unlisted', { mode: 0o600 })
  await expect(restoreStore(options(destination, restored))).rejects.toThrow()
  await absent(restored); await absent(`${restored}.lock`)
})

it.each(['../escaped', '/absolute', 'C:/windows', 'folder\\escape', '.', 'folder//entry', 'folder/../entry'])('rejects malicious manifest path %s without writing outside restore', async path => {
  const { source, destination, restored, root } = await fixture()
  await backupStore(options(source, destination))
  await editManifest(destination, manifest => { manifest.entries[0].path = path })
  await expect(restoreStore(options(destination, restored))).rejects.toThrow()
  await absent(restored); await absent(join(root, 'escaped'))
})

it.each(['version', 'duplicate', 'type', 'hash', 'size', 'file-parent'])('rejects malformed %s manifest', async mutation => {
  const { source, destination, restored } = await fixture()
  await backupStore(options(source, destination))
  await editManifest(destination, manifest => {
    const file = manifest.entries.find(entry => entry.type === 'file')
    if (mutation === 'version') manifest.version = 2
    if (mutation === 'duplicate') manifest.entries.push(manifest.entries[0])
    if (mutation === 'type') file.type = 'symlink'
    if (mutation === 'hash') file.sha256 = 'bad'
    if (mutation === 'size') file.bytes = -1
    if (mutation === 'file-parent') manifest.entries.push({ path: `${file.path}/child`, type: 'directory' })
  })
  await expect(restoreStore(options(destination, restored))).rejects.toThrow()
  await absent(restored)
})

it('CLI requires explicit paths and acknowledgement and never prints credential contents or paths on failure', async () => {
  const { source, destination } = await fixture()
  const cli = new URL('./cli.mjs', import.meta.url)
  const missing = spawnSync(process.execPath, [cli.pathname, 'backup', '--source', source, '--destination', destination], { encoding: 'utf8' })
  expect(missing.status).toBe(1); expect(missing.stderr).toMatch(/stopped/i)
  expect(missing.stderr).not.toContain(source); expect(missing.stderr).not.toContain('synthetic-password-hash')
  const good = spawnSync(process.execPath, [cli.pathname, 'backup', '--source', source, '--destination', destination, '--server-stopped'], { encoding: 'utf8' })
  expect(good.status).toBe(0); expect(good.stdout).toBe('Private account backup complete. Keep it outside served or shared directories.\n')
  expect(good.stderr).toBe('')
})
