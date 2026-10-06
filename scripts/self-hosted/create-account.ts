import { Writable } from 'node:stream'
import { createInterface } from 'node:readline/promises'
import { AuthStore } from './auth.ts'
import { operatorDataRoot } from './config.ts'
async function passwordFromInput() {
  if (process.stdin.isTTY) {
    const silent = new Writable({ write(chunk, encoding, callback) { void chunk; void encoding; callback() } })
    const lines = createInterface({ input: process.stdin, output: silent, terminal: true })
    process.stdout.write('Password (hidden): ')
    try { return await lines.question('') } finally { lines.close(); process.stdout.write('\n') }
  }
  const chunks: Buffer[] = []; let length = 0
  for await (const chunk of process.stdin) { length += chunk.length; if (length > 2048) throw new Error('Password input exceeds its bounded size.'); chunks.push(Buffer.from(chunk)) }
  const value = Buffer.concat(chunks).toString('utf8').replace(/\r?\n$/, '')
  if (/[\r\n\0]/.test(value)) throw new Error('Provide exactly one password line through stdin.')
  return value
}
try {
  if (process.argv.length !== 3) throw new Error('Usage: npm run account:create -- <username>; password comes only from hidden TTY input or stdin.')
  const password = await passwordFromInput(), user = await new AuthStore(operatorDataRoot()).createUser(process.argv[2], password)
  console.log(`Created closed-registration account ${user.username}. No password or session credential was logged.`)
} catch (error) { console.error(error instanceof Error ? error.message : 'Account creation failed.'); process.exitCode = 1 }
