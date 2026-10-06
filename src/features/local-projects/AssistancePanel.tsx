import { useEffect, useRef, useState } from 'react'
import type { LocalAssistanceCapabilities, LocalAssistanceJob, LocalAssistanceMode, LocalDraft } from './contracts'
import type { AuthoringClient } from './authoring-client'
interface AssistancePanelProps { draft: LocalDraft; selectedId: string; client: AuthoringClient; prepare: () => Promise<LocalDraft | undefined>; apply: (draft: LocalDraft) => void }
export function AssistancePanel({ draft, selectedId, client, prepare, apply }: AssistancePanelProps) {
  const [capabilities, setCapabilities] = useState<LocalAssistanceCapabilities>()
  const [job, setJob] = useState<LocalAssistanceJob>()
  const [error, setError] = useState('')
  const [starting, setStarting] = useState(false)
  const [signature, setSignature] = useState('')
  const [applied, setApplied] = useState(false)
  const alive = useRef(false)
  const sequence = useRef(0)
  const controller = useRef<AbortController | undefined>(undefined)
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    alive.current = true
    const request = new AbortController()
    void client.capabilities(draft.projectId, request.signal).then(value => { if (!request.signal.aborted) { setCapabilities(value); setError('') } })
      .catch((failure: unknown) => { if (!request.signal.aborted) setError(failure instanceof Error ? failure.message : 'Assistance unavailable. Manual masks remain available.') })
    return () => { alive.current = false; request.abort(); controller.current?.abort() }
  }, [client, draft.projectId, attempt])
  const busy = starting || job?.status === 'queued' || job?.status === 'running'
  const stale = signature !== JSON.stringify(draft)

  async function start(mode: LocalAssistanceMode) {
    setStarting(true)
    setError('')
    setApplied(false)
    const requestId = ++sequence.current
    const saved = await prepare()
    if (!saved || !alive.current) { setStarting(false); return }
    setSignature(JSON.stringify(saved))
    try {
      const next = await client.assist(saved, mode, mode === 'refine' ? selectedId : undefined)
      if (alive.current && sequence.current === requestId) setJob(next)
    } catch (failure) { if (alive.current) setError(failure instanceof Error ? failure.message : 'Model job failed; your draft is kept.') }
    finally { if (alive.current) setStarting(false) }
  }
  async function refresh() {
    if (!job) return
    const requestId = sequence.current
    const request = new AbortController()
    controller.current?.abort()
    controller.current = request
    try { const next = await client.assistanceJob(draft.projectId, job.id, request.signal); if (alive.current && !request.signal.aborted && requestId === sequence.current) setJob(next) }
    catch (failure) { if (alive.current && !request.signal.aborted) setError(failure instanceof Error ? failure.message : 'Model status unavailable. Retry explicitly.') }
  }
  async function cancel() {
    if (!job) return
    ++sequence.current
    controller.current?.abort()
    try { const next = await client.cancelAssistance(draft.projectId, job.id); if (alive.current) setJob(next) }
    catch (failure) { if (alive.current) setError(failure instanceof Error ? failure.message : 'Cancellation failed. Check model status explicitly.') }
  }
  function applyResult() {
    if (!job || stale || applied) return
    if (job.regions) apply({ ...draft, regions: [...draft.regions, ...job.regions.filter(region => !draft.regions.some(current => current.id === region.id))] })
    if (job.maskId && job.regionId) apply({ ...draft, regions: draft.regions.map(region => region.id === job.regionId ? { ...region, maskId: job.maskId, selection: { ...region.selection, strokes: [] } } : region) })
    setApplied(true)
  }
  return <section className="local-assistance" aria-label="Offline assistance"><h3>Offline assistance</h3>
    <p>Optional local models suggest regions or refine a selected cutout. They do not direct movement. Manual selection and brushes work without models.</p>
    {error && <p role="alert">{error}</p>}
    <button onClick={() => setAttempt(value => value + 1)}>Recheck model availability</button>
    {!capabilities && !error && <p role="status">Checking offline model availability…</p>}
    {capabilities && <>
      <p>{capabilities.suggestRegions.reason}</p><button disabled={!capabilities.suggestRegions.available || busy} onClick={() => void start('suggest')}>Suggest regions</button>
      <p>{capabilities.refineRegion.reason}</p><button disabled={!capabilities.refineRegion.available || !selectedId || busy} onClick={() => void start('refine')}>Refine selected region</button>
    </>}
    {job && <><p role="status">Model job {job.status} · input revision {job.draftRevision}</p>
      {busy && <><button onClick={() => void refresh()}>Refresh model status</button><button onClick={() => void cancel()}>Cancel model job</button></>}
      {job.status === 'failed' && <p role="alert">{job.error?.message ?? 'Model job failed. Your saved draft and masks are unchanged.'}</p>}
      {job.status === 'completed' && <><p>Assistance requires your review. {job.regions ? `${job.regions.length} proposed regions.` : 'A new binary cutout is available.'}</p>
        {stale && <p>These results are outdated after your edits. Save and request assistance again; newer edits are never overwritten.</p>}
        <button disabled={stale || applied} onClick={applyResult}>{job.regions ? 'Apply suggested regions' : 'Apply refined mask'}</button>
      </>}
    </>}
  </section>
}
