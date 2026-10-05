import { useEffect, useRef, useState } from 'react'
import { LOCAL_EASING, LOCAL_END, LOCAL_MOTION, LOCAL_ROLE, type LocalDraft, type LocalProject, type LocalRenderArtifact, type LocalRenderJob, type RawMotion, type RawRegion } from './contracts'
import { authoringClient, type AuthoringClient } from './authoring-client'
import { backupDraft, clearBackup, newRegion, recoverDraft, updateRegion, SELECTION_TOOL, finiteRaw, type SelectionTool } from './draft-editing'
import { SelectionSurface } from './SelectionSurface'
import { LocalPlayback } from './LocalPlayback'
import { AssistancePanel } from './AssistancePanel'

interface PageEditorProps { project: LocalProject; originalUrl: string; client?: AuthoringClient }

const MOTION_LABELS = { anchorX: 'Pivot X', anchorY: 'Pivot Y', dx: 'Horizontal movement', dy: 'Vertical movement', angle: 'Rotation angle', start: 'Movement start', duration: 'Movement duration', cycles: 'Finite repetitions', period: 'Gesture period (optional)', pause: 'Gesture pause (optional)', wristInfluence: 'Wrist influence (optional)' } as const
const GEOMETRY_LABELS = { x: 'Selection X', y: 'Selection Y', width: 'Selection width', height: 'Selection height' } as const
const message = (error: unknown) => error instanceof Error ? error.message : 'The local operation failed. Your draft is kept; retry explicitly.'

