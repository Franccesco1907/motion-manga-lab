import { Writable } from 'node:stream'
import { createInterface } from 'node:readline/promises'
import { AuthStore } from './auth.ts'
import { operatorDataRoot } from './config.ts'
import { acquireStoreLock } from '../local-runtime/store-lock.mjs'
async function passwordFromInput(signal: AbortSignal, interrupt: () => void) {
  if (process.stdin.isTTY) {
    const silent = new Writable({ write(chunk, encoding, callback) { void chunk; void encoding; callback() } })
    const lines = createInterface({ input: process.stdin, output: silent, terminal: true })
    lines.on('SIGINT', interrupt)
    process.stdout.write('Password (hidden): ')
    try { return await lines.question('', { signal }) } finally { lines.close(); process.stdout.write('\n') }
  }
  const chunks: Buffer[] = []; let length = 0
  for await (const chunk of process.stdin) { length += chunk.length; if (length > 2048) throw new Error('Password input exceeds its bounded size.'); chunks.push(Buffer.from(chunk)) }
  signal.throwIfAborted()
  const value = Buffer.concat(chunks).toString('utf8').replace(/\r?\n$/, '')
  if (/[\r\n\0]/.test(value)) throw new Error('Provide exactly one password line through stdin.')
  return value
}
const controller = new AbortController()
let interruptionCode = 0
function cancel(code: number) { interruptionCode ||= code; controller.abort(); process.stdin.destroy() }
const interrupt = () => cancel(130), terminate = () => cancel(143)
process.on('SIGINT', interrupt)
process.on('SIGTERM', terminate)
try {
  if (process.argv.length !== 3) throw new Error('Usage: npm run account:create -- <username>; password comes only from hidden TTY input or stdin.')
  const root = operatorDataRoot(), release = await acquireStoreLock(root)
  try {
    controller.signal.throwIfAborted()
    const password = await passwordFromInput(controller.signal, interrupt), user = await new AuthStore(root).createUser(process.argv[2], password)
    console.log(`Created closed-registration account ${user.username}. No password or session credential was logged.`)
  } finally { await release() }
} catch (error) { console.error(controller.signal.aborted ? 'Account creation interrupted. Any in-progress atomic write was allowed to settle before releasing the store lock.' : error instanceof Error ? error.message : 'Account creation failed.'); process.exitCode = 1 }
finally {
  process.off('SIGINT', interrupt); process.off('SIGTERM', terminate)
  if (interruptionCode) process.exitCode = interruptionCode
}
