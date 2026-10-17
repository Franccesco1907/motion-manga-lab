// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CDP } from './cdp.mjs'

class Socket extends EventTarget {
  sent = []
  send(value) { this.sent.push(JSON.parse(value)) }
  close() { this.dispatchEvent(new Event('close')) }
  reply(value) { this.dispatchEvent(new MessageEvent('message', { data: JSON.stringify(value) })) }
}
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() })
describe('native Chrome protocol failure boundaries', () => {
  it('correlates commands and rejects work when Chrome closes', async () => {
    const socket = new Socket(), cdp = new CDP(socket)
    const result = cdp.send('Page.enable')
    socket.reply({ id: socket.sent[0].id, result: { enabled: true } })
    await expect(result).resolves.toEqual({ enabled: true })
    const pending = cdp.send('Page.navigate')
    cdp.close()
    await expect(pending).rejects.toThrow('Chrome closed during Page.navigate')
  })
  it('never includes evaluated secrets in protocol error evidence', async () => {
    const socket = new Socket(), cdp = new CDP(socket)
    const result = cdp.evaluate('private-sign-in-value')
    socket.reply({ id: socket.sent[0].id, result: { exceptionDetails: { text: 'Evaluation failed' } } })
    await expect(result).rejects.toThrow(/^Browser evaluation failed: Evaluation failed$/)
    cdp.close()
  })
  it('can unsubscribe network listeners', () => {
    const socket = new Socket(), cdp = new CDP(socket), listener = vi.fn()
    const dispose = cdp.on('Network.requestWillBeSent', listener)
    socket.reply({ method: 'Network.requestWillBeSent', params: { requestId: 'one' } })
    dispose()
    socket.reply({ method: 'Network.requestWillBeSent', params: { requestId: 'two' } })
    expect(listener).toHaveBeenCalledExactlyOnceWith({ requestId: 'one' })
    cdp.close()
  })
  it('bounds a Chrome websocket that never opens', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('WebSocket', Socket)
    const connection = CDP.connect('ws://127.0.0.1:49152')
    const rejected = expect(connection).rejects.toThrow('Chrome debugging connection timed out.')
    await vi.advanceTimersByTimeAsync(20000)
    await rejected
  })
})
