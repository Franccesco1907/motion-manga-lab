// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest'
import { mkdtemp, mkdir, readFile, writeFile, lstat, rm } from 'node:fs/promises'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { loadLocalConfig, saveLocalConfig, localEnvironment } from './config.mjs'
import { checkLocalRuntime, assertPortAvailable } from './doctor.mjs'
import { acquireStoreLock } from './store-lock.mjs'
import { firstAccount, startLocal } from './startup.mjs'

const roots = []
afterEach(async () => { vi.restoreAllMocks(); for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }) })
async function fixture() {
  const home = await mkdtemp(join(tmpdir(), 'mml-runtime-')); roots.push(home)
  const project = join(home, 'checkout'); await mkdir(project)
  const env = { HOME: home, XDG_CONFIG_HOME: join(home, 'settings'), XDG_DATA_HOME: join(home, 'data') }
  return { home, project, env }
}
const healthyProbe = async command => command === 'npm' ? '11.17.0' : command === '/snap/bin/ffmpeg' ? ' V..... libvpx-vp9 ' : ''
async function artifacts(project) {
  for (const file of ['dist/index.html', 'dist-server/scripts/self-hosted/start.js', 'dist-server/scripts/self-hosted/create-account.js', 'dist-server/scripts/local-projects/render-worker.js', 'dist-server/scripts/local-runtime/store-lock.mjs']) {
    const path = join(project, file); await mkdir(join(path, '..'), { recursive: true }); await writeFile(path, 'synthetic build')
  }
}
const probes = { probe: healthyProbe, nodeVersion: '22.12.0', platform: 'linux', loadSharp: async () => {}, checkFd: async () => {}, checkPort: async () => {} }

it('loads read-only defaults and persists explicit private configuration across shells', async () => {
  const { env, project, home } = await fixture()
  const initial = await loadLocalConfig({ env, project })
  expect(initial.config.port).toBe(8080)
  await expect(lstat(initial.path)).rejects.toMatchObject({ code: 'ENOENT' })
  const dataRoot = join(home, 'existing-validation-store')
  await saveLocalConfig({ schemaVersion: 1, dataRoot, port: 8081 }, { env, project })
  const next = await loadLocalConfig({ env, project })
  expect(next.config).toEqual({ schemaVersion: 1, dataRoot, port: 8081 })
  expect((await lstat(next.path)).mode & 0o077).toBe(0)
  expect(await readFile(next.path, 'utf8')).not.toMatch(/password|token|secret/)
  await expect(lstat(dataRoot)).rejects.toMatchObject({ code: 'ENOENT' })
})

it.each([
  { schemaVersion: 1, dataRoot: '/tmp/private', port: 0 },
  { schemaVersion: 1, dataRoot: 'relative', port: 8080 },
  { schemaVersion: 1, dataRoot: '/tmp/private', port: 8080, password: 'never accepted' },
])('rejects invalid config without writing it: %j', async bad => {
  const { env, project } = await fixture()
  await expect(saveLocalConfig(bad, { env, project })).rejects.toThrow(/configuration/i)
})

it('rejects corrupt, symlinked, or public configuration and data roots', async () => {
  const { env, project, home } = await fixture()
  await expect(saveLocalConfig({ schemaVersion: 1, dataRoot: join(project, 'public/private'), port: 8080 }, { env, project })).rejects.toThrow(/outside/i)
  const result = await loadLocalConfig({ env, project }); await mkdir(join(result.path, '..'), { recursive: true, mode: 0o700 })
  await writeFile(result.path, '{broken', { mode: 0o600 })
  await expect(loadLocalConfig({ env, project })).rejects.toThrow(/configuration/i)
  const { symlink } = await import('node:fs/promises')
  await rm(result.path); await symlink(join(home, 'other'), result.path)
  await expect(loadLocalConfig({ env, project })).rejects.toThrow(/configuration/i)
})

