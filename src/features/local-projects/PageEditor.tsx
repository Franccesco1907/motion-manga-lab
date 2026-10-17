import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { LOCAL_AFFINE_MOTION, LOCAL_EASING, LOCAL_END, LOCAL_ROLE, type LocalDraft, type LocalProject, type LocalRenderArtifact, type LocalRenderJob, type RawMotion, type RawRegion } from './contracts'
import { authoringClient, type AuthoringClient } from './authoring-client'
import { backupDraft, clearBackup, newRegion, recoverDraft, updateRegion, selectMotion, SELECTION_TOOL, finiteRaw, type SelectionTool } from './draft-editing'
import { SelectionSurface, type SelectionInteraction } from './SelectionSurface'
import { LocalPlayback } from './LocalPlayback'
import { AssistancePanel } from './AssistancePanel'
import { createHistory, recordEdit, restoreContent, undoContent, redoContent } from './editor-history'
import { applyPreset, currentPreset, EDITOR_PRESET, PRESET_LABELS, isRepeatMovementEnabled, setRepeatMovement, setPresetSpeed, type EditorPreset } from './editor-presets'
import { selectionBounds, SURFACE_INTERACTION } from './selection-geometry'
import './PageEditor.css'

interface PageEditorProps { project: LocalProject; originalUrl: string; client?: AuthoringClient; ownerId?: string }

const MOTION_LABELS = { anchorX: 'Pivot X', anchorY: 'Pivot Y', dx: 'Horizontal movement', dy: 'Vertical movement', angle: 'Rotation angle', start: 'Movement start', duration: 'Movement duration', cycles: 'Finite repetitions', period: 'Gesture period (optional)', pause: 'Gesture pause (optional)', wristInfluence: 'Wrist influence (optional)', scale: 'Uniform drawing scale', scaleX: 'Drawing scale X', scaleY: 'Drawing scale Y' } as const
const GEOMETRY_LABELS = { x: 'Selection X', y: 'Selection Y', width: 'Selection width', height: 'Selection height' } as const
const EDITOR_MODE = { ORIGINAL: 'Original', EDIT: 'Edit', PREVIEW: 'Preview' } as const
type EditorMode = (typeof EDITOR_MODE)[keyof typeof EDITOR_MODE]
interface PlaybackIntent { id: string; artifactId: string }
interface PreviewIntent { id: string; generation: number; sourceVersion: string; revision?: number; allowPlay: boolean; before: LocalRenderArtifact | null }
interface WorkingSize { width: number; height: number }
const message = (error: unknown) => error instanceof Error ? error.message : 'The local operation failed. Your draft is kept; retry explicitly.'

export function PageEditor(props: PageEditorProps) {
  return <PageEditorSession key={`${props.project.id}:${props.ownerId ?? 'local'}`} {...props} />
}

