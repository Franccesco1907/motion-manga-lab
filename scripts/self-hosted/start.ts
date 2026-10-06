import { fileURLToPath } from 'node:url'
import { createSelfHostedService } from './server.ts'
import { operatorDataRoot } from './config.ts'
if (process.argv.length > 2) throw new Error('Configure the service through explicit environment settings, not positional arguments.')
const port = Number(process.env.PORT ?? '8080')
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('PORT must be an integer from 1024 through 65535.')
const service = createSelfHostedService({ root: operatorDataRoot(), staticRoot: fileURLToPath(new URL('../../../dist/', import.meta.url)), publicOrigin: process.env.PUBLIC_ORIGIN })
service.server.listen(port, '127.0.0.1', () => { console.log(`Account service listening on loopback port ${port}. Closed registration; no data migration.`) })
let closing = false
async function close() { if (closing) return; closing = true; await service.close(); process.exit(0) }
process.on('SIGTERM', () => { void close() })
process.on('SIGINT', () => { void close() })
