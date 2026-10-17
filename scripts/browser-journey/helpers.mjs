import { setTimeout } from 'node:timers/promises'

export function serverOrigin(address) {
  const port = address?.port
  if (!Number.isInteger(port) || port < 1024 || port > 65535 || [8080, 8081].includes(port)) throw new Error('Journey server must use an isolated ephemeral loopback port.')
  return `http://127.0.0.1:${port}`
}

export function privateError(error, secrets) {
  let message = error instanceof Error ? error.message : 'Browser journey failed.'
  for (const secret of secrets) if (secret) message = message.replaceAll(secret, '[redacted]')
  return message.slice(0, 1000)
}

// Poll only eventual browser/job state, never use sleeps to assert motion behavior.
export async function eventually(read, { timeout = 15000, interval = 50, label = 'browser condition' } = {}) {
  const deadline = Date.now() + timeout
  do {
    const result = await read()
    if (result) return result
    if (Date.now() >= deadline) break
    await setTimeout(Math.min(interval, Math.max(0, deadline - Date.now())))
  } while (Date.now() <= deadline)
  throw new Error(`Timed out: ${label}`)
}
