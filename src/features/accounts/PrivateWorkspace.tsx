import { useEffect, useState, useSyncExternalStore, type ReactNode } from 'react'
import { accountClient, type AccountClient } from './account-client'
import { configurePrivateSession, expirePrivateSession, getPrivateSession, subscribePrivateSession } from './private-session'
import { LoginPanel } from './LoginPanel'
import { LocalProjects } from '../local-projects/LocalProjects'
interface PrivateWorkspaceProps { client?: AccountClient; workspace?: (ownerId: string) => ReactNode }
export function PrivateWorkspace({ client = accountClient, workspace }: PrivateWorkspaceProps) {
  const session = useSyncExternalStore(subscribePrivateSession, getPrivateSession)
  const [ready, setReady] = useState(false)
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)
  const [signingOut, setSigningOut] = useState(false)
  useEffect(() => {
    const controller = new AbortController()
    void client.runtime(controller.signal).then(async runtime => {
      const verified = runtime.mode === 'accounts' ? await client.session(controller.signal) : undefined
      if (controller.signal.aborted) return
      configurePrivateSession(runtime.mode, verified)
      setReady(true)
      setError('')
    }).catch((failure: unknown) => { if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : 'Workspace connection failed. Private editing is unavailable until the server is verified.') })
    return () => controller.abort()
  }, [client, attempt])

  async function logout() {
    if (!session.csrfToken) return
    setSigningOut(true)
    try { await client.logout(session.csrfToken); expirePrivateSession('Signed out. Private workspace and recovery drafts were cleared.') }
    catch { expirePrivateSession('Sign out could not reach the server. This workspace is closed; close this browser session or sign in again.') }
    finally { setSigningOut(false) }
  }
  if (!ready) return <main className="local-projects"><h1>Connect workspace</h1>{error ? <><p role="alert">{error}</p><button onClick={() => { setError(''); setAttempt(value => value + 1) }}>Retry workspace connection</button></> : <p role="status">Verifying application service…</p>}</main>
  if (session.mode === 'accounts' && !session.user) return <LoginPanel client={client} notice={session.notice} signedIn={verified => configurePrivateSession('accounts', verified)} />
  const owner = session.mode === 'accounts' ? session.user!.id : 'local'
  return <div key={`${owner}:${session.epoch}`}>
    {session.mode === 'accounts' && <header className="workspace-navigation"><p>Signed in as {session.user!.username}</p><button disabled={signingOut} onClick={() => void logout()}>{signingOut ? 'Signing out…' : 'Sign out'}</button></header>}
    {workspace ? workspace(owner) : <LocalProjects ownerId={owner} sharingEnabled={session.mode === 'accounts'} />}
  </div>
}