function PageEditorSession({ project, originalUrl, client = authoringClient, ownerId = 'local' }: PageEditorProps) {
  const [mode, setMode] = useState<EditorMode>(EDITOR_MODE.EDIT)
  const [advanced, setAdvanced] = useState(false)
  const [inspectorOpen, setInspectorOpen] = useState(true)
  const [selectionOpen, setSelectionOpen] = useState(false)
  const [workingSize, setWorkingSize] = useState<WorkingSize>()
  const [interaction, setInteraction] = useState<SelectionInteraction>(SURFACE_INTERACTION.SELECT)
  const [history, setHistory] = useState(createHistory)
  const session = useRef(Symbol())
  const [draft, setDraft] = useState<LocalDraft>()
  const [selectedId, setSelectedId] = useState('')
  const [workingUrl, setWorkingUrl] = useState('')
  const [maskUrl, setMaskUrl] = useState('')
  const [maskRequest, setMaskRequest] = useState(0)
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
  const [beforeArtifact, setBeforeArtifact] = useState<LocalRenderArtifact | null>(null)
  const [showBefore, setShowBefore] = useState(false)
  const [preparing, setPreparing] = useState(false)
  const [autoPlayRequest, setAutoPlayRequest] = useState<PlaybackIntent>()
  const previewIntent = useRef<PreviewIntent | undefined>(undefined)
  const previewSequence = useRef(0)
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

  function invalidatePreview() { if (previewIntent.current) previewIntent.current.allowPlay = false; setAutoPlayRequest(undefined) }
  function changeMode(next: EditorMode) { invalidatePreview(); setMode(next) }

  function reload(discard = false) {
    invalidatePreview()
    setPreparing(false)
    setBeforeArtifact(null)
    setShowBefore(false)
    setLoading(true)
    void load(discard)
  }

  function load(discard = false) {
    previewIntent.current = undefined
    session.current = Symbol()
    ++jobSequence.current
    const controller = new AbortController()
    loadController.current?.abort()
    loadController.current = controller
    return Promise.all([client.draft(project.id, controller.signal), client.working(project.id, controller.signal), client.latest(project.id, controller.signal)]).then(([saved, working, latest]) => {
      if (!alive.current || controller.signal.aborted) return
      setAutoPlayRequest(undefined)
      setPreparing(false)
      setBeforeArtifact(null)
      setShowBefore(false)
      setSelectionOpen(false)
      let recovered
      try { if (discard) clearBackup(project.id, ownerId); else recovered = recoverDraft(saved, ownerId) }
      catch { setRecoveryNotice('Browser recovery is unavailable. Save drafts to the local service before leaving this page.') }
      setHistory(createHistory())
      if (currentDraft.current?.sourceVersion !== saved.sourceVersion) { ++jobSequence.current; setJob(undefined); setMode(EDITOR_MODE.EDIT) }
      setWorkingSize(undefined)
      setStatus('')
      setMaskUrl('')
      setMaskSourceId('')
      setMaskRequest(value => value + 1)
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
    session.current = Symbol()
    ++jobSequence.current
    void load()
    const owned = urls.current
    return () => { previewIntent.current = undefined; alive.current = false; session.current = Symbol(); loadController.current?.abort(); jobController.current?.abort(); for (const url of owned) URL.revokeObjectURL(url); owned.clear() }
    // Project boundaries remount this editor; external client synchronization is intentional.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.id, client, ownerId])

  useEffect(() => {
    let media: MediaQueryList | undefined
    try { media = window.matchMedia('(prefers-reduced-motion: reduce)') } catch { /* Playback remains static without preference support. */ }
    const changed = (event: MediaQueryListEvent) => { if (event.matches) invalidatePreview() }
    media?.addEventListener('change', changed)
    return () => media?.removeEventListener('change', changed)
  }, [])

  useEffect(() => {
    if (!workingUrl) return
    const image = new Image()
    let active = true
    image.onload = () => {
      if (active && image.naturalWidth > 0 && image.naturalHeight > 0) setWorkingSize({ width: image.naturalWidth, height: image.naturalHeight })
    }
    image.src = workingUrl
    return () => { active = false; image.onload = null }
  }, [workingUrl])

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
      setMaskSourceId(`${sourceVersion}:${selected.maskId}`)
    }).catch((failure: unknown) => { if (!controller.signal.aborted && alive.current) setError(`Mask preview unavailable: ${message(failure)}`) })
    return () => { controller.abort(); if (url && owned.delete(url)) URL.revokeObjectURL(url) }
  }, [client, project.id, selected?.maskId, sourceVersion, maskRequest])

  function edit(next: LocalDraft, record = true) {
    invalidatePreview()
    const previous = currentDraft.current
    if (record && previous) setHistory(current => recordEdit(current, previous, next))
    ++editGeneration.current
    currentDraft.current = next
    setDraft(next)
    setDirty(true)
    setStatus('Editing · unsaved changes.')
    try { backupDraft(next, ownerId) }
    catch { setRecoveryNotice('Browser draft recovery could not be written. Keep this page open until Save draft succeeds.') }
  }
  function editRegion(update: (region: RawRegion) => RawRegion) {
    if (draft && selected) edit(updateRegion(draft, selected.id, update))
  }
  function numericMotion(key: keyof typeof MOTION_LABELS, value: string) { editRegion(region => ({ ...region, motion: { ...region.motion, [key]: value } })) }
  function selectionField(key: keyof typeof GEOMETRY_LABELS, value: string) { if (selected?.maskId || selected?.selection.strokes.length) return; editRegion(region => ({ ...region, maskId: undefined, selection: { ...region.selection, [key]: value } })) }

  function historyStep(redo: boolean) {
    const current = currentDraft.current
    if (!current) return
    const step = redo ? redoContent(history, current) : undoContent(history, current)
    if (!step) return
    setHistory(step.history)
    const restored = restoreContent(current, step.content)
    edit(restored, false)
    if (!restored.regions.some(part => part.id === selectedId)) setSelectedId(restored.regions[0]?.id ?? '')
  }

  function choosePreset(preset: EditorPreset, intensity: number, speed: number, defaultPivot = false) {
    if (!draft || !selected) return
    try {
      const bounds = defaultPivot && workingSize ? selectionBounds(selected, workingSize.width, workingSize.height) : undefined
      if (defaultPivot && !selected.maskId && !bounds) throw new Error('Selection has no valid visible mask. Correct it before choosing movement.')
      const pivot = bounds ? { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 } : undefined
      edit(applyPreset(draft, selected.id, preset, intensity, speed, pivot, !defaultPivot))
      setError('')
    } catch (failure) { setError(message(failure)); setAdvanced(true); setInspectorOpen(true) }
  }

  function changeRepeat(enabled: boolean) {
    if (!draft || !selected) return
    try { edit(setRepeatMovement(draft, selected.id, enabled)); setError('') }
    catch (failure) { setError(message(failure)); setAdvanced(true); setInspectorOpen(true) }
  }

  function changeSpeed(speed: number) {
    if (!draft || !selected) return
    try { edit(setPresetSpeed(draft, selected.id, speed)); setError('') }
    catch (failure) { setError(message(failure)); setAdvanced(true); setInspectorOpen(true) }
  }

  async function save(): Promise<LocalDraft | undefined> {
    if (!draft || saving || loading) return
    setSaving(true)
    setError('')
    const current = draft
    const epoch = session.current
    const generation = editGeneration.current
    try {
      const saved = await client.saveDraft(current)
      if (!alive.current || epoch !== session.current) return
      setSavedRevision(saved.revision)
      if (generation === editGeneration.current) {
        currentDraft.current = saved
        setDraft(saved)
        setDirty(false)
        setStatus('Draft saved.')
        try { clearBackup(project.id, ownerId); setRecoveryNotice('') } catch { setRecoveryNotice('Draft saved, but browser recovery could not be cleared.') }
      } else {
        const retained = { ...currentDraft.current!, revision: saved.revision }
        currentDraft.current = retained
        setDraft(retained)
        setDirty(true)
        setStatus('Prior draft saved; newer edits remain unsaved.')
        try { backupDraft(retained, ownerId) } catch { setRecoveryNotice('Recovery unavailable. Save newer edits before leaving.') }
      }
      return saved
    } catch (failure) {
      if (alive.current && epoch === session.current) { setError(message(failure)); setAdvanced(true) }
      return undefined
    } finally { if (alive.current && epoch === session.current) setSaving(false) }
  }

  function renderFailure(failure: unknown) {
    const labels: Record<string, string> = { ...MOTION_LABELS, ...GEOMETRY_LABELS, fps: 'Frames per second', duration: 'Scene or movement duration' }
    const readable = message(failure).replace(/\b(anchorX|anchorY|dx|dy|angle|fps|scaleX|scaleY|scale|cycles|period|pause|wristInfluence|start|duration|width|height|x|y)\b/g, key => labels[key] ?? key)
    setPreparing(false)
    setMode(EDITOR_MODE.EDIT)
    setStatus('Preview failed. Your edits and last successful preview are kept.')
    setError(`${readable} Open Advanced to correct the named fields, then retry preview generation. Your draft and last valid preview are kept.`)
    setAdvanced(true)
    setInspectorOpen(true)
  }

  function observeJob(next: LocalRenderJob) {
    setJob(next)
    if (next.status === 'completed' && next.artifact) {
      setPreparing(false)
      const intent = previewIntent.current
      const result = next.artifact
      const current = currentDraft.current
      if (!intent || !current || intent.generation !== editGeneration.current || result.projectId !== project.id || next.projectId !== project.id || result.sourceVersion !== intent.sourceVersion || next.sourceVersion !== intent.sourceVersion || result.sourceVersion !== current.sourceVersion || result.draftRevision !== intent.revision || next.draftRevision !== intent.revision || current.revision !== intent.revision) {
        setStatus('Outdated result. Preview changes again to see your current settings. The last successful preview is kept.')
        return
      }
      setArtifact(result)
      if (intent.allowPlay) {
        setShowBefore(false)
        setMode(EDITOR_MODE.PREVIEW)
        setAutoPlayRequest({ id: intent.id, artifactId: result.id })
        setStatus('Ready. Compare Before and After, or continue editing.')
      } else setStatus('New preview is ready. Open Preview and choose After to see it.')
      previewIntent.current = undefined
    }
    if (next.status === 'failed') { invalidatePreview(); renderFailure(new Error(next.error?.message ?? 'Preview failed.')) }
    if (next.status === 'cancelled') { invalidatePreview(); setPreparing(false); setStatus('Render cancelled. Draft and selections are kept.') }
  }
  const observeJobRef = useRef(observeJob)
  useEffect(() => { observeJobRef.current = observeJob })
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
        if (alive.current && !request?.signal.aborted && sequence === jobSequence.current) observeJobRef.current(next)
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
    if (!draft || saving || loading || preparing) return
    const epoch = session.current
    // Capture the edit and comparison boundary before the asynchronous save.
    const intent: PreviewIntent = { id: `preview-${++previewSequence.current}`, generation: editGeneration.current, sourceVersion: draft.sourceVersion, allowPlay: true, before: artifact?.sourceVersion === draft.sourceVersion ? artifact : null }
    previewIntent.current = intent
    setBeforeArtifact(intent.before)
    setShowBefore(false)
    setAutoPlayRequest(undefined)
    setPreparing(true)
    setStatus('Preparing preview. Your last successful preview is kept.')
    const saved = await save()
    if (!saved || !alive.current || epoch !== session.current || previewIntent.current !== intent || !intent.allowPlay || intent.generation !== editGeneration.current || saved.sourceVersion !== intent.sourceVersion) {
      if (alive.current && epoch === session.current) setPreparing(false)
      return
    }
    intent.revision = saved.revision
    const sequence = ++jobSequence.current
    try {
      const next = await client.render(saved)
      if (alive.current && epoch === session.current && sequence === jobSequence.current) observeJob(next)
      else if (epoch === session.current && (next.status === 'queued' || next.status === 'running')) void client.cancel(project.id, next.id).catch(() => { /* A cancelled submission must never regain playback intent. */ })
    } catch (failure) { if (alive.current && epoch === session.current && sequence === jobSequence.current) { invalidatePreview(); renderFailure(failure) } }
  }
  async function cancel() {
    invalidatePreview()
    previewIntent.current = undefined
    setPreparing(false)
    setStatus('Render cancelled. Draft and selections are kept.')
    const epoch = session.current
    const sequence = ++jobSequence.current
    jobController.current?.abort()
    if (!job || (job.status !== 'queued' && job.status !== 'running')) return
    try { const next = await client.cancel(project.id, job.id); if (alive.current && epoch === session.current && sequence === jobSequence.current) observeJob(next) }
    catch (failure) { if (alive.current && epoch === session.current && sequence === jobSequence.current) setError(message(failure)) }
  }
  function compare(before: boolean) {
    invalidatePreview()
    setShowBefore(before)
    const chosen = before ? beforeArtifact : artifact
    if (chosen) setAutoPlayRequest({ id: `compare-${++previewSequence.current}`, artifactId: chosen.id })
  }
  function brushPoint() {
    if (!selected || tool === SELECTION_TOOL.RECTANGLE) return
    const x = finiteRaw(brushX), y = finiteRaw(brushY), r = finiteRaw(radius)
    if (x === undefined || y === undefined || r === undefined || x < 0 || x > 1 || y < 0 || y > 1 || r <= 0 || r > 1) { setError('Brush coordinates and radius must be finite image fractions. Incomplete fields are kept.'); return }
    editRegion(region => ({ ...region, selection: { ...region.selection, strokes: [...region.selection.strokes, { mode: tool, radius, points: [{ x, y }] }] } }))
  }

  const moving = selected && selected.motion.type !== 'static'
  const affine = selected?.motion.type === 'scale' || selected?.motion.type === 'stretch'
  const motionKeys: (keyof typeof MOTION_LABELS)[] = selected?.motion.type === 'translate' ? ['dx', 'dy', ...(selected.motion.repeat ? ['cycles', 'period', 'pause'] as const : [])]
    : selected?.motion.type === 'rotate' ? ['anchorX', 'anchorY', 'angle', 'cycles', 'period', 'pause', 'wristInfluence']
      : selected?.motion.type === 'scale' ? ['anchorX', 'anchorY', 'scale', 'cycles', 'period', 'pause']
        : selected?.motion.type === 'stretch' ? ['anchorX', 'anchorY', 'scaleX', 'scaleY', 'cycles', 'period', 'pause'] : []
  const activeJob = job?.status === 'queued' || job?.status === 'running'

  const stale = !!artifact && (dirty || artifact.draftRevision !== savedRevision || artifact.sourceVersion !== draft?.sourceVersion)
  const ready = !!artifact && !stale && !preparing && !activeJob
  const displayedArtifact = showBefore ? beforeArtifact : artifact
  const frameAspectRatio = workingSize ? workingSize.width / workingSize.height : project.width / project.height
  const frameStyle = { '--editor-page-ratio': frameAspectRatio } as CSSProperties

  const preset = draft ? currentPreset(draft, selectedId) : undefined
  const amplitude = selected?.motion.type === 'rotate' ? Math.abs(Number(selected.motion.angle)) / 15
    : selected?.motion.type === 'scale' ? Math.abs(Number(selected.motion.scale) - 1) / .15 : Math.hypot(Number(selected?.motion.dx), Number(selected?.motion.dy)) / .08
  const intensity = Number.isFinite(amplitude) ? Math.max(0, Math.min(100, Math.round(amplitude * 100))) : 50
  const span = Number(selected?.motion.type === 'translate' && !selected.motion.repeat ? selected.motion.duration : selected?.motion.period || selected?.motion.duration)
  const speed = span > 1.5 ? 1 : span < .9 ? 3 : 2

  return <section className="page-editor" aria-labelledby="editor-title">
    <header className="page-editor__header">
      <h2 className="page-editor__sr-only" id="editor-title">Page controls</h2>
      <div className="local-toolbar page-editor__actions">
        <button onClick={() => historyStep(false)} disabled={!history.past.length || saving}>Undo</button>
        <button onClick={() => historyStep(true)} disabled={!history.future.length || saving}>Redo</button>
        {draft && <><button onClick={() => void save()} disabled={saving || loading || !dirty}>Save draft</button>{mode === EDITOR_MODE.PREVIEW && ready ? <button className="page-editor__primary" onClick={() => changeMode(EDITOR_MODE.EDIT)}>Continue editing</button> : <button className="page-editor__primary" onClick={() => void render()} disabled={saving || loading || activeJob || preparing}>{preparing || activeJob ? 'Preparing preview…' : 'Preview changes'}</button>}{(preparing || activeJob) && <button onClick={() => void cancel()}>Cancel preview</button>}</>}
      </div>
    </header>
    {loading && <p role="status">Loading editable draft…</p>}
    {error && <p className="page-editor__error" role="alert">{error}</p>}
    {recoveryNotice && <p>{recoveryNotice}</p>}
    <p className="page-editor__save-state" role="status">{saving ? 'Saving complete draft…' : status || (dirty ? 'Editing · unsaved changes.' : draft ? `Saved revision ${draft.revision}` : '')}</p>
    {draft && <div className="page-editor__workspace">
      <aside className="page-editor__parts" aria-label="Page parts" hidden={mode !== EDITOR_MODE.EDIT}>
        <h3>Select a part</h3>
        <button disabled={saving || draft.regions.length >= 16} onClick={() => { const region = newRegion(); edit({ ...draft, regions: [...draft.regions, region] }); setSelectedId(region.id); setSelectionOpen(true); setInspectorOpen(true); setTool(SELECTION_TOOL.RECTANGLE); setInteraction(SURFACE_INTERACTION.SELECT); setMode(EDITOR_MODE.EDIT) }}>Add part</button>
        {!!draft.regions.length && <label>Selected part<select value={selectedId} onChange={event => { setSelectedId(event.target.value); setSelectionOpen(false) }}>{draft.regions.map((region, index) => <option value={region.id} key={region.id}>{index + 1}. {region.label}</option>)}</select></label>}

        {selected && <button disabled={saving} onClick={() => { edit({ ...draft, regions: draft.regions.filter(region => region.id !== selected.id) }); setSelectedId(draft.regions.find(region => region.id !== selected.id)?.id ?? ''); setSelectionOpen(false) }}>Remove selected part</button>}
      </aside>
      <section className="page-editor__canvas" aria-label="Page canvas">
        <div className="page-editor__canvas-bar" aria-label="Canvas view">{Object.values(EDITOR_MODE).map(value => <button key={value} aria-pressed={mode === value} onClick={() => changeMode(value)}>{value}</button>)}<span className="page-editor__fit">Fit to canvas</span></div>
        {mode === EDITOR_MODE.EDIT && <div className="page-editor__view">
          {selected && workingUrl ? <SelectionSurface key={`${draft.sourceVersion}:${selected.id}`} region={selected} imageUrl={workingUrl} maskUrl={maskSourceId === `${draft.sourceVersion}:${selected.maskId}` ? maskUrl : undefined} tool={tool} radius={radius} interaction={interaction} onDimensions={setWorkingSize} onChange={region => editRegion(() => region)} />
            : workingUrl ? <img src={workingUrl} alt={`Working page: ${project.name}`} /> : <p>Working image unavailable. Retry loading the editor.</p>}
          {!selected && <p>Add a part to select an area on this page.</p>}
        </div>}
        {mode === EDITOR_MODE.ORIGINAL && <div className="page-editor__view"><img src={originalUrl} alt={`Original page: ${project.name}`} /><p>Original bytes are unchanged.</p></div>}
        {mode === EDITOR_MODE.PREVIEW && <div className="page-editor__view page-editor__view--compare" style={frameStyle}>
          {artifact && <div className="page-editor__comparison" aria-label="Compare previews"><button aria-pressed={showBefore} onClick={() => compare(true)}>Before</button><button aria-pressed={!showBefore} onClick={() => compare(false)}>After</button></div>}
          {artifact && <p className="page-editor__comparison-label">{showBefore ? beforeArtifact ? 'Before · previous successful preview' : 'Before · original (no previous preview)' : stale ? 'Last successful preview · outdated' : 'After · current changes'}</p>}
          {displayedArtifact ? <LocalPlayback key={displayedArtifact.id} name={project.name} originalUrl={originalUrl} loadVideo={signal => client.video(displayedArtifact, signal)} frameAspectRatio={frameAspectRatio} autoPlayRequest={autoPlayRequest?.artifactId === displayedArtifact.id ? autoPlayRequest.id : undefined} /> : <div className="local-playback"><div className="local-playback__media" style={{ aspectRatio: frameAspectRatio }}><img src={originalUrl} alt={`Static original: ${project.name}`} /></div><div className="local-playback__feedback"><p>{showBefore ? 'No previous successful preview. Showing the unchanged original.' : 'Preview changes to see the rendered movement. Switching views never starts a render.'}</p></div></div>}
        </div>}
        {stale && <p className="page-editor__stale">Preview is out of date. Preview changes to see your current settings. The last successful preview is kept.</p>}

      </section>
      <details className="page-editor__inspector" hidden={mode !== EDITOR_MODE.EDIT} open={inspectorOpen} onToggle={event => setInspectorOpen(event.currentTarget.open)}><summary>Part inspector</summary>
        {selected ? <>
          <h3>Adjust motion</h3>
          <fieldset disabled={saving}><legend>Motion</legend>
            <div className="page-editor__presets">{Object.values(EDITOR_PRESET).map(preset => <button key={preset} disabled={!selected.maskId && !workingSize} aria-pressed={selected.motion.type === preset} onClick={() => choosePreset(preset, 50, 2, true)}>{PRESET_LABELS[preset]}</button>)}</div>
            {selected.maskId && <p>Model mask bounds are unknown here. Presets keep your current pivot; use Place pivot to set it visually.</p>}
            {!workingSize && !selected.maskId && <p>Wait for the working image to load before choosing a preset.</p>}
            {preset && <><label>Intensity<input type="range" min="0" max="100" value={intensity} onChange={event => choosePreset(preset, Number(event.target.value), speed)} /></label><div className="page-editor__speed-repeat"><label>Speed · {speed === 1 ? 'Slow' : speed === 2 ? 'Medium' : 'Fast'}<input aria-label="Speed" type="range" min="1" max="3" step="1" value={speed} aria-valuetext={speed === 1 ? 'Slow' : speed === 2 ? 'Medium' : 'Fast'} onChange={event => changeSpeed(Number(event.target.value))} onKeyDown={event => { const direction = event.key === 'ArrowRight' || event.key === 'ArrowUp' ? 1 : event.key === 'ArrowLeft' || event.key === 'ArrowDown' ? -1 : 0; if (direction) { event.preventDefault(); changeSpeed(Math.max(1, Math.min(3, speed + direction))) } }} /></label><label className="page-editor__repeat"><input type="checkbox" checked={isRepeatMovementEnabled(selected.motion)} aria-describedby="repeat-movement-help" onChange={event => changeRepeat(event.target.checked)} />Repeat movement</label></div><p id="repeat-movement-help">Repeats within this clip, not the whole clip.</p>{selected.motion.repeat !== true && isRepeatMovementEnabled(selected.motion) && <p>Custom repetitions: {selected.motion.cycles}. Changing Speed or Intensity fills this clip with complete movements.</p>}</>}
            <button aria-pressed={selected.motion.type === 'static'} onClick={() => edit(selectMotion(draft, selected.id, 'static'))}>Keep static</button>
          </fieldset>
          <details className="page-editor__selection" open={selectionOpen} onToggle={event => setSelectionOpen(event.currentTarget.open)}><summary>Edit selection</summary>
            <label>Part label<input value={selected.label} onChange={event => editRegion(region => ({ ...region, label: event.target.value }))} disabled={saving} /></label>
          <fieldset disabled={saving}><legend>Selection</legend>
            <label>Selection tool<select value={tool} onChange={event => { setTool(event.target.value as SelectionTool); setInteraction(SURFACE_INTERACTION.SELECT) }}><option value="rectangle">Rectangle</option><option value="add">Add brush</option><option value="erase">Erase brush</option></select></label>
            {tool === SELECTION_TOOL.RECTANGLE ? <label>Canvas action<select value={interaction} onChange={event => setInteraction(event.target.value as SelectionInteraction)}><option value={SURFACE_INTERACTION.SELECT} disabled={!!selected.maskId || !!selected.selection.strokes.length}>Draw rectangle</option><option value={SURFACE_INTERACTION.MOVE} disabled={!!selected.maskId || !!selected.selection.strokes.length}>Move selection</option><option value={SURFACE_INTERACTION.RESIZE} disabled={!!selected.maskId || !!selected.selection.strokes.length}>Resize selection</option>{selected.motion.type !== 'static' && selected.motion.type !== 'translate' && <option value={SURFACE_INTERACTION.PIVOT}>Place pivot</option>}{selected.motion.type === 'translate' && <option value={SURFACE_INTERACTION.DIRECTION}>Set movement direction</option>}</select></label> : <label>Brush radius<input inputMode="decimal" value={radius} onChange={event => setRadius(event.target.value)} /></label>}
            {(selected.maskId || !!selected.selection.strokes.length) && <><p>Brush and model masks keep their shape. Replacing the mask discards its corrections.</p><button onClick={() => { editRegion(region => ({ ...region, maskId: undefined, selection: { ...region.selection, strokes: [] } })); setTool(SELECTION_TOOL.RECTANGLE); setInteraction(SURFACE_INTERACTION.SELECT) }}>Replace mask with rectangle</button></>}
          </fieldset>
          </details>
          <details className="page-editor__advanced" open={advanced} onToggle={event => setAdvanced(event.currentTarget.open)}><summary>Advanced</summary>
            <p>Raw incomplete fields can be saved. Rendering requires valid values. Coordinates are working-image fractions: 0 is the left/top edge, 1 is the right/bottom edge.</p>
            <fieldset disabled={saving}><legend>Scene timing</legend><label>Scene duration<input value={draft.duration} onChange={event => edit({ ...draft, duration: event.target.value })} inputMode="decimal" /></label><label>Frames per second<input value={draft.fps} onChange={event => edit({ ...draft, fps: event.target.value })} inputMode="numeric" /></label></fieldset>
            <fieldset disabled={saving}><legend>Mask and layer</legend>
              <label>Layer role<select value={selected.role} onChange={event => editRegion(region => ({ ...region, role: event.target.value as RawRegion['role'] }))}>{Object.values(LOCAL_ROLE).map(role => <option key={role}>{role}</option>)}</select></label>
              <p>{selected.maskId ? 'Model-assisted binary mask. Inspect and correct it before rendering.' : 'Rectangle mask: a nonsemantic fallback, not a detected head or hand. Add/erase brush strokes refine the actual mask.'}</p>
              <div className="editor-fields">{Object.entries(GEOMETRY_LABELS).map(([key, label]) => <label key={key}>{label}<input inputMode="decimal" value={selected.selection[key as keyof typeof GEOMETRY_LABELS]} disabled={!!selected.maskId || !!selected.selection.strokes.length} onChange={event => selectionField(key as keyof typeof GEOMETRY_LABELS, event.target.value)} /></label>)}</div>
              {tool === SELECTION_TOOL.RECTANGLE && <label>Brush radius<input inputMode="decimal" value={radius} onChange={event => setRadius(event.target.value)} /></label>}
              <div className="editor-fields"><label>Brush point X<input inputMode="decimal" value={brushX} onChange={event => setBrushX(event.target.value)} /></label><label>Brush point Y<input inputMode="decimal" value={brushY} onChange={event => setBrushY(event.target.value)} /></label></div>
              <button onClick={brushPoint} disabled={tool === SELECTION_TOOL.RECTANGLE}>Apply brush point</button><button onClick={() => editRegion(region => ({ ...region, selection: { ...region.selection, strokes: region.selection.strokes.slice(0, -1) } }))} disabled={!selected.selection.strokes.length}>Undo last brush stroke</button>
            </fieldset>
            <fieldset disabled={saving}><legend>Exact movement</legend>
              <label>Movement<select value={selected.motion.type} onChange={event => edit(selectMotion(draft, selected.id, event.target.value as RawMotion['type']))}>{Object.values(LOCAL_AFFINE_MOTION).map(type => <option key={type}>{type}</option>)}</select></label>
              {affine && <p>Drawing factors are separate from selection width and height. Factor 1 keeps the drawing size unchanged; the current renderer accepts 0.75 to 1.25. Choosing scale or stretch explicitly upgrades this draft to version 2. Pivot coordinates are working-image fractions.</p>}
              {moving && <div className="editor-fields">{[...motionKeys, 'start', 'duration'].map(key => <label key={key}>{MOTION_LABELS[key as keyof typeof MOTION_LABELS]}<input inputMode="decimal" value={selected.motion[key as keyof typeof MOTION_LABELS] ?? ''} onChange={event => numericMotion(key as keyof typeof MOTION_LABELS, event.target.value)} /></label>)}</div>}
              {selected.motion.type === 'rotate' && <p>Finite repetitions require a gesture period. With no period, rotation is one action; a periodic gesture follows the renderer's fixed sine curve.</p>}
              {affine && <p>Finite repetitions require a gesture period; without a period, the drawing changes size once over Movement duration. Periodic motion uses the renderer's fixed sine curve and returns to identity. Repetition stays finite and does not enable reader looping.</p>}
              {((selected.motion.type === 'translate' && !selected.motion.repeat) || ((affine || selected.motion.type === 'rotate') && !selected.motion.period.trim())) && <><label>Easing<select value={selected.motion.easing} onChange={event => editRegion(region => ({ ...region, motion: { ...region.motion, easing: event.target.value as RawMotion['easing'] } }))}>{Object.values(LOCAL_EASING).map(value => <option key={value}>{value}</option>)}</select></label><label>Final state<select value={selected.motion.endState} onChange={event => editRegion(region => ({ ...region, motion: { ...region.motion, endState: event.target.value as RawMotion['endState'] } }))}>{Object.values(LOCAL_END).map(value => <option key={value}>{value}</option>)}</select></label></>}
            </fieldset>
            <AssistancePanel draft={draft} selectedId={selectedId} client={client} prepare={save} apply={next => { edit(next); if (!selectedId) setSelectedId(next.regions[0]?.id ?? '') }} />
          </details>
        </> : <><h3>Start a selection</h3><p>Add a part, draw its selection on the canvas, then choose a movement.</p></>}
      </details>
    </div>}
    <details className="page-editor__recovery"><summary>Recovery and reload</summary>{job && <section className="page-editor__job" aria-label="Render job"><p role="status">{activeJob ? `Render ${job.status} · preparing preview` : job.status === 'failed' ? 'Preview failed' : job.status === 'cancelled' ? 'Preview cancelled' : 'Preview processing finished'}</p>{activeJob && <div className="local-toolbar"><button onClick={() => void refreshJob()}>Refresh render status</button></div>}</section>}<div className="local-toolbar"><button onClick={() => reload()} disabled={loading || saving}>Retry loading editor</button><button onClick={() => reload(true)} disabled={saving || loading}>Discard local edits & reload</button></div></details>
  </section>
}
