import { useEffect, useRef, useState, type FormEvent } from 'react'
import type { LocalProject } from './contracts'
import { localProjectClient, type LocalProjectClient } from './local-project-client'
import './LocalProjects.css'
import { PageEditor } from './PageEditor'
import { LocalChapters } from './LocalChapters'

const LIST_STATE = { LOADING: 'loading', READY: 'ready', FAILED: 'failed' } as const
type ListState = (typeof LIST_STATE)[keyof typeof LIST_STATE]

interface OriginalView {
  project: LocalProject
  url: string
}

interface OriginalFailure {
  project: LocalProject
  message: string
  url?: string
}
interface FailedImport { file: File; message: string }

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'The local request failed. Retry when the local service is available.'
}

export function LocalProjects({ client = localProjectClient, ownerId = 'local', sharingEnabled = false }: { client?: LocalProjectClient; ownerId?: string; sharingEnabled?: boolean }) {
  const [projects, setProjects] = useState<LocalProject[]>([])
  const [listState, setListState] = useState<ListState>(LIST_STATE.LOADING)
  const [listError, setListError] = useState('')
  const [file, setFile] = useState<File>()
  const [batch, setBatch] = useState<File[]>([])
  const [failedImports, setFailedImports] = useState<FailedImport[]>([])
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [status, setStatus] = useState('')
  const [visible, setVisible] = useState<OriginalView>()
  const [candidate, setCandidate] = useState<OriginalView>()
  const [originalFailure, setOriginalFailure] = useState<OriginalFailure>()
  const [openingName, setOpeningName] = useState('')
  const [editing, setEditing] = useState(false)
  const [chaptersVisible, setChaptersVisible] = useState(false)
  const mounted = useRef(false)
  const listRequest = useRef(0)
  const originalRequest = useRef(0)
  const listController = useRef<AbortController | undefined>(undefined)
  const originalController = useRef<AbortController | undefined>(undefined)
  const saveController = useRef<AbortController | undefined>(undefined)
  const ownedUrls = useRef(new Set<string>())
  const visibleRef = useRef<OriginalView | undefined>(undefined)
  const candidateRef = useRef<OriginalView | undefined>(undefined)
  const failureRef = useRef<OriginalFailure | undefined>(undefined)
  const headingRef = useRef<HTMLHeadingElement>(null)
  const originalHeadingRef = useRef<HTMLHeadingElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  function release(url?: string) {
    if (url && ownedUrls.current.delete(url)) URL.revokeObjectURL(url)
  }

  function loadProjects() {
    const requestId = ++listRequest.current
    listController.current?.abort()
    const controller = new AbortController()
    listController.current = controller
    return client.list(controller.signal).then(saved => {
      if (!mounted.current || controller.signal.aborted || requestId !== listRequest.current) return
      setProjects(saved)
      setListState(LIST_STATE.READY)
    }).catch((error: unknown) => {
      if (!mounted.current || controller.signal.aborted || requestId !== listRequest.current) return
      setListError(errorMessage(error))
      setListState(LIST_STATE.FAILED)
    })
  }

  function retryProjects() {
    setListState(LIST_STATE.LOADING)
    setListError('')
    void loadProjects()
  }

  useEffect(() => {
    mounted.current = true
    headingRef.current?.focus()
    void loadProjects()
    const urls = ownedUrls.current
    return () => {
      mounted.current = false
      listController.current?.abort()
      originalController.current?.abort()
      saveController.current?.abort()
      for (const url of urls) URL.revokeObjectURL(url)
      urls.clear()
    }
    // The client is an injected boundary; state changes must not reload the list.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client])

  useEffect(() => {
    if (visible) originalHeadingRef.current?.focus()
  }, [visible])

  async function openProject(project: LocalProject) {
    const requestId = ++originalRequest.current
    originalController.current?.abort()
    const controller = new AbortController()
    originalController.current = controller
    release(candidateRef.current?.url)
    release(failureRef.current?.url)
    candidateRef.current = undefined
    failureRef.current = undefined
    setCandidate(undefined)
    setOriginalFailure(undefined)
    setOpeningName(project.name)
    try {
      const blob = await client.original(project.id, controller.signal)
      if (!mounted.current || controller.signal.aborted || requestId !== originalRequest.current) return
      const url = URL.createObjectURL(blob)
      ownedUrls.current.add(url)
      const next = { project, url }
      candidateRef.current = next
      setCandidate(next)
    } catch (error) {
      if (!mounted.current || controller.signal.aborted || requestId !== originalRequest.current) return
      const failure = { project, message: errorMessage(error) }
      failureRef.current = failure
      setOriginalFailure(failure)
      setOpeningName('')
    }
  }

  function displayOriginal(next: OriginalView) {
    if (candidateRef.current?.url !== next.url) return
    release(visibleRef.current?.url)
    visibleRef.current = next
    candidateRef.current = undefined
    setVisible(next)
    setCandidate(undefined)
    setOpeningName('')
    setEditing(false)
    setStatus('Unchanged original opened.')
  }

  function displayFailed(next: OriginalView) {
    if (candidateRef.current?.url !== next.url) return
    const failure = { ...next, message: 'The original could not be displayed. Retry, or download the unchanged original.' }
    failureRef.current = failure
    candidateRef.current = undefined
    setOriginalFailure(failure)
    setCandidate(undefined)
    setOpeningName('')
  }

  async function saveOriginal(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    await saveFiles(batch.length ? batch : file ? [file] : [])
  }

  async function saveFiles(files: File[]) {
    if (!files.length || saving) return
    const controller = new AbortController()
    saveController.current = controller
    setSaving(true)
    setSaveError('')
    setStatus('')
    const failed: FailedImport[] = []
    let latestSaved: LocalProject | undefined
    for (const [index, selectedFile] of files.entries()) {
      if (!mounted.current || controller.signal.aborted) return
      setStatus(`Saving ${index + 1} of ${files.length}: ${selectedFile.name}`)
      try {
        const saved = await client.create(selectedFile, controller.signal)
        if (!mounted.current || controller.signal.aborted) return
        latestSaved = saved
        ++listRequest.current
        listController.current?.abort()
        setProjects(current => [saved, ...current.filter(project => project.id !== saved.id)])
        setListState(LIST_STATE.READY)
        setListError('')
      } catch (error) {
        if (!mounted.current || controller.signal.aborted) return
        failed.push({ file: selectedFile, message: errorMessage(error) })
      }
    }
    setFailedImports(failed)
    setSaving(false)
    setBatch(failed.map(item => item.file))
    setFile(failed[0]?.file)
    if (failed.length) setSaveError(failed.map(item => `${item.file.name}: ${item.message}`).join(' '))
    else if (fileInputRef.current) fileInputRef.current.value = ''
    setStatus(`${files.length - failed.length} original(s) saved locally. Successful imports are kept. Keep your own backup of source files.`)
    if (latestSaved) void openProject(latestSaved)
  }

  return (
    <main className="local-projects">
      <header className="local-projects__header">
        <p className="local-projects__kicker">Motion Manga Lab · Local workspace</p>
        <h1 ref={headingRef} tabIndex={-1}>Local projects</h1>
        <p>Import originals, direct their parts, and prepare ordered local reading versions.</p>
        <p className="local-projects__notice">{sharingEnabled ? 'Account-scoped self-hosted workspace. Originals stay private; guest access requires explicitly sharing a reviewed snapshot. Stored files are not encrypted backups.' : <>Available through <code>npm run dev</code> on this machine. Nothing is published online. Local storage is not encrypted storage or a backup.</>}</p>
      </header>
      <div className="local-toolbar" aria-label="Local workspace views"><button aria-pressed={!chaptersVisible} onClick={() => setChaptersVisible(false)}>Pages & editor</button><button aria-pressed={chaptersVisible} onClick={() => setChaptersVisible(true)}>Chapters & snapshots</button></div>
      {chaptersVisible ? <LocalChapters projects={projects} sharingEnabled={sharingEnabled} /> : <div className="local-projects__layout">
        <div className="local-projects__controls">
          <section aria-labelledby="import-title" className="local-projects__panel">
            <h2 id="import-title">Save an original</h2>
            <form onSubmit={event => void saveOriginal(event)} aria-busy={saving}>
              <label htmlFor="page-image">Page image</label>
              <input ref={fileInputRef} id="page-image" type="file" multiple accept="image/png,image/jpeg,image/webp"
                disabled={saving} aria-describedby="import-help"
                onChange={event => { const files = Array.from(event.target.files ?? []); setFile(files[0]); setBatch(files); setFailedImports([]); setSaveError('') }} />
              <p id="import-help">Choose a PNG, JPG or WebP you have permission to process. This increment accepts still images only. The local service checks its temporary safety limits.</p>
              {file && <p>Selected: {batch.length > 1 ? `${batch.length} images` : file.name}</p>}
              <button type="submit" disabled={!file || saving}>{saving ? (batch.length > 1 ? 'Saving originals…' : 'Saving original…') : (batch.length > 1 ? 'Save originals' : 'Save original')}</button>
              {saveError && <p role="alert">{saveError} Your selected file and current original are kept. Retry saving or choose another file.</p>}
              {!!failedImports.length && <button type="button" disabled={saving} onClick={() => void saveFiles(failedImports.map(item => item.file))}>Retry failed imports</button>}
            </form>
          </section>

          <section aria-labelledby="saved-title" className="local-projects__panel" aria-busy={listState === LIST_STATE.LOADING}>
            <h2 id="saved-title">Saved projects</h2>
            {listState === LIST_STATE.LOADING && <p role="status">Loading saved projects…</p>}
            {listState === LIST_STATE.FAILED && <div><p role="alert">{listError}</p><button onClick={retryProjects}>Retry loading projects</button></div>}
            {listState === LIST_STATE.READY && !projects.length && <p>No saved projects yet.</p>}
            <ul className="local-projects__list">
              {projects.map(project => <li key={project.id}>
                <button onClick={() => void openProject(project)} aria-pressed={visible?.project.id === project.id} aria-label={`Open ${project.name}`}>
                  <span>{project.name}</span><small>{project.width} × {project.height} · {project.byteLength.toLocaleString()} bytes</small>
                </button>
              </li>)}
            </ul>
          </section>
        </div>

        <section className="local-projects__original" aria-labelledby="original-title">
          <h2 id="original-title" ref={originalHeadingRef} tabIndex={-1}>{visible?.project.name ?? 'Original preview'}</h2>
          {openingName && <p role="status">Opening {openingName}…</p>}
          {originalFailure && <div className="local-projects__panel"><p role="alert">{originalFailure.message}</p><button onClick={() => void openProject(originalFailure.project)}>Retry original</button>
            {originalFailure.url && <a href={originalFailure.url} download={originalFailure.project.name}>Download original</a>}
          </div>}
          {visible && <>
            <img src={visible.url} alt={`Original page: ${visible.project.name}`} width={visible.project.width} height={visible.project.height} />
            <a href={visible.url} download={visible.project.name}>Download original</a>
            <button onClick={() => setEditing(value => !value)}>{editing ? 'Close editor' : 'Edit page'}</button>
            {editing && <PageEditor key={`${ownerId}:${visible.project.id}`} ownerId={ownerId} project={visible.project} originalUrl={visible.url} />}
          </>}
          {!visible && !openingName && !originalFailure && <p>Open a saved project or save your first original.</p>}
          {candidate && <img key={candidate.url} hidden src={candidate.url} alt={`Original page: ${candidate.project.name}`}
            onLoad={() => displayOriginal(candidate)} onError={() => displayFailed(candidate)} />}
        </section>
      </div>}
      <p className="local-projects__status" role="status">{status}</p>
    </main>
  )
}