it('reports bad prerequisites and missing builds without creating config or account data', async () => {
  const { env, project } = await fixture()
  const { config, path } = await loadLocalConfig({ env, project })
  const report = await checkLocalRuntime(config, { ...probes, project, nodeVersion: '20.0.0', probe: async () => { throw Error('missing') }, loadSharp: async () => { throw Error('missing') }, checkFd: async () => { throw Error('missing') } })
  expect(report.ok).toBe(false)
  expect(report.checks.filter(check => !check.ok).map(check => check.name)).toEqual(expect.arrayContaining(['Node.js', 'npm', 'frontend build', 'server build', 'Sharp', 'FFmpeg VP9', 'Linux FD staging']))
  await expect(lstat(path)).rejects.toMatchObject({ code: 'ENOENT' })
  await expect(lstat(config.dataRoot)).rejects.toMatchObject({ code: 'ENOENT' })
})

it('accepts a ready runtime without requiring optional AI', async () => {
  const { env, project } = await fixture(); await artifacts(project)
  const { config } = await loadLocalConfig({ env, project })
  const report = await checkLocalRuntime(config, { ...probes, project })
  expect(report.checks.filter(check => !check.ok)).toEqual([])
  expect(report.ok).toBe(true)
  expect(report.optionalAI).toBe('off')
})

it('detects an occupied port without sending requests or stopping its service', async () => {
  const service = createServer(); let connections = 0; service.on('connection', () => { connections++ })
  await new Promise(resolve => service.listen(0, '127.0.0.1', resolve))
  try {
    await expect(assertPortAvailable(service.address().port)).rejects.toThrow(/occupied.*not stopped/i)
    expect(service.listening).toBe(true); expect(connections).toBe(0)
  } finally { await new Promise(resolve => service.close(resolve)) }
})

it('shares a fail-closed sibling lock and releases only after the holder finishes', async () => {
  const { home } = await fixture(); const root = join(home, 'private')
  const release = await acquireStoreLock(root)
  await expect(acquireStoreLock(root)).rejects.toThrow(/locked/i)
  expect(JSON.parse(await readFile(root + '.lock/owner.json', 'utf8')).pid).toBe(process.pid)
  await expect(lstat(root)).rejects.toMatchObject({ code: 'ENOENT' })
  await release(); await release()
  const nextRelease = await acquireStoreLock(root); await nextRelease()
})

it('first account setup requires an explicit username off-TTY and never takes passwords in argv', async () => {
  const { home } = await fixture(); const calls = []
  const execute = async (...args) => { calls.push(args); return 0 }
  await expect(firstAccount({ dataRoot: join(home, 'private'), port: 8080 }, { project: home, isTTY: false, execute })).rejects.toThrow(/--username/)
  await firstAccount({ dataRoot: join(home, 'private'), port: 8080 }, { project: home, isTTY: false, username: 'alice', execute })
  expect(calls).toHaveLength(1)
  expect(calls[0][1].at(-1)).toBe('alice')
  expect(calls[0][1]).toHaveLength(2)
})

it('skips first-account prompts for the selected existing store and isolates local settings from shell overrides', async () => {
  const { env, home } = await fixture(); const dataRoot = join(home, 'existing')
  await mkdir(join(dataRoot, 'auth/users'), { recursive: true, mode: 0o700 }); await writeFile(join(dataRoot, 'auth/users/alice.json'), '{}')
  const execute = vi.fn()
  await firstAccount({ dataRoot, port: 8081 }, { project: home, isTTY: false, execute })
  expect(execute).not.toHaveBeenCalled()
  const runtime = localEnvironment({ dataRoot, port: 8081 }, { ...env, PORT: '9999', PUBLIC_ORIGIN: 'https://example.com', MOTION_MANGA_ACCOUNT_DATA: '/wrong', MOTION_MANGA_MODEL_PROJECT: '/models' })
  expect(runtime.PORT).toBe('8081'); expect(runtime.PUBLIC_ORIGIN).toBeUndefined()
  expect(runtime.MOTION_MANGA_ACCOUNT_DATA).toBe(dataRoot)
  expect(runtime.MOTION_MANGA_MODEL_PROJECT).toBeUndefined()
})

it('does not bootstrap an account or launch when health checks fail', async () => {
  const { env, project } = await fixture(); const execute = vi.fn()
  await expect(startLocal({ env, project, username: 'alice', execute, doctor: async () => ({ ok: false, checks: [{ name: 'frontend build', ok: false, detail: 'Run npm run build.' }] }) })).rejects.toThrow(/frontend build/)
  expect(execute).not.toHaveBeenCalled()
})

