import { useEffect, useRef, useState, type FormEvent } from 'react'
import type { AccountSession } from './contracts'
import type { AccountClient } from './account-client'

interface LoginPanelProps { client: AccountClient; signedIn: (session: AccountSession) => void; notice: string }
export function LoginPanel({ client, signedIn, notice }: LoginPanelProps) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const alive = useRef(true)
  useEffect(() => { alive.current = true; return () => { alive.current = false } }, [])
  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!username.trim() || !password || busy) return
    setBusy(true)
    setError('')
    try { const session = await client.login(username, password); if (alive.current) signedIn(session) }
    catch (failure) { if (alive.current) setError(failure instanceof Error ? failure.message : 'Sign in failed. Retry explicitly.') }
    finally { if (alive.current) { setPassword(''); setBusy(false) } }
  }
  return <main className="local-projects"><h1>Sign in</h1>
    <p>This server uses operator-created accounts. Ask the operator for access; there is no public registration.</p>
    {notice && <p role="status">{notice}</p>}
    {error && <p role="alert">{error}</p>}
    <form onSubmit={event => void login(event)} aria-busy={busy}>
      <label>Username<input autoComplete="username" value={username} onChange={event => setUsername(event.target.value)} disabled={busy} required /></label>
      <label>Password<input type="password" autoComplete="current-password" value={password} onChange={event => setPassword(event.target.value)} disabled={busy} required /></label>
      <button disabled={busy || !username.trim() || !password}>{busy ? 'Signing in…' : 'Sign in'}</button>
    </form>
  </main>
}
