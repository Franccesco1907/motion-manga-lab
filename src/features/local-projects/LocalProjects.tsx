import { useEffect, useRef, useState, type FormEvent } from 'react'
import type { LocalProject } from './contracts'
import { localProjectClient, type LocalProjectClient } from './local-project-client'
import './LocalProjects.css'
import { PageEditor } from './PageEditor'
import { LocalChapters } from './LocalChapters'
import { PageThumbnail } from './PageThumbnail'

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
    headingRef.current?.focus()
  }, [visible, chaptersVisible])

  async function openProject(project: LocalProject) {
    const requestId = ++originalRequest.current
    originalController.current?.abort()
    const controller = new AbortController()
    originalController.current = controller
    release(visibleRef.current?.url)
    visibleRef.current = undefined
    setVisible(undefined)
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
    setStatus('Page opened. The original is unchanged.')
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

  function closePage() {
    ++originalRequest.current
    originalController.current?.abort()
    release(visibleRef.current?.url)
    release(candidateRef.current?.url)
    release(failureRef.current?.url)
    visibleRef.current = undefined
    candidateRef.current = undefined
    failureRef.current = undefined
    setVisible(undefined)
    setCandidate(undefined)
    setOriginalFailure(undefined)
    setOpeningName('')
    setStatus('')
  }

  return (
    <main className="local-projects" data-view={chaptersVisible ? 'chapters' : visible ? 'editor' : 'library'}>
      <header className="local-projects__header">
        <div className="local-projects__title-row">
          <div>
            <p className="local-projects__kicker">{visible ? 'Page editor' : 'Private creator workspace'}</p>
            <h1 ref={headingRef} tabIndex={-1}>{chaptersVisible ? 'Chapters & snapshots' : visible?.project.name ?? 'Page library'}</h1>
          </div>
          {visible && <div className="local-toolbar">
            <button type="button" onClick={closePage}>Back to pages</button>
            <a href={visible.url} download={visible.project.name}>Download original</a>
          </div>}
        </div>
        {!visible && <>
          <p>Start with a page. Select its parts, add motion, then assemble a chapter.</p>
          <p className="local-projects__notice">{sharingEnabled ? 'Your originals are private to your account. Guest access requires explicitly sharing a reviewed snapshot. Keep your own backups; stored files are not encrypted.' : 'Originals stay on this machine. Nothing is published online. Keep your own backups; local storage is not encrypted.'}</p>
        </>}
      </header>
      {!visible && <nav className="local-toolbar local-projects__views" aria-label="Creator views">
        <button aria-pressed={!chaptersVisible} onClick={() => setChaptersVisible(false)}>Pages</button>
        <button aria-pressed={chaptersVisible} disabled={saving} onClick={() => { closePage(); setChaptersVisible(true) }}>Chapters & snapshots</button>
      </nav>}
      {chaptersVisible ? <LocalChapters projects={projects} sharingEnabled={sharingEnabled} /> : visible ? (
        <section className="local-projects__original" aria-label={`Editing ${visible.project.name}`}>
          <PageEditor key={`${ownerId}:${visible.project.id}`} ownerId={ownerId} project={visible.project} originalUrl={visible.url} />
        </section>
      ) : <div className="local-projects__layout">
        <section aria-labelledby="saved-title" className="local-projects__library" aria-busy={listState === LIST_STATE.LOADING}>
          <div className="local-projects__section-heading"><h2 id="saved-title">Your pages</h2><span>{projects.length} {projects.length === 1 ? 'page' : 'pages'}</span></div>
          {listState === LIST_STATE.LOADING && <p role="status">Loading saved pages…</p>}
          {listState === LIST_STATE.FAILED && <div><p role="alert">{listError}</p><button onClick={retryProjects}>Retry loading projects</button></div>}
          {listState === LIST_STATE.READY && !projects.length && <div className="local-projects__empty"><h3>No saved pages yet.</h3><p>Upload a page you have permission to edit to begin.</p></div>}
          <ul className="local-projects__list">
            {projects.map(project => <li key={project.id}>
              <button className="page-card" onClick={() => void openProject(project)} aria-label={`Open ${project.name}`}>
                <PageThumbnail project={project} client={client} />
                <span className="page-card__details"><strong>{project.name}</strong><small>{project.width} × {project.height} · {project.byteLength.toLocaleString()} bytes</small><span className="page-card__status">Original saved</span><span className="page-card__action">Open editor →</span></span>
              </button>
            </li>)}
          </ul>
          {openingName && <p role="status">Opening {openingName}…</p>}
          {originalFailure && <div className="local-projects__panel"><p role="alert">{originalFailure.message}</p><button onClick={() => void openProject(originalFailure.project)}>Retry original</button>
            {originalFailure.url && <a href={originalFailure.url} download={originalFailure.project.name}>Download original</a>}
          </div>}
        </section>
        <section aria-labelledby="import-title" className="local-projects__panel local-projects__upload">
          <p className="local-projects__kicker">New page</p>
          <h2 id="import-title">Upload your artwork</h2>
          <form onSubmit={event => void saveOriginal(event)} aria-busy={saving}>
            <label htmlFor="page-image">Page image</label>
            <input ref={fileInputRef} id="page-image" type="file" multiple accept="image/png,image/jpeg,image/webp"
              disabled={saving} aria-describedby="import-help"
              onChange={event => { const files = Array.from(event.target.files ?? []); setFile(files[0]); setBatch(files); setFailedImports([]); setSaveError('') }} />
            <p id="import-help">PNG, JPG or WebP still images only. Choose artwork you have permission to process. Your original is preserved; the service checks file safety limits.</p>
            {file && <p>Selected: {batch.length > 1 ? `${batch.length} images` : file.name}</p>}
            <button className="local-projects__primary" type="submit" disabled={!file || saving}>{saving ? (batch.length > 1 ? 'Uploading pages…' : 'Uploading page…') : (batch.length > 1 ? 'Upload pages' : 'Upload page')}</button>
            {saveError && <p role="alert">{saveError} Your selected file is kept. Retry uploading or choose another file.</p>}
            {!!failedImports.length && <button type="button" disabled={saving} onClick={() => void saveFiles(failedImports.map(item => item.file))}>Retry failed imports</button>}
          </form>
        </section>
      </div>}
      {candidate && <img key={candidate.url} hidden src={candidate.url} alt={`Original page: ${candidate.project.name}`}
        onLoad={() => displayOriginal(candidate)} onError={() => displayFailed(candidate)} />}
      <p className="local-projects__status" role="status">{status}</p>
    </main>
  )
}
