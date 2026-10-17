import { execFile, spawn } from 'node:child_process'
import { promisify } from 'node:util'
import { lstat, mkdtemp, open, rm } from 'node:fs/promises'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { createRequire } from 'node:module'
import { loadLocalConfig, projectRoot, validateLocalConfig } from './config.mjs'

const exec = promisify(execFile)
async function probe(command, args) { const result = await exec(command, args, { timeout: 15_000, maxBuffer: 1024 * 1024 }); return result.stdout + result.stderr }
async function file(path) { const info = await lstat(path); if (!info.isFile() || info.isSymbolicLink()) throw Error('not a regular build file') }
async function checkFd() {
  const root = await mkdtemp(join(tmpdir(), 'mml-fd-check-')), output = await open(join(root, 'probe.webm'), 'wx', 0o600)
  try {
    await new Promise((resolve, reject) => {
      const child = spawn('/snap/bin/ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i', 'color=c=black:s=16x16:r=1', '-frames:v', '1', '-an', '-c:v', 'libvpx-vp9', '-threads', '1', '-f', 'webm', '/proc/self/fd/3'], { stdio: ['ignore', 'ignore', 'ignore', output.fd], timeout: 15_000 })
      child.once('error', reject); child.once('close', code => code === 0 ? resolve() : reject(Error('Native FFmpeg cannot write staged /proc/self/fd/3 output.')))
    })
    if ((await output.stat()).size === 0) throw Error('Native FFmpeg produced no staged output.')
  } finally { await output.close(); await rm(root, { recursive: true, force: true }) }
}

export async function assertPortAvailable(port) {
  await new Promise((resolve, reject) => {
    const server = createServer()
    server.once('error', error => reject(new Error(error.code === 'EADDRINUSE' ? `Loopback port ${port} is occupied. The existing service was not stopped or changed; select another port or explicitly stop its owner.` : `Cannot bind loopback port ${port}: ${error.code}.`)))
    server.listen({ port, host: '127.0.0.1', exclusive: true }, () => server.close(error => error ? reject(error) : resolve()))
  })
}

export async function checkLocalRuntime(config, options = {}) {
  const project = options.project ?? projectRoot, run = options.probe ?? probe, checks = []
  async function check(name, action, detail) {
    try { await action(); checks.push({ name, ok: true, detail }) }
    catch { checks.push({ name, ok: false, detail }) }
  }
  await check('configuration', () => validateLocalConfig(config, project), 'Use local:configure with a private absolute data root and a valid port.')
  await check('Node.js', async () => { const [major, minor] = (options.nodeVersion ?? process.versions.node).split('.').map(Number); if (!(major > 22 || major === 22 && minor >= 12)) throw Error() }, 'Node.js 22.12+ is required.')
  await check('npm', async () => { const version = (await run('npm', ['--version'])).trim(); if (!/^\d+\.\d+\.\d+$/.test(version) || Number(version.split('.')[0]) < 11) throw Error() }, 'npm 11+ is required.')
  await check('frontend build', () => file(join(project, 'dist/index.html')), 'Run npm run build before starting.')
  await check('server build', async () => { for (const path of ['self-hosted/start.js', 'self-hosted/create-account.js', 'local-projects/render-worker.js', 'local-runtime/store-lock.mjs']) await file(join(project, 'dist-server/scripts', path)) }, 'Run npm run build:server before starting.')
  await check('Sharp', options.loadSharp ?? (async () => { const require = createRequire(join(project, 'package.json')); await require('sharp')({ create: { width: 1, height: 1, channels: 3, background: '#000' } }).png().toBuffer() }), 'Installed Sharp native image processing must load successfully. Run npm ci after checking prerequisites.')
  await check('FFmpeg VP9', async () => { if (!(await run('/snap/bin/ffmpeg', ['-hide_banner', '-encoders'])).includes('libvpx-vp9')) throw Error() }, 'Native /snap/bin/ffmpeg with libvpx-vp9 is required; no binary is installed automatically.')
  await check('Linux FD staging', async () => { if ((options.platform ?? process.platform) !== 'linux') throw Error(); await (options.checkFd ?? checkFd)() }, 'Linux native FFmpeg must encode through inherited /proc/self/fd/3 staging.')
  await check('private storage', async () => { try { const info = await lstat(config.dataRoot); if (!info.isDirectory() || info.isSymbolicLink() || (info.mode & 0o077)) throw Error() } catch (error) { if (error.code !== 'ENOENT') throw error } }, 'The selected data root must be absent or a private real directory (0700).')
  await check('store lock', async () => { try { await lstat(config.dataRoot + '.lock') } catch (error) { if (error.code === 'ENOENT') return; throw error } throw Error() }, 'Stop the holder before starting; inspect stale sibling .lock manually only after verifying all writers stopped.')
  await check('loopback port', () => (options.checkPort ?? assertPortAvailable)(config.port), `Port ${config.port} must be free; existing services are never stopped.`)
  return { ok: checks.every(check => check.ok), checks, optionalAI: 'off' }
}

export function formatDoctor(report) {
  return [...report.checks.map(check => `${check.ok ? 'OK' : 'FAIL'} ${check.name}: ${check.detail}`), 'Optional AI: off. Manual authoring/render/playback remain available.'].join('\n')
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    if (process.argv.length !== 2) throw Error('Usage: npm run local:doctor. Configure durable settings with local:configure.')
    const { config, path, persisted } = await loadLocalConfig()
    console.log(`Local configuration: ${path}${persisted ? '' : ' (defaults; not yet persisted)'}\nPrivate data: ${config.dataRoot}`)
    const report = await checkLocalRuntime(config); console.log(formatDoctor(report)); if (!report.ok) process.exitCode = 1
  } catch (error) { console.error(error.message); process.exitCode = 1 }
}