it('rejects malformed npm version output instead of treating NaN as a supported version', async () => {
  const { env, project } = await fixture(); await artifacts(project)
  const { config } = await loadLocalConfig({ env, project })
  const report = await checkLocalRuntime(config, { ...probes, project, probe: async command => command === 'npm' ? 'not-a-version' : healthyProbe(command) })
  expect(report.checks.find(check => check.name === 'npm').ok).toBe(false)
})

it('gracefully cancels first-account input without abandoning its private store lock', async () => {
  const { home } = await fixture(), dataRoot = join(home, 'cancelled-account')
  const { spawn } = await import('node:child_process')
  const child = spawn(process.execPath, ['--experimental-strip-types', 'scripts/self-hosted/create-account.ts', 'cancelled-user'], { cwd: process.cwd(), env: { ...process.env, MOTION_MANGA_ACCOUNT_DATA: dataRoot }, stdio: ['pipe', 'pipe', 'pipe'] })
  let output = ''; child.stdout.on('data', bytes => { output += bytes }); child.stderr.on('data', bytes => { output += bytes })
  const exited = new Promise(resolve => child.once('close', code => resolve(code)))
  try {
    await expect.poll(async () => { try { return JSON.parse(await readFile(dataRoot + '.lock/owner.json', 'utf8')).pid } catch { return null } }, { timeout: 5000 }).toBe(child.pid)
    child.kill('SIGINT')
    await exited
    await expect(lstat(dataRoot + '.lock')).rejects.toMatchObject({ code: 'ENOENT' })
    await expect(lstat(join(dataRoot, 'auth/users/cancelled-user.json'))).rejects.toMatchObject({ code: 'ENOENT' })
    expect(output).not.toContain('Created closed-registration account')
  } finally { if (child.exitCode === null && child.signalCode === null) { child.kill('SIGKILL'); await exited } }
}, 10_000)

it('settles account hashing and its atomic record before releasing a signalled writer lock', async () => {
  const { home } = await fixture(), dataRoot = join(home, 'settled-account')
  const { spawn } = await import('node:child_process')
  const child = spawn(process.execPath, ['--experimental-strip-types', 'scripts/self-hosted/create-account.ts', 'settled-user'], { cwd: process.cwd(), env: { ...process.env, MOTION_MANGA_ACCOUNT_DATA: dataRoot }, stdio: ['pipe', 'pipe', 'pipe'] })
  let output = ''; child.stdout.on('data', bytes => { output += bytes }); child.stderr.on('data', bytes => { output += bytes })
  const exited = new Promise(resolve => child.once('close', code => resolve(code)))
  child.stdin.end('synthetic interruption password\n')
  try {
    await expect.poll(async () => { try { return (await lstat(join(dataRoot, 'auth/users'))).isDirectory() } catch { return false } }, { timeout: 5000 }).toBe(true)
    child.kill('SIGTERM')
    expect(await exited).toBe(143)
    const record = JSON.parse(await readFile(join(dataRoot, 'auth/users/settled-user.json'), 'utf8'))
    expect(record.username).toBe('settled-user'); expect(record.hash).toHaveLength(128)
    await expect(lstat(dataRoot + '.lock')).rejects.toMatchObject({ code: 'ENOENT' })
    expect(output).not.toContain('synthetic interruption password')
  } finally { if (child.exitCode === null && child.signalCode === null) { child.kill('SIGKILL'); await exited } }
}, 10_000)

it('configures a selected store through the source CLI without needing a server build or creating that store', async () => {
  const { env, project, home } = await fixture(), dataRoot = join(home, 'selected-via-command')
  const { execFile } = await import('node:child_process'), { promisify } = await import('node:util')
  const run = promisify(execFile)
  const { stdout } = await run(process.execPath, ['scripts/local-runtime/configure.mjs', '--data-root', dataRoot, '--port', '8081'], { cwd: process.cwd(), env: { ...process.env, ...env } })
  expect(stdout).toContain('No private store or account was created or migrated.')
  expect((await loadLocalConfig({ env, project })).config).toEqual({ schemaVersion: 1, dataRoot, port: 8081 })
  await expect(lstat(dataRoot)).rejects.toMatchObject({ code: 'ENOENT' })
})
