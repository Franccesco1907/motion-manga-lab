// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { eventually, privateError, serverOrigin } from './helpers.mjs'

describe('isolated browser journey helpers', () => {
  it('accepts only a freshly allocated non-live loopback port', () => {
    expect(serverOrigin({ port: 49152 })).toBe('http://127.0.0.1:49152')
    for (const port of [0, 8080, 8081, 65536, '49152']) expect(() => serverOrigin({ port })).toThrow()
  })
  it('removes credentials from bounded failure evidence', () => {
    expect(privateError(new Error('secret-password failed secret-password'), ['secret-password'])).toBe('[redacted] failed [redacted]')
    expect(privateError(new Error('x'.repeat(3000)), []).length).toBe(1000)
  })
  it('polls eventual state without hiding assertion or protocol failures', async () => {
    let attempts = 0
    expect(await eventually(() => ++attempts === 3 && 'ready', { interval: 1 })).toBe('ready')
    await expect(eventually(() => { throw new Error('broken protocol') })).rejects.toThrow('broken protocol')
  })
  it('bounds an unavailable condition with its useful stage name', async () => {
    await expect(eventually(() => false, { timeout: 1, interval: 1, label: 'render completed' })).rejects.toThrow('Timed out: render completed')
  })
})
