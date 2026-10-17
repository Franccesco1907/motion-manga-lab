import { eventually } from './helpers.mjs'

export class CDP {
  #socket
  #next = 0
  #pending = new Map()
  #listeners = new Map()
  constructor(socket) {
    this.#socket = socket
    socket.addEventListener('message', event => {
      const message = JSON.parse(String(event.data))
      if (message.id) {
        const pending = this.#pending.get(message.id)
        if (!pending) return
        this.#pending.delete(message.id)
        clearTimeout(pending.timeout)
        if (message.error) pending.reject(new Error(`CDP ${pending.method}: ${message.error.message}`))
        else pending.resolve(message.result)
      } else for (const listener of this.#listeners.get(message.method) ?? []) listener(message.params)
    })
    socket.addEventListener('close', () => {
      for (const pending of this.#pending.values()) { clearTimeout(pending.timeout); pending.reject(new Error(`Chrome closed during ${pending.method}.`)) }
      this.#pending.clear()
    })
  }
  static async connect(url) {
    const socket = new WebSocket(url)
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => { socket.close(); reject(new Error('Chrome debugging connection timed out.')) }, 20000)
      socket.addEventListener('open', () => { clearTimeout(timeout); resolve() }, { once: true })
      socket.addEventListener('error', () => { clearTimeout(timeout); socket.close(); reject(new Error('Chrome debugging connection failed.')) }, { once: true })
    })
    return new CDP(socket)
  }
  send(method, params = {}) {
    const id = ++this.#next
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => { this.#pending.delete(id); reject(new Error(`CDP timeout: ${method}`)) }, 20000)
      this.#pending.set(id, { resolve, reject, timeout, method })
      this.#socket.send(JSON.stringify({ id, method, params }))
    })
  }
  on(method, listener) {
    const listeners = this.#listeners.get(method) ?? new Set()
    listeners.add(listener)
    this.#listeners.set(method, listeners)
    return () => listeners.delete(listener)
  }
  async evaluate(expression) {
    const result = await this.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true, userGesture: false })
    // Never include evaluated source: sign-in values are secret.
    if (result.exceptionDetails) throw new Error(`Browser evaluation failed: ${result.exceptionDetails.exception?.description?.split('\n')[0] ?? result.exceptionDetails.text}`)
    return result.result.value
  }
  wait(expression, label, timeout) {
    return eventually(() => this.evaluate(expression), { label, timeout })
  }
  close() { this.#socket.close() }
}

// Select by actual accessible UI labels/text, rather than adding test-only app hooks.
export const domHelpers = `
window.journey = {
  button(name) { const item = [...document.querySelectorAll('button')].find(e => (e.getAttribute('aria-label') || e.textContent).trim() === name); if (!item || item.disabled) throw new Error('Button unavailable: ' + name); item.scrollIntoView({block:'center'}); item.click(); },
  field(name) { const label = [...document.querySelectorAll('label')].find(e => e.textContent.trim() === name || e.firstChild?.textContent?.trim() === name); const item = label?.control || label?.querySelector('input,select'); if (!item) throw new Error('Field unavailable: ' + name); return item; },
  fill(name, value) { const item = this.field(name); const prototype = item.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(prototype, 'value').set.call(item, value); item.dispatchEvent(new Event('input', {bubbles:true})); item.dispatchEvent(new Event('change', {bubbles:true})); },
  details(name) { const summary = [...document.querySelectorAll('summary')].find(e => e.textContent.trim() === name); if (!summary) throw new Error('Details unavailable: ' + name); if (!summary.parentElement.open) summary.click(); },
  text(text) { return document.body.textContent.includes(text); },
  alert(text) { return [...document.querySelectorAll('[role=alert]')].some(e => e.textContent.includes(text)); }
};
`
