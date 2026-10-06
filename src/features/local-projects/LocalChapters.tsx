import { useEffect, useState } from 'react'
import type { LocalChapter, LocalProject, LocalSnapshot } from './contracts'
import { authoringClient, type AuthoringClient } from './authoring-client'
import { ChapterReader } from './ChapterReader'
import { SharePanel } from '../sharing/SharePanel'
interface LocalChaptersProps { projects: LocalProject[]; client?: AuthoringClient; sharingEnabled?: boolean }
const READING = { PRIVATE: 'private', SNAPSHOT: 'snapshot' } as const
type ReadingMode = (typeof READING)[keyof typeof READING]

export function LocalChapters({ projects, client = authoringClient, sharingEnabled = false }: LocalChaptersProps) {
  const [chapters, setChapters] = useState<LocalChapter[]>([])
  const [snapshots, setSnapshots] = useState<LocalSnapshot[]>([])
  const [drafts, setDrafts] = useState<Record<string, LocalChapter>>({})
  const [selectedId, setSelectedId] = useState('')
  const [newName, setNewName] = useState('')
  const [pageId, setPageId] = useState('')
  const [reviewed, setReviewed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const [attempt, setAttempt] = useState(0)
  const [error, setError] = useState('')
  const [status, setStatus] = useState('')
  const [reading, setReading] = useState<ReadingMode>()
  const chapter = drafts[selectedId] ?? chapters.find(item => item.id === selectedId)
  const snapshot = snapshots.find(item => item.chapterId === selectedId)

  useEffect(() => {
    const controller = new AbortController()
    void Promise.all([client.chapters(controller.signal), client.snapshots(controller.signal)]).then(([saved, published]) => {
      if (controller.signal.aborted) return
      setChapters(saved)
      setSnapshots(published)
      setSelectedId(current => saved.some(item => item.id === current) ? current : saved[0]?.id ?? '')
      setLoading(false)
      setError('')
    }).catch((failure: unknown) => { if (!controller.signal.aborted) { setError(failure instanceof Error ? failure.message : 'Local chapters unavailable. Retry loading.'); setLoading(false) } })
    return () => controller.abort()
  }, [client, attempt])

  function edit(next: LocalChapter) { setDrafts(current => ({ ...current, [next.id]: next })); setReviewed(false); setReading(undefined); setStatus('Unsaved chapter changes.') }
  async function operation(action: () => Promise<void>) {
    setBusy(true)
    setError('')
    try { await action() }
    catch (failure) { setError(failure instanceof Error ? failure.message : 'Local operation failed. Your chapter and prior reading snapshot are kept.') }
    finally { setBusy(false) }
  }
  async function saveChapter(current: LocalChapter) {
    const saved = await client.saveChapter(current)
    setChapters(items => items.map(item => item.id === saved.id ? saved : item))
    setDrafts(items => { const next = { ...items }; delete next[saved.id]; return next })
    return saved
  }
  function reorder(index: number, delta: number) {
    if (!chapter) return
    const pageIds = [...chapter.pageIds]
    ;[pageIds[index], pageIds[index + delta]] = [pageIds[index + delta], pageIds[index]]
    edit({ ...chapter, pageIds })
  }
  return <section className="local-chapters" aria-labelledby="chapters-title">
    <h2 id="chapters-title">Chapters & local reading snapshots</h2>
    <p>Order saved pages and review a stable reading version. {sharingEnabled ? 'Snapshot creation is private; guest sharing requires a separate explicit action below.' : 'This is local-only, not Internet sharing.'} Draft edits never change an existing snapshot.</p>
    {loading && <p role="status">Loading chapters…</p>}
    {error && <p role="alert">{error}</p>}
    <p role="status">{status}</p>
    <button onClick={() => { setLoading(true); setAttempt(value => value + 1) }} disabled={busy}>Reload chapters & snapshots</button>
    {!loading && !chapters.length && !error && <p>No chapters yet.</p>}
    <form onSubmit={event => { event.preventDefault(); if (!newName.trim()) return; void operation(async () => { const created = await client.createChapter(newName); setChapters(items => [...items, created]); setSelectedId(created.id); setNewName(''); setStatus('Chapter created.') }) }}>
      <label>New chapter name<input value={newName} onChange={event => setNewName(event.target.value)} disabled={busy} /></label>
      <button disabled={busy || !newName.trim()}>Create chapter</button>
    </form>
    {chapter && <>
      <label>Selected chapter<select value={selectedId} disabled={busy} onChange={event => { setSelectedId(event.target.value); setReviewed(false); setReading(undefined) }}>{chapters.map(item => <option key={item.id} value={item.id}>{drafts[item.id]?.name ?? item.name}</option>)}</select></label>
      <fieldset disabled={busy}><legend>Chapter order</legend>
        <label>Chapter name<input value={chapter.name} onChange={event => edit({ ...chapter, name: event.target.value })} /></label>
        <label>Existing page<select value={pageId} onChange={event => setPageId(event.target.value)}><option value="">Choose a saved page</option>{projects.map(project => <option key={project.id} value={project.id}>{project.name}</option>)}</select></label>
        <button disabled={!pageId || chapter.pageIds.includes(pageId)} onClick={() => edit({ ...chapter, pageIds: [...chapter.pageIds, pageId] })}>Add page to chapter</button>
        <ol aria-label="Chapter page order">{chapter.pageIds.map((id, index) => {
          const name = projects.find(project => project.id === id)?.name ?? 'Missing page'
          return <li key={id}><span>{name}</span><div className="local-toolbar"><button aria-label={`Move ${name} up`} disabled={index === 0} onClick={() => reorder(index, -1)}>Move up</button>
            <button aria-label={`Move ${name} down`} disabled={index === chapter.pageIds.length - 1} onClick={() => reorder(index, 1)}>Move down</button><button aria-label={`Remove ${name} from chapter`} onClick={() => edit({ ...chapter, pageIds: chapter.pageIds.filter(value => value !== id) })}>Remove</button></div></li>
        })}</ol>
        <button onClick={() => void operation(async () => { await saveChapter(chapter); setStatus('Chapter saved.') })}>Save chapter</button>
        <button disabled={!chapter.pageIds.length} onClick={() => setReading(READING.PRIVATE)}>Read private chapter</button>
      </fieldset>
      {sharingEnabled && snapshot && <SharePanel key={`${snapshot.id}:${snapshot.revision}`} snapshot={snapshot} />}
      <fieldset disabled={busy}><legend>Reviewed local reading version</legend>
        <label><input type="checkbox" checked={reviewed} onChange={event => setReviewed(event.target.checked)} />I reviewed every rendered page and its static fallback.</label>
        <button disabled={!reviewed || !chapter.pageIds.length} onClick={() => void operation(async () => {
          const current = drafts[chapter.id] ? await saveChapter(chapter) : chapter
          const published = await client.publish(current, snapshot)
          setSnapshots(items => [published, ...items.filter(item => item.id !== published.id)])
          setReviewed(false)
          setStatus(snapshot ? 'Local reading snapshot replaced.' : 'Local reading snapshot created.')
        })}>{snapshot ? 'Replace local reading snapshot' : 'Create local reading snapshot'}</button>
        {snapshot && <><button onClick={() => setReading(READING.SNAPSHOT)}>Read local snapshot</button><button onClick={() => void operation(async () => { await client.unpublish(snapshot); setSnapshots(items => items.filter(item => item.id !== snapshot.id)); setReading(undefined); setReviewed(false); setStatus('Local reading snapshot unpublished.') })}>Unpublish local snapshot</button></>}
      </fieldset>
      {reading === READING.PRIVATE && <ChapterReader key={`${chapter.id}:private:${chapter.pageIds.join(',')}`} name={chapter.name} pageIds={chapter.pageIds} projects={projects} client={client} />}
      {reading === READING.SNAPSHOT && snapshot && <ChapterReader key={`${snapshot.id}:${snapshot.revision}`} name={snapshot.name} pageIds={snapshot.pages.map(page => page.projectId)} projects={projects} snapshot={snapshot} client={client} />}
    </>}
  </section>
}
