interface LocalPlaybackProps {
  name: string
  originalUrl: string
  loadVideo: (signal: AbortSignal) => Promise<Blob>
  staticLabel?: string
  autoPlayRequest?: string
  frameAspectRatio?: number
}

const BLOCKED_PLAYBACK = 'Playback was blocked. Use Play again; the static original remains available.'
async function tryPlayVideo(element: HTMLVideoElement | null): Promise<boolean> {
  try { if (!element) return false; await element.play(); return true }
  catch { return false }
}

export function LocalPlayback({ name, originalUrl, loadVideo, staticLabel = 'Static original', autoPlayRequest, frameAspectRatio }: LocalPlaybackProps) {
  const [reduced, setReduced] = useState(() => {
    try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches }
    catch { return true }
  })
  const [url, setUrl] = useState('')
  const [playing, setPlaying] = useState(false)
  const [started, setStarted] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const video = useRef<HTMLVideoElement | null>(null)
  const ownedUrl = useRef('')
  const active = useRef(true)
  const request = useRef<AbortController | undefined>(undefined)
  const reducedRef = useRef(reduced)
  const remainingPlays = useRef(0)
  const playbackGeneration = useRef(0)
  const consumedRequests = useRef(new Set<string>())

  useEffect(() => {
    active.current = true
    let media: MediaQueryList | undefined
    try { media = window.matchMedia('(prefers-reduced-motion: reduce)') } catch { /* Static fail-safe. */ }
    function changed(event: MediaQueryListEvent) {
      reducedRef.current = event.matches
      setReduced(event.matches)
      if (event.matches) { remainingPlays.current = 0; playbackGeneration.current++; video.current?.pause(); setPlaying(false); setStarted(false); request.current?.abort(); setLoading(false) }
    }
    media?.addEventListener('change', changed)
    return () => {
      active.current = false
      remainingPlays.current = 0
      request.current?.abort()
      media?.removeEventListener('change', changed)
      if (ownedUrl.current) URL.revokeObjectURL(ownedUrl.current)
      ownedUrl.current = ''
    }
  }, [])

  useEffect(() => {
    if (playing && url && !reduced) {
      const element = video.current, generation = playbackGeneration.current
      void tryPlayVideo(element).then(allowed => {
        if (!active.current || generation !== playbackGeneration.current) {
          if (allowed && (!active.current || remainingPlays.current === 0)) element?.pause()
          return
        }
        if (allowed) { setStarted(true); return }
        remainingPlays.current = 0
        setPlaying(false)
        setStarted(false)
        setError(BLOCKED_PLAYBACK)
      })
      return () => element?.pause()
    }
  }, [playing, url, reduced])

  async function resumeVideo(generation: number) {
    if (!await tryPlayVideo(video.current) && active.current && generation === playbackGeneration.current) {
      staticMode()
      setError(BLOCKED_PLAYBACK)
    }
  }

  async function play(restart = false, plays = 1, fresh = false) {
    if (reducedRef.current || (!fresh && loading)) return
    const generation = ++playbackGeneration.current
    remainingPlays.current = plays
    setError('')
    if (ownedUrl.current) {
      if (video.current && restart) video.current.currentTime = 0
      if (playing) await resumeVideo(generation)
      else setPlaying(true)
      return
    }
    const controller = new AbortController()
    request.current = controller
    setLoading(true)
    try {
      const blob = await loadVideo(controller.signal)
      if (!active.current || controller.signal.aborted || reducedRef.current || generation !== playbackGeneration.current) return
      const next = URL.createObjectURL(blob)
      ownedUrl.current = next
      setUrl(next)
      setPlaying(true)
    } catch (failure) {
      if (!active.current || controller.signal.aborted || generation !== playbackGeneration.current) return
      remainingPlays.current = 0
      setError(failure instanceof Error ? failure.message : 'Output could not be loaded. Retry Play explicitly.')
    } finally {
      if (active.current && !controller.signal.aborted) setLoading(false)
    }
  }

  function staticMode() { remainingPlays.current = 0; playbackGeneration.current++; request.current?.abort(); video.current?.pause(); setPlaying(false); setStarted(false); setLoading(false) }

  const beginAutomaticPlayback = useEffectEvent((intent: string) => {
    if (consumedRequests.current.has(intent)) return
    consumedRequests.current.add(intent)
    if (reducedRef.current) return
    staticMode()
    if (ownedUrl.current) URL.revokeObjectURL(ownedUrl.current)
    ownedUrl.current = ''
    setUrl('')
    void play(false, 1, true)
  })
  const cancelAutomaticPlayback = useEffectEvent(() => staticMode())

  useEffect(() => {
    if (!autoPlayRequest?.trim()) return
    let cancelled = false
    // Defer consumption until the committed effect survives StrictMode replay.
    queueMicrotask(() => { if (!cancelled) beginAutomaticPlayback(autoPlayRequest) })
    return () => { cancelled = true; cancelAutomaticPlayback() }
  }, [autoPlayRequest, originalUrl])

  function ended() {
    if (!active.current || reducedRef.current || remainingPlays.current <= 1) { staticMode(); return }
    remainingPlays.current--
    if (video.current) video.current.currentTime = 0
    void resumeVideo(playbackGeneration.current)
  }

  function mediaFailed() {
    staticMode()
    if (ownedUrl.current) URL.revokeObjectURL(ownedUrl.current)
    ownedUrl.current = ''
    setUrl('')
    setError('The animation could not be played. The static original remains available; retry Play explicitly.')
  }

  const feedback = <>
    <div className="local-toolbar" aria-label="Local reading controls">
      <button onClick={() => void play()} disabled={reduced || loading || (playing && !started)}>{loading ? 'Loading animation…' : 'Play'}</button>
      <button onClick={() => void play(true)} disabled={reduced || loading || (playing && !started)}>Restart</button>
      <button onClick={() => void play(true, 3)} disabled={reduced || loading || (playing && !started)}>Loop preview (3 plays)</button>
      <button onClick={staticMode}>Static</button>
    </div>
    <p>Loop preview plays the rendered clip 3 times, then returns to Static.</p>
    {reduced && <p>Reduced motion is enabled. Reading stays static.</p>}
    {error && <p role="alert">{error}</p>}
    {(loading || (playing && !started)) && <p role="status">{loading ? 'Loading animation; the static original remains visible.' : 'Starting animation; the static original remains visible.'}</p>}
    {!loading && !playing && !reduced && <p role="status">Showing the static original.</p>}
  </>
  const media = <>
    <img hidden={playing && started && !reduced} alt={`${staticLabel}: ${name}`} src={originalUrl} />
    {!reduced && <video ref={video} hidden={!playing || !started} src={url || undefined} controls muted playsInline preload="none"
      aria-label={`Animated page: ${name}`} onEnded={ended} onError={mediaFailed} />}
  </>
  const framed = frameAspectRatio !== undefined && Number.isFinite(frameAspectRatio) && frameAspectRatio > 0
  return <div className="local-playback">
    {framed ? <>
      <div className="local-playback__feedback">{feedback}</div>
      <div className="local-playback__media" style={{ aspectRatio: frameAspectRatio }}>{media}</div>
    </> : <>{feedback}{media}</>}
  </div>
}
import { useEffect, useEffectEvent, useRef, useState } from 'react'
