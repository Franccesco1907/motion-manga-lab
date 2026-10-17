import { spawn } from 'node:child_process'
import { createInterface } from 'node:readline/promises'
import { lstat, readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { loadLocalConfig, localEnvironment, projectRoot, saveLocalConfig } from './config.mjs'
import { checkLocalRuntime, formatDoctor } from './doctor.mjs'

export async function executeInherited(command, args, options) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { ...options, stdio: 'inherit' })
    const forward = signal => { if (child.exitCode === null) child.kill(signal) }
    const interrupt = () => forward('SIGINT'), terminate = () => forward('SIGTERM')
    process.on('SIGINT', interrupt); process.on('SIGTERM', terminate)
    const cleanup = () => { process.off('SIGINT', interrupt); process.off('SIGTERM', terminate) }
    child.once('error', error => { cleanup(); reject(error) })
    child.once('close', code => { cleanup(); resolve(code ?? 1) })
  })
}

export async function firstAccount(config, options = {}) {
  const users = join(config.dataRoot, 'auth/users')
  let names
  try { const info = await lstat(users); if (!info.isDirectory() || info.isSymbolicLink()) throw Error('Private account directory is unavailable.'); names = await readdir(users) }
  catch (error) { if (error.code !== 'ENOENT') throw error; names = [] }
  if (names.some(name => /^[a-z][a-z0-9_.-]{2,63}\.json$/.test(name))) return
  let username = options.username
  if (!username) {
    if (!(options.isTTY ?? process.stdin.isTTY)) throw Error('No local account exists. Run interactively, or pass --username <name> with one password line through stdin (never as an argument).')
    const lines = createInterface({ input: process.stdin, output: process.stdout })
    try { username = await lines.question('Create first local account — username: ') } finally { lines.close() }
  }
  if (!/^[a-z][a-z0-9_.-]{2,63}$/.test(username)) throw Error('Use a 3–64 character lowercase username beginning with a letter.')
  const code = await (options.execute ?? executeInherited)(process.execPath, [join(options.project ?? projectRoot, 'dist-server/scripts/self-hosted/create-account.js'), username], { env: localEnvironment(config, options.env), cwd: options.project ?? projectRoot })
  if (code !== 0) throw Error('First local account was not created. Correct the reported issue and explicitly retry; no password is saved in local configuration.')
}

export async function startLocal(options = {}) {
  const settings = { env: options.env ?? process.env, project: options.project ?? projectRoot }
  const loaded = await loadLocalConfig(settings), config = loaded.config
  const report = await (options.doctor ?? checkLocalRuntime)(config, { project: settings.project })
  if (!report.ok) throw Error(`Local startup blocked:\n${formatDoctor(report)}`)
  if (!loaded.persisted) await saveLocalConfig(config, settings)
  await firstAccount(config, { ...settings, username: options.username, execute: options.execute })
  console.log(`Starting local workspace at http://127.0.0.1:${config.port}. Private data: ${config.dataRoot}. Optional AI: off. Stop with Ctrl+C.`)
  return (options.execute ?? executeInherited)(process.execPath, [join(settings.project, 'dist-server/scripts/self-hosted/start.js')], { cwd: settings.project, env: localEnvironment(config, settings.env) })
}
