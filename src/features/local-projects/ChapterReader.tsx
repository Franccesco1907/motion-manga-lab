import { useEffect, useRef, useState } from 'react'
import type { LocalProject, LocalRenderArtifact, LocalSnapshot } from './contracts'
import { authoringClient, type AuthoringClient } from './authoring-client'
import { localProjectClient, type LocalProjectClient } from './local-project-client'
import { LocalPlayback } from './LocalPlayback'

interface ChapterReaderProps {
  name: string
  pageIds: string[]
  projects: LocalProject[]
  snapshot?: LocalSnapshot
  client?: AuthoringClient
  originals?: LocalProjectClient
}
interface ReadingPageProps {
  projectId: string
  name: string
  snapshot?: LocalSnapshot
  client: AuthoringClient
  originals: LocalProjectClient
}

function ReadingPage({ projectId, name, snapshot, client, originals }: ReadingPageProps) {
  const [url, setUrl] = useState('')
  const [artifact, setArtifact] = useState<LocalRenderArtifact | null>(null)
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)
  const heading = useRef<HTMLHeadingElement>(null)
  useEffect(() => {
    const controller = new AbortController()
    let owned = ''
    heading.current?.focus()
    const source = snapshot ? client.snapshotPoster(snapshot.id, projectId, controller.signal, snapshot.revision) : originals.original(projectId, controller.signal)
    const latest = snapshot ? Promise.resolve({ artifact: snapshot.pages.find(page => page.projectId === projectId)?.artifact ?? null, error: '' })
      : client.latest(projectId, controller.signal).then(artifact => ({ artifact, error: '' })).catch((failure: unknown) => ({ artifact: null, error: failure instanceof Error ? failure.message : 'Animation metadata unavailable. Reading stays static.' }))
    void Promise.all([source, latest]).then(([blob, result]) => {
      if (controller.signal.aborted) return
      owned = URL.createObjectURL(blob)
      setUrl(owned)
      setArtifact(result.artifact)
      setError(result.error)
    }).catch((failure: unknown) => { if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : 'Reading asset unavailable. Retry explicitly.') })
    return () => { controller.abort(); if (owned) URL.revokeObjectURL(owned) }
  }, [projectId, snapshot, client, originals, attempt])
  return <section aria-label="Reading page"><h4 ref={heading} tabIndex={-1}>{name}</h4>
    {error && <p role="alert">{error}</p>}
    {!url && !error && <p role="status">Loading readable page…</p>}
    {error && <button onClick={() => { setUrl(''); setArtifact(null); setError(''); setAttempt(value => value + 1) }}>Retry reading page</button>}
    {url && (artifact ? <LocalPlayback key={artifact.id} name={name} originalUrl={url} loadVideo={signal => snapshot ? client.snapshotVideo(snapshot.id, projectId, signal, snapshot.revision) : client.video(artifact, signal)} />
      : <><p>No completed render. The original remains readable.</p><img src={url} alt={`Static original: ${name}`} /></>)}
  </section>
}

export function ChapterReader({ name, pageIds, projects, snapshot, client = authoringClient, originals = localProjectClient }: ChapterReaderProps) {
  const [index, setIndex] = useState(0)
  const pageId = pageIds[index]
  const pageName = snapshot?.pages.find(page => page.projectId === pageId)?.name ?? projects.find(project => project.id === pageId)?.name ?? 'Page unavailable'
  return <section className="chapter-reader" aria-label="Local chapter reader">
    <h3>{name}{snapshot ? ' · reviewed local snapshot' : ' · private chapter'}</h3>
    {!pageIds.length && <p>No pages in this reading version.</p>}
    {!!pageIds.length && <>
      <div className="local-toolbar"><button disabled={index === 0} onClick={() => setIndex(value => value - 1)}>Previous page</button><p role="status">Page {index + 1} of {pageIds.length}</p><button disabled={index === pageIds.length - 1} onClick={() => setIndex(value => value + 1)}>Next page</button></div>
      <ReadingPage key={pageId} name={pageName} projectId={pageId} snapshot={snapshot} client={client} originals={originals} />
    </>}
  </section>
}
