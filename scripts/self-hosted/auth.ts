import { createHash, randomBytes, randomUUID, scrypt, timingSafeEqual } from 'node:crypto'
import { join } from 'node:path'
import type { AccountSession, AccountUser } from '../../src/features/accounts/contracts.ts'
import { LocalProjectError } from '../local-projects/store.ts'
import { PrivateFiles } from './files.ts'
export const PASSWORD_PARAMETERS = { N: 131072, r: 8, p: 1, maxmem: 192 * 1024 * 1024 } as const
const TOKEN = /^[a-zA-Z0-9_-]{43}$/
const UUID = /^[a-f0-9-]{36}$/
const digest = (value: string) => createHash('sha256').update(value).digest('hex')
const unauthorized = () => new LocalProjectError('authentication_required', 'Sign in to access your private workspace.', 401)
const credentials = () => new LocalProjectError('invalid_credentials', 'The username or password is incorrect.', 401)
interface UserRecord { id: string; username: string; salt: string; hash: string; version: 1 }
interface SessionRecord { user: AccountUser; csrfToken: string; created: number; seen: number }
interface AuthOptions { now?: () => number; idleMs?: number; absoluteMs?: number }
export interface AuthenticatedSession { session: AccountSession; token: string }
export class AuthStore {
  private files: PrivateFiles
  private now: () => number
  private idleMs: number
  private absoluteMs: number
  private hashing = false
  private attempts = new Map<string, number[]>()
  private dummySalt = randomBytes(16)
  constructor(root: string, options: AuthOptions = {}) {
    this.files = new PrivateFiles(join(root, 'auth'))
    this.now = options.now ?? Date.now
    this.idleMs = options.idleMs ?? 30 * 60_000
    this.absoluteMs = options.absoluteMs ?? 12 * 60 * 60_000
  }
  private username(value: string) { return typeof value === 'string' ? value.trim().toLowerCase() : '' }
  private async derive(password: string, salt: Buffer) {
    if (this.hashing) throw new LocalProjectError('rate_limited', 'A sign-in check is already running. Try again shortly.', 429)
    this.hashing = true
    try { return await new Promise<Buffer>((resolve, reject) => { scrypt(password, salt, 64, PASSWORD_PARAMETERS, (error, key) => { if (error) reject(error); else resolve(key) }) }) }
    finally { this.hashing = false }
  }
  async createUser(input: string, password: string): Promise<AccountUser> {
    const username = this.username(input)
    if (!/^[a-z][a-z0-9_.-]{2,63}$/.test(username) || typeof password !== 'string' || Array.from(password).length < 15 || Buffer.byteLength(password) > 1024) {
      throw new LocalProjectError('invalid_account', 'Use a 3–64 character username and a password of at least 15 characters (at most 1024 UTF-8 bytes).', 422)
    }
    return this.files.transaction(async () => {
      if (await this.files.read(['users'], `${username}.json`)) throw new LocalProjectError('account_exists', 'This operator-managed account already exists.', 409)
      if ((await this.files.list(['users'])).filter(name => name.endsWith('.json')).length >= 100) throw new LocalProjectError('account_limit', 'The bounded account limit has been reached.', 409)
      const salt = randomBytes(16), hash = await this.derive(password, salt), user = { id: randomUUID(), username }
      await this.files.write(['users'], `${username}.json`, { ...user, salt: salt.toString('hex'), hash: hash.toString('hex'), version: 1 }, true)
      return user
    })
  }
  private rate(username: string, peer: string) {
    const now = this.now(), keys = [`name:${digest(username)}:${peer}`, `peer:${peer}`]
    for (const [key, values] of this.attempts) { const active = values.filter(time => now - time < 60_000); if (active.length) this.attempts.set(key, active); else this.attempts.delete(key) }
    if (this.attempts.size > 2048 || keys.some((key, i) => (this.attempts.get(key)?.length ?? 0) >= (i ? 30 : 5))) throw new LocalProjectError('rate_limited', 'Too many sign-in attempts. Try again later.', 429)
    for (const key of keys) this.attempts.set(key, [...(this.attempts.get(key) ?? []), now])
  }
  async login(input: string, password: string, peer: string): Promise<AuthenticatedSession> {
    const username = this.username(input)
    if (typeof password !== 'string' || Buffer.byteLength(password) > 1024 || username.length > 64) throw credentials()
    this.rate(username, peer)
    const raw = /^[a-z][a-z0-9_.-]{2,63}$/.test(username) ? await this.files.read(['users'], `${username}.json`) : undefined
    const user = raw as UserRecord | undefined
    if (user && (user.username !== username || !UUID.test(user.id) || user.version !== 1 || !/^[a-f0-9]{32}$/.test(user.salt) || !/^[a-f0-9]{128}$/.test(user.hash))) throw credentials()
    const actual = await this.derive(password, user ? Buffer.from(user.salt, 'hex') : this.dummySalt)
    const expected = user ? Buffer.from(user.hash, 'hex') : Buffer.alloc(64)
    if (!timingSafeEqual(actual, expected) || !user) throw credentials()
    return this.files.transaction(async () => {
      const names = await this.files.list(['sessions'])
      for (const name of names) if (/^[a-f0-9]{64}\.json$/.test(name)) {
        const record = await this.files.read(['sessions'], name) as SessionRecord | undefined
        if (!record || this.expired(record)) await this.files.remove(['sessions'], name)
      }
      if ((await this.files.list(['sessions'])).length >= 1024) throw new LocalProjectError('session_limit', 'The bounded session limit has been reached.', 429)
      const token = randomBytes(32).toString('base64url'), csrfToken = randomBytes(32).toString('base64url'), now = this.now()
      const account = { id: user.id, username: user.username }
      await this.files.write(['sessions'], `${digest(token)}.json`, { user: account, csrfToken, created: now, seen: now }, true)
      return { token, session: { user: account, csrfToken } }
    })
  }
  private expired(record: SessionRecord) { const now = this.now(); return !Number.isFinite(record.created) || !Number.isFinite(record.seen) || now < record.created || now - record.created >= this.absoluteMs || now - record.seen >= this.idleMs }
  async session(token: string): Promise<AuthenticatedSession> {
    if (!TOKEN.test(token)) throw unauthorized()
    return this.files.transaction(async () => {
      const name = `${digest(token)}.json`, record = await this.files.read(['sessions'], name) as SessionRecord | undefined
      if (!record || !record.user || !UUID.test(record.user.id) || typeof record.user.username !== 'string' || !TOKEN.test(record.csrfToken) || this.expired(record)) {
        await this.files.remove(['sessions'], name); throw unauthorized()
      }
      record.seen = this.now()
      await this.files.write(['sessions'], name, record)
      return { token, session: { user: record.user, csrfToken: record.csrfToken } }
    })
  }
  async requireCsrf(token: string, csrf: string) {
    const authenticated = await this.session(token), expected = authenticated.session.csrfToken!
    if (!TOKEN.test(csrf) || !timingSafeEqual(Buffer.from(csrf), Buffer.from(expected))) throw new LocalProjectError('csrf_required', 'Reload your signed-in session before retrying this change.', 403)
    return authenticated
  }
  async logout(token: string) { if (TOKEN.test(token)) await this.files.transaction(() => this.files.remove(['sessions'], `${digest(token)}.json`)) }
}
