import { fileURLToPath } from 'node:url'
import { createSelfHostedService } from './server.ts'
import { operatorDataRoot } from './config.ts'
import { acquireStoreLock } from '../local-runtime/store-lock.mjs'

let release: (() => Promise<void>) | undefined
try {
  if (process.argv.length > 2) throw new Error('Configure the service through explicit environment settings, not positional arguments.')
  const port = Number(process.env.PORT ?? '8080')
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('PORT must be an integer from 1024 through 65535.')
  const root = operatorDataRoot()
  release = await acquireStoreLock(root)
  const service = createSelfHostedService({ root, staticRoot: fileURLToPath(new URL('../../../dist/', import.meta.url)), publicOrigin: process.env.PUBLIC_ORIGIN })
  let closing = false
  async function close(code = 0) {
    if (closing) return
    closing = true
    try { await service.close() } finally { await release?.() }
    process.exitCode = code
  }
  service.server.once('error', error => {
    console.error('code' in error && error.code === 'EADDRINUSE' ? `Loopback port ${port} is occupied; the existing service was not stopped or changed.` : 'Account service could not start. Check local configuration and permissions.')
    void close(1)
  })
  service.server.listen(port, '127.0.0.1', () => { console.log(`Account service listening on loopback port ${port}. Closed registration; no data migration.`) })
  process.on('SIGTERM', () => { void close() })
  process.on('SIGINT', () => { void close() })
} catch (error) {
  await release?.()
  console.error(error instanceof Error ? error.message : 'Account service startup failed.')
  process.exitCode = 1
}
