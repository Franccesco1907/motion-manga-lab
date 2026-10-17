import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { createServer } from 'node:net'
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile, lstat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { projectRoot } from './config.mjs'

// Explicit post-build harness: isolated synthetic accounts only, never an operator's config/store.
const root = await mkdtemp(join(tmpdir(), 'mml-local-smoke-')), children = new Set()
const dataRoot = join(root, 'selected-existing-store'), password = randomBytes(32).toString('hex')
const env = { ...process.env, HOME: root, XDG_CONFIG_HOME: join(root, 'config'), XDG_DATA_HOME: join(root, 'default-data'), PORT: '9999', PUBLIC_ORIGIN: 'https://must-not-be-inherited.invalid', MOTION_MANGA_ACCOUNT_DATA: join(root, 'wrong-store'), MOTION_MANGA_MODEL_PROJECT: join(root, 'wrong-models') }
function launch(script, args = [], input = '') {
  const child = spawn(process.execPath, [join(projectRoot, 'scripts/local-runtime', script), ...args], { cwd: projectRoot, env, stdio: ['pipe', 'pipe', 'pipe'] })
  children.add(child)
  let output = '', readyResolve, readyReject
  const ready = new Promise((resolve, reject) => { readyResolve = resolve; readyReject = reject }); void ready.catch(() => {})
  child.stdout.on('data', bytes => { output += bytes; if (output.includes('Account service listening on loopback port')) readyResolve() })
  child.stderr.on('data', bytes => { output += bytes })
  const done = new Promise((resolve, reject) => { child.once('error', reject); child.once('close', code => { children.delete(child); readyReject(Error('Service exited before becoming ready.')); resolve(code) }) })
  child.stdin.on('error', () => { /* Refused startup may close stdin before synthetic input is consumed. */ })
  child.stdin.end(input)
  return { child, ready, done, output: () => output }
}
async function bounded(promise, message) {
  let timer
  try { return await Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(Error(message)), 20_000) })]) }
  finally { clearTimeout(timer) }
}
async function command(script, args = [], input = '') {
  const run = launch(script, args, input), code = await bounded(run.done, 'Local smoke command timed out.')
  assert(!run.output().includes(password), 'Synthetic password must never appear in logs.')
  return { code, output: run.output() }
}
async function stop(run) {
  run.child.kill('SIGTERM'); assert.equal(await bounded(run.done, 'Local service did not stop gracefully.'), 0)
  assert(!run.output().includes(password), 'Synthetic password must never appear in logs.')
  await assert.rejects(lstat(dataRoot + '.lock'), { code: 'ENOENT' })
}
try {
  await mkdir(dataRoot, { mode: 0o700 }); await writeFile(join(dataRoot, 'preserve.txt'), 'synthetic existing data', { mode: 0o600 })
  const portProbe = createServer(); await new Promise(resolve => portProbe.listen(0, '127.0.0.1', resolve)); const port = portProbe.address().port; await new Promise(resolve => portProbe.close(resolve))
  const configured = await command('configure.mjs', ['--data-root', dataRoot, '--port', String(port)]); assert.equal(configured.code, 0, configured.output)
  const config = JSON.parse(await readFile(join(env.XDG_CONFIG_HOME, 'motion-manga-lab/local.json'), 'utf8'))
  assert.equal(config.dataRoot, dataRoot); assert.equal(config.port, port)
  const checked = await command('doctor.mjs'); assert.equal(checked.code, 0, checked.output)
  const first = launch('start.mjs', ['--username', 'smokeuser'], password + '\n')
  await bounded(first.ready, 'First local startup timed out.')
  const origin = `http://127.0.0.1:${port}`
  const login = async () => {
    const response = await fetch(origin + '/api/auth/login', { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json', 'X-Motion-Manga-Local': '1' }, body: JSON.stringify({ username: 'smokeuser', password }), signal: AbortSignal.timeout(5000) })
    assert.equal(response.status, 200); assert.equal((await response.json()).user.username, 'smokeuser')
  }
  await login(); assert.equal((await fetch(origin, { signal: AbortSignal.timeout(5000) })).status, 200)
  assert.deepEqual(await readdir(join(dataRoot, 'auth/users')), ['smokeuser.json'])
  await stop(first)
  const second = launch('start.mjs'); await bounded(second.ready, 'Restart from persisted configuration timed out.')
  await login(); assert(!second.output().includes('Created closed-registration account')); await stop(second)
  const occupied = createServer(); let contacts = 0; occupied.on('connection', socket => { contacts++; socket.end() }); await new Promise(resolve => occupied.listen(port, '127.0.0.1', resolve))
  try { const refused = await command('start.mjs'); assert.equal(refused.code, 1); assert.match(refused.output, /loopback port/); assert.equal(contacts, 0); assert(occupied.listening) }
  finally { await new Promise(resolve => occupied.close(resolve)) }
  assert.equal(await readFile(join(dataRoot, 'preserve.txt'), 'utf8'), 'synthetic existing data')
  await assert.rejects(lstat(env.MOTION_MANGA_ACCOUNT_DATA), { code: 'ENOENT' })
  await assert.rejects(lstat(join(env.XDG_DATA_HOME, 'motion-manga-lab/self-hosted-v1')), { code: 'ENOENT' })
  console.log('Local startup smoke passed: persisted selected store, stdin-only first account, login, restart, graceful lock release and occupied-port non-interference. Synthetic temporary data removed.')
} finally {
  for (const child of children) child.kill('SIGTERM')
  await Promise.all([...children].map(child => new Promise(resolve => { const timer = setTimeout(() => { child.kill('SIGKILL'); resolve() }, 5000); child.once('close', () => { clearTimeout(timer); resolve() }) })))
  await rm(root, { recursive: true, force: true })
}