export function PageEditor({ project, originalUrl, client = authoringClient }: PageEditorProps) {
  const [draft, setDraft] = useState<LocalDraft>()
  const [selectedId, setSelectedId] = useState('')
  const [workingUrl, setWorkingUrl] = useState('')
  const [maskUrl, setMaskUrl] = useState('')
  const [maskSourceId, setMaskSourceId] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [error, setError] = useState('')
  const [status, setStatus] = useState('')
  const [recoveryNotice, setRecoveryNotice] = useState('')
  const [tool, setTool] = useState<SelectionTool>(SELECTION_TOOL.RECTANGLE)
  const [radius, setRadius] = useState('0.02')
  const [brushX, setBrushX] = useState('0.5')
  const [brushY, setBrushY] = useState('0.5')
  const [job, setJob] = useState<LocalRenderJob>()
  const [artifact, setArtifact] = useState<LocalRenderArtifact | null>(null)
  const alive = useRef(false)
  const currentDraft = useRef<LocalDraft | undefined>(undefined)
  const editGeneration = useRef(0)
  const loadController = useRef<AbortController | undefined>(undefined)
  const jobController = useRef<AbortController | undefined>(undefined)
  const jobSequence = useRef(0)
  const urls = useRef(new Set<string>())
  const workingOwned = useRef('')
  const [savedRevision, setSavedRevision] = useState(0)
  const selected = draft?.regions.find(region => region.id === selectedId)
  const sourceVersion = draft?.sourceVersion
  const jobId = job?.id, jobStatus = job?.status

  function own(blob: Blob) { const url = URL.createObjectURL(blob); urls.current.add(url); return url }

  function load(discard = false) {
    const controller = new AbortController()
    loadController.current?.abort()
    loadController.current = controller
    return Promise.all([client.draft(project.id, controller.signal), client.working(project.id, controller.signal), client.latest(project.id, controller.signal)]).then(([saved, working, latest]) => {
      if (!alive.current || controller.signal.aborted) return
      let recovered
      try { if (discard) clearBackup(project.id); else recovered = recoverDraft(saved) }
      catch { setRecoveryNotice('Browser recovery is unavailable. Save drafts to the local service before leaving this page.') }
      setSavedRevision(saved.revision)
      setDraft(recovered?.draft ?? saved)
      currentDraft.current = recovered?.draft ?? saved
      setDirty(!!recovered)
      if (recovered) setRecoveryNotice(recovered.conflict ? 'Recovered draft conflicts with a newer saved revision. Keep these edits or explicitly discard and reload.' : 'Recovered unsaved draft. Save it when ready.')
      else if (discard) setRecoveryNotice('')
      setSelectedId((recovered?.draft ?? saved).regions[0]?.id ?? '')
      if (workingOwned.current && urls.current.delete(workingOwned.current)) URL.revokeObjectURL(workingOwned.current)
      workingOwned.current = own(working)
      setWorkingUrl(workingOwned.current)
      setArtifact(latest)
      setLoading(false)
      setError('')
    }).catch((failure: unknown) => {
      if (alive.current && !controller.signal.aborted) { setError(message(failure)); setLoading(false) }
    })
  }

  useEffect(() => {
    alive.current = true
    void load()
    const owned = urls.current
    return () => { alive.current = false; loadController.current?.abort(); jobController.current?.abort(); for (const url of owned) URL.revokeObjectURL(url); owned.clear() }
    // Project boundaries remount this editor; external client synchronization is intentional.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.id, client])

  useEffect(() => {
    if (!selected?.maskId) return
    const controller = new AbortController()
    const owned = urls.current
    let url = ''
    if (!sourceVersion) return
    void client.mask(project.id, selected.maskId, sourceVersion, controller.signal).then(blob => {
      if (!alive.current || controller.signal.aborted) return
      url = own(blob)
      setMaskUrl(url)
      setMaskSourceId(selected.maskId!)
    }).catch((failure: unknown) => { if (!controller.signal.aborted && alive.current) setError(`Mask preview unavailable: ${message(failure)}`) })
    return () => { controller.abort(); if (url && owned.delete(url)) URL.revokeObjectURL(url) }
  }, [client, project.id, selected?.maskId, sourceVersion])

  function edit(next: LocalDraft) {
    ++editGeneration.current
    currentDraft.current = next
    setDraft(next)
    setDirty(true)
    setStatus('Unsaved changes.')
    try { backupDraft(next) }
    catch { setRecoveryNotice('Browser draft recovery could not be written. Keep this page open until Save draft succeeds.') }
  }
  function editRegion(update: (region: RawRegion) => RawRegion) {
    if (draft && selected) edit(updateRegion(draft, selected.id, update))
  }
  function numericMotion(key: keyof typeof MOTION_LABELS, value: string) { editRegion(region => ({ ...region, motion: { ...region.motion, [key]: value } })) }
  function selectionField(key: keyof typeof GEOMETRY_LABELS, value: string) { editRegion(region => ({ ...region, maskId: undefined, selection: { ...region.selection, [key]: value } })) }

  async function save(): Promise<LocalDraft | undefined> {
    if (!draft || saving) return
    setSaving(true)
    setError('')
    const current = draft
    const generation = editGeneration.current
    try {
      const saved = await client.saveDraft(current)
      if (!alive.current) return
      setSavedRevision(saved.revision)
      if (generation === editGeneration.current) {
        currentDraft.current = saved
        setDraft(saved)
        setDirty(false)
        setStatus('Draft saved.')
        try { clearBackup(project.id); setRecoveryNotice('') } catch { setRecoveryNotice('Draft saved, but browser recovery could not be cleared.') }
      } else {
        const retained = { ...currentDraft.current!, revision: saved.revision }
        currentDraft.current = retained
        setDraft(retained)
        setDirty(true)
        setStatus('Prior draft saved; newer edits remain unsaved.')
        try { backupDraft(retained) } catch { setRecoveryNotice('Recovery unavailable. Save newer edits before leaving.') }
      }
      return saved
    } catch (failure) {
      if (alive.current) setError(message(failure))
      return undefined
    } finally { if (alive.current) setSaving(false) }
  }

  function observeJob(next: LocalRenderJob) {
    setJob(next)
    if (next.status === 'completed' && next.artifact) { setArtifact(next.artifact); setStatus('Render completed. Review it against the static original.') }
    if (next.status === 'failed') setError(next.error?.message ?? 'Render failed. Draft and selections are kept. Retry Save & render explicitly.')
    if (next.status === 'cancelled') setStatus('Render cancelled. Draft and selections are kept.')
  }
  useEffect(() => {
    if (!jobId || (jobStatus !== 'queued' && jobStatus !== 'running')) return
    const id = jobId, sequence = jobSequence.current
    let pending = false
    let request: AbortController | undefined
    const timer = window.setInterval(() => {
      if (pending) return
      pending = true
      request = new AbortController()
      void client.job(project.id, id, request.signal).then(next => {
        if (alive.current && !request?.signal.aborted && sequence === jobSequence.current) observeJob(next)
      }).catch((failure: unknown) => { if (alive.current && !request?.signal.aborted && sequence === jobSequence.current) setError(message(failure)) })
        .finally(() => { pending = false })
    }, 1000)
    return () => { window.clearInterval(timer); request?.abort() }
  }, [jobId, jobStatus, project.id, client])
  async function refreshJob() {
    if (!job) return
    const sequence = jobSequence.current
    const controller = new AbortController()
    jobController.current?.abort()
    jobController.current = controller
    try {
      const next = await client.job(project.id, job.id, controller.signal)
      if (alive.current && !controller.signal.aborted && sequence === jobSequence.current) observeJob(next)
    } catch (failure) { if (alive.current && !controller.signal.aborted) setError(message(failure)) }
  }
  async function render() {
    const saved = await save()
    if (!saved) return
    const sequence = ++jobSequence.current
    try {
      const next = await client.render(saved)
      if (alive.current && sequence === jobSequence.current) observeJob(next)
    } catch (failure) { if (alive.current && sequence === jobSequence.current) setError(message(failure)) }
  }
  async function cancel() {
    if (!job) return
    ++jobSequence.current
    jobController.current?.abort()
    try { const next = await client.cancel(project.id, job.id); if (alive.current) observeJob(next) }
    catch (failure) { if (alive.current) setError(message(failure)) }
  }
  function brushPoint() {
    if (!selected || tool === SELECTION_TOOL.RECTANGLE) return
    const x = finiteRaw(brushX), y = finiteRaw(brushY), r = finiteRaw(radius)
    if (x === undefined || y === undefined || r === undefined || x < 0 || x > 1 || y < 0 || y > 1 || r <= 0 || r > 1) { setError('Brush coordinates and radius must be finite image fractions. Incomplete fields are kept.'); return }
    editRegion(region => ({ ...region, selection: { ...region.selection, strokes: [...region.selection.strokes, { mode: tool, radius, points: [{ x, y }] }] } }))
  }

  const moving = selected && selected.motion.type !== 'static'
  const motionKeys: (keyof typeof MOTION_LABELS)[] = selected?.motion.type === 'translate' ? ['dx', 'dy'] : selected?.motion.type === 'rotate' ? ['anchorX', 'anchorY', 'angle', 'cycles', 'period', 'pause', 'wristInfluence'] : []
  const activeJob = job?.status === 'queued' || job?.status === 'running'

  return <section className="page-editor" aria-labelledby="editor-title">
    <h2 id="editor-title">Page editor · {project.name}</h2>
    <p>Working-image fractions: 0 is the left/top edge, 1 is the right/bottom edge. Selection size is separate from movement. Original bytes stay unchanged.</p>
    {loading && <p role="status">Loading editable draft…</p>}
    {error && <p role="alert">{error}</p>}
    {recoveryNotice && <p>{recoveryNotice}</p>}
    <p role="status">{saving ? 'Saving complete draft…' : status}</p>
    <div className="local-toolbar">
      <button onClick={() => void load()} disabled={loading || saving}>Retry loading editor</button>
      <button onClick={() => void load(true)} disabled={saving}>Discard local edits & reload</button>
      {draft && <><button onClick={() => void save()} disabled={saving}>Save draft</button><button onClick={() => void render()} disabled={saving || activeJob}>Save & render</button></>}
    </div>
    {draft && <>
      <p>{dirty ? 'Unsaved draft' : `Saved revision ${draft.revision}`} · raw incomplete fields can be saved; rendering requires valid values.</p>
      <fieldset disabled={saving}>
        <legend>Scene timing</legend>
        <label>Scene duration<input value={draft.duration} onChange={event => edit({ ...draft, duration: event.target.value })} inputMode="decimal" /></label>
        <label>Frames per second<input value={draft.fps} onChange={event => edit({ ...draft, fps: event.target.value })} inputMode="numeric" /></label>
      </fieldset>
      <div className="local-toolbar"><button disabled={saving} onClick={() => { const region = newRegion(); edit({ ...draft, regions: [...draft.regions, region] }); setSelectedId(region.id) }}>Add part</button>
        {selected && <button disabled={saving} onClick={() => { edit({ ...draft, regions: draft.regions.filter(region => region.id !== selected.id) }); setSelectedId(draft.regions.find(region => region.id !== selected.id)?.id ?? '') }}>Remove selected part</button>}
      </div>
      {!!draft.regions.length && <label>Selected part<select value={selectedId} onChange={event => setSelectedId(event.target.value)}>{draft.regions.map((region, index) => <option value={region.id} key={region.id}>{index + 1}. {region.label}</option>)}</select></label>}
      {selected && <fieldset disabled={saving}><legend>Selected part settings</legend>
        <label>Part label<input value={selected.label} onChange={event => editRegion(region => ({ ...region, label: event.target.value }))} /></label>
        <label>Layer role<select value={selected.role} onChange={event => editRegion(region => ({ ...region, role: event.target.value as RawRegion['role'] }))}>{Object.values(LOCAL_ROLE).map(role => <option key={role}>{role}</option>)}</select></label>
        <p>{selected.maskId ? 'Model-assisted binary mask. Inspect and correct it before rendering.' : 'Rectangle mask: a nonsemantic fallback, not a detected head or hand. Add/erase brush strokes refine the actual mask.'}</p>
        <label>Selection tool<select value={tool} onChange={event => setTool(event.target.value as SelectionTool)}>{Object.values(SELECTION_TOOL).map(value => <option key={value}>{value}</option>)}</select></label>
        {workingUrl && <SelectionSurface key={selected.id} region={selected} imageUrl={workingUrl} maskUrl={maskSourceId === selected.maskId ? maskUrl : undefined} tool={tool} radius={radius} onChange={region => editRegion(() => region)} />}
        <div className="editor-fields">{Object.entries(GEOMETRY_LABELS).map(([key, label]) => <label key={key}>{label}<input inputMode="decimal" value={selected.selection[key as keyof typeof GEOMETRY_LABELS]} onChange={event => selectionField(key as keyof typeof GEOMETRY_LABELS, event.target.value)} /></label>)}</div>
        <div className="editor-fields"><label>Brush radius<input inputMode="decimal" value={radius} onChange={event => setRadius(event.target.value)} /></label>
          <label>Brush point X<input inputMode="decimal" value={brushX} onChange={event => setBrushX(event.target.value)} /></label><label>Brush point Y<input inputMode="decimal" value={brushY} onChange={event => setBrushY(event.target.value)} /></label></div>
        <button onClick={brushPoint} disabled={tool === SELECTION_TOOL.RECTANGLE}>Apply brush point</button>
        <button onClick={() => editRegion(region => ({ ...region, selection: { ...region.selection, strokes: region.selection.strokes.slice(0, -1) } }))} disabled={!selected.selection.strokes.length}>Undo last brush stroke</button>
        <label>Movement<select value={selected.motion.type} onChange={event => editRegion(region => ({ ...region, motion: { ...region.motion, type: event.target.value as RawMotion['type'] } }))}>{Object.values(LOCAL_MOTION).map(type => <option key={type}>{type}</option>)}</select></label>
        {moving && <div className="editor-fields">{[...motionKeys, 'start', 'duration'].map(key => <label key={key}>{MOTION_LABELS[key as keyof typeof MOTION_LABELS]}<input inputMode="decimal" value={selected.motion[key as keyof typeof MOTION_LABELS]} onChange={event => numericMotion(key as keyof typeof MOTION_LABELS, event.target.value)} /></label>)}</div>}
        {selected.motion.type === 'rotate' && <p>Finite repetitions require a gesture period. With no period, rotation is one action; a periodic gesture follows the renderer's fixed sine curve.</p>}
        {(selected.motion.type === 'translate' || (selected.motion.type === 'rotate' && !selected.motion.period.trim())) && <><label>Easing<select value={selected.motion.easing} onChange={event => editRegion(region => ({ ...region, motion: { ...region.motion, easing: event.target.value as RawMotion['easing'] } }))}>{Object.values(LOCAL_EASING).map(value => <option key={value}>{value}</option>)}</select></label>
          <label>Final state<select value={selected.motion.endState} onChange={event => editRegion(region => ({ ...region, motion: { ...region.motion, endState: event.target.value as RawMotion['endState'] } }))}>{Object.values(LOCAL_END).map(value => <option key={value}>{value}</option>)}</select></label></>}
      </fieldset>}
      {!selected && <p>Add a part to draw a region and direct its movement.</p>}
      <AssistancePanel draft={draft} selectedId={selectedId} client={client} prepare={save} apply={next => { edit(next); if (!selectedId) setSelectedId(next.regions[0]?.id ?? '') }} />
    </>}
    {job && <section aria-label="Render job"><p role="status">Render {job.status} · input revision {job.draftRevision}</p>{activeJob && <><button onClick={() => void refreshJob()}>Refresh render status</button><button onClick={() => void cancel()}>Cancel render</button></>}</section>}
    {artifact && <section aria-label="Private page reader"><h3>Private page reader</h3>{(dirty || artifact.draftRevision !== savedRevision) && <p>This render is older than the current draft. Save & render again before creating a reading snapshot.</p>}
      <LocalPlayback key={artifact.id} name={project.name} originalUrl={originalUrl} loadVideo={signal => client.video(artifact, signal)} />
    </section>}
  </section>
}
