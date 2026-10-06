import type { LocalSnapshot } from '../local-projects/contracts'
import { shareClient, type ShareClient } from './share-client'
import type { OwnerShare } from './contracts'
interface SharePanelProps { snapshot: LocalSnapshot; client?: ShareClient }
export function SharePanel({ snapshot, client = shareClient }: SharePanelProps) {
  const [share, setShare] = useState<OwnerShare>()
  const [link, setLink] = useState('')
  const [reviewed, setReviewed] = useState(false)
  const [rightsConfirmed, setRightsConfirmed] = useState(false)
  const [attribution, setAttribution] = useState('')
  const [busy, setBusy] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState('')
  const [status, setStatus] = useState('')
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    void client.list(controller.signal).then(shares => { if (!controller.signal.aborted) { setShare(shares.find(item => item.snapshotId === snapshot.id)); setLoaded(true); setError('') } })
      .catch((failure: unknown) => { if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : 'Guest links unavailable. Retry loading.') })
    return () => controller.abort()
  }, [client, snapshot.id, attempt])
  async function create() {
    if (!reviewed || !rightsConfirmed || busy) return
    setBusy(true)
    setError('')
    try {
      const permission = { rightsConfirmed, attribution }
      const created = share ? await client.replace(snapshot, share, permission) : await client.create(snapshot, permission)
      setShare(created.share)
      setLink(new URL(created.path, location.origin).href)
      setReviewed(false)
      setRightsConfirmed(false)
      setStatus(share ? 'Guest link replaced. Older links are withdrawn.' : 'Guest link created for this reviewed snapshot only.')
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Guest link could not be created. Existing reading is unchanged.') }
    finally { setBusy(false) }
  }
  async function copy() {
    try { await navigator.clipboard.writeText(link); setStatus('Guest link copied.') }
    catch { setError('Copy unavailable. Select and copy the new link from the field below.') }
  }
  async function withdraw() {
    if (!share || busy) return
    setBusy(true)
    setError('')
    try { await client.withdraw(share); setShare(undefined); setLink(''); setReviewed(false); setRightsConfirmed(false); setStatus('Guest link withdrawn. Future guest requests are blocked.') }
    catch (failure) { setError(failure instanceof Error ? failure.message : 'Guest withdrawal failed. Retry explicitly.') }
    finally { setBusy(false) }
  }
  return <section aria-label="Unlisted guest reading"><h3>Guest reading links</h3>
    <p>Anyone with an unlisted link can read the reviewed derived pages, not your originals or editable drafts. Copies already downloaded cannot be recalled. Sharing does not grant content rights.</p>
    {error && <p role="alert">{error}</p>}
    <p role="status">{status}</p>
    <button disabled={busy} onClick={() => { setLoaded(false); setAttempt(value => value + 1) }}>Reload guest links</button>
    {!loaded && !error && <p role="status">Loading guest links…</p>}
    {loaded && !share && <p>No active guest link for this snapshot.</p>}
    {share && <><p>Reviewed reading revision {share.snapshotRevision} has an active guest link.</p>{!link && <p>The original link is not stored and cannot be reconstructed. Replace it to create a new link; the previous one will be withdrawn.</p>}</>}
    <label><input type="checkbox" checked={reviewed} disabled={busy} onChange={event => setReviewed(event.target.checked)} />I approve unlisted guest reading of this reviewed snapshot.</label>
    <label><input type="checkbox" checked={rightsConfirmed} disabled={busy} onChange={event => setRightsConfirmed(event.target.checked)} />I confirm I have permission to share this content.</label>
    <p>Your acknowledgment is recorded. It is not independent legal verification.</p>
    <label>Attribution (optional)<input value={attribution} disabled={busy} maxLength={2000} onChange={event => setAttribution(event.target.value)} /></label>
    <button disabled={!loaded || !reviewed || !rightsConfirmed || busy} onClick={() => void create()}>{share ? 'Replace guest link' : 'Share reviewed snapshot'}</button>
    {share && <button disabled={busy} onClick={() => void withdraw()}>Withdraw guest link</button>}
    {link && <><label>New guest link<input readOnly value={link} onFocus={event => event.target.select()} /></label><button onClick={() => void copy()}>Copy new guest link</button><p>Save this link now. It is shown only after creation or replacement.</p></>}
  </section>
}
import { useEffect, useState } from 'react'
