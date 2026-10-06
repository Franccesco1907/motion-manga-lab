import { useEffect, useState } from 'react'
import { guestClient, type GuestClient } from './share-client'
import type { SharedPage, SharedReading } from './contracts'
import { LocalPlayback } from '../local-projects/LocalPlayback'
interface GuestReadingProps { token: string; client?: GuestClient }
function GuestPage({ token, page, client }: { token: string; page: SharedPage; client: GuestClient }) {
  const [url, setUrl] = useState('')
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    let owned = ''
    void client.poster(token, page.index, controller.signal).then(blob => {
      if (controller.signal.aborted) return
      owned = URL.createObjectURL(blob)
      setUrl(owned)
      setError('')
    }).catch((failure: unknown) => { if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : 'Reviewed reading page unavailable. Retry explicitly.') })
    return () => { controller.abort(); if (owned) URL.revokeObjectURL(owned) }
  }, [token, page.index, client, attempt])
  return <section aria-label="Reviewed guest page"><h2>{page.name}</h2>
    {error && <><p role="alert">{error}</p><button onClick={() => { setUrl(''); setError(''); setAttempt(value => value + 1) }}>Retry reviewed page</button></>}
    {!url && !error && <p role="status">Loading reviewed page…</p>}
    {url && <LocalPlayback staticLabel="Reviewed static page" name={page.name} originalUrl={url} loadVideo={signal => client.video(token, page.index, signal)} />}
  </section>
}

export function GuestReading({ token, client = guestClient }: GuestReadingProps) {
  const [manifest, setManifest] = useState<SharedReading>()
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)
  const [index, setIndex] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    void client.manifest(token, controller.signal).then(reading => { if (!controller.signal.aborted) { setManifest(reading); setError('') } })
      .catch((failure: unknown) => { if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : 'Guest reading unavailable. The link may be withdrawn.') })
    return () => controller.abort()
  }, [token, client, attempt])
  const page = manifest?.pages[index]
  return <main className="local-projects guest-reading"><h1>{manifest?.name ?? 'Guest reading'}</h1>
    <p>Unlisted, read-only access to reviewed derived pages. This view cannot edit projects or access originals, masks or account workspaces.</p>
    {manifest?.attribution && <section aria-label="Content attribution"><h2>Attribution</h2><p>{manifest.attribution}</p></section>}
    <button onClick={() => { setManifest(undefined); setIndex(0); setError(''); setAttempt(value => value + 1) }}>Reload shared reading</button>
    {error && <p role="alert">{error}</p>}
    {!manifest && !error && <p role="status">Loading shared reading…</p>}
    {manifest && !manifest.pages.length && <p>No readable pages in this shared version.</p>}
    {manifest && page && <>
      <nav className="local-toolbar" aria-label="Guest reading pages"><button disabled={index === 0} onClick={() => setIndex(value => value - 1)}>Previous page</button><p role="status">Page {index + 1} of {manifest.pages.length}</p><button disabled={index === manifest.pages.length - 1} onClick={() => setIndex(value => value + 1)}>Next page</button></nav>
      <GuestPage key={`${token}:${manifest.revision}:${index}:${attempt}`} token={token} page={page} client={client} />
    </>}
  </main>
}
