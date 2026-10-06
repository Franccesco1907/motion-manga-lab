import { afterEach, expect, it } from 'vitest'
import { configurePrivateSession, expirePrivateSession, getPrivateSession, privateHeaders, resetPrivateSession } from './private-session'
import { backupDraft, recoverDraft } from '../local-projects/draft-editing'
import type { LocalDraft } from '../local-projects/contracts'

afterEach(() => { resetPrivateSession(); localStorage.clear() })

it('refuses private calls before runtime bootstrap and injects only in-memory CSRF for account mutations', () => {
  expect(() => privateHeaders('GET')).toThrow('runtime')
  configurePrivateSession('accounts', { user: { id: 'owner-a', username: 'alice' }, csrfToken: 'csrf-a' })
  expect(privateHeaders('PUT')).toEqual({ 'X-Motion-Manga-Local': '1', 'X-Motion-Manga-CSRF': 'csrf-a' })
  expect(privateHeaders('GET')).toEqual({ 'X-Motion-Manga-Local': '1' })
  expect(localStorage.length).toBe(0)
})

it('expires an account session without falling back to anonymous local editing', () => {
  configurePrivateSession('accounts', { user: { id: 'owner-a', username: 'alice' }, csrfToken: 'csrf-a' })
  expirePrivateSession()
  expect(getPrivateSession().mode).toBe('accounts')
  expect(getPrivateSession().user).toBeNull()
  expect(() => privateHeaders('GET')).toThrow('Sign in')
})

it('removes prior-owner recovery on expiry and never recovers it as another owner', () => {
  const draft: LocalDraft = { schemaVersion: 1, projectId: 'page', sourceVersion: 'source', normalizationVersion: 'working-image-v1', revision: 0, duration: '', fps: '24', regions: [] }
  configurePrivateSession('accounts', { user: { id: 'owner-a', username: 'alice' }, csrfToken: 'csrf-a' })
  backupDraft(draft, 'owner-a')
  expect(recoverDraft(draft, 'owner-b')).toBeUndefined()
  expect(recoverDraft(draft, 'owner-a')?.draft.duration).toBe('')
  expirePrivateSession()
  expect(localStorage.length).toBe(0)
  configurePrivateSession('accounts', { user: { id: 'owner-b', username: 'bob' }, csrfToken: 'csrf-b' })
  expect(recoverDraft(draft, 'owner-b')).toBeUndefined()
})
