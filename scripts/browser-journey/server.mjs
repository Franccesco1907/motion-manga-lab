// Test-only child: configuration/credentials arrive over stdin, never command arguments.
import { createInterface } from 'node:readline'
import { fileURLToPath } from 'node:url'
import { createSelfHostedService } from '../../dist-server/scripts/self-hosted/server.js'
const lines = createInterface({ input: process.stdin })
const configuration = await new Promise(resolve => lines.once('line', line => resolve(JSON.parse(line))))
lines.close()
const service = createSelfHostedService({ root: configuration.root, staticRoot: fileURLToPath(new URL('../../dist/', import.meta.url)) })
if (configuration.password) await service.auth.createUser(configuration.username, configuration.password)
service.server.listen(0, '127.0.0.1', () => process.stdout.write(`${JSON.stringify({ port: service.server.address().port })}\n`))
let closing = false
async function close() { if (closing) return; closing = true; await service.close(); process.exit(0) }
process.on('SIGTERM', () => { void close() })
process.on('SIGINT', () => { void close() })
