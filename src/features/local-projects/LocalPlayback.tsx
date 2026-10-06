interface LocalPlaybackProps {
  name: string
  originalUrl: string
  loadVideo: (signal: AbortSignal) => Promise<Blob>
  staticLabel?: string
}

export function LocalPlayback({ name, originalUrl, loadVideo, staticLabel = 'Static original' }: LocalPlaybackProps) {
  const [reduced, setReduced] = useState(() => {
    try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches }
    catch { return true }
  })
  const [url, setUrl] = useState('')
  const [playing, setPlaying] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const video = useRef<HTMLVideoElement | null>(null)
  const ownedUrl = useRef('')
  const active = useRef(true)
  const request = useRef<AbortController | undefined>(undefined)
  const reducedRef = useRef(reduced)

  useEffect(() => {
    active.current = true
    let media: MediaQueryList | undefined
    try { media = window.matchMedia('(prefers-reduced-motion: reduce)') } catch { /* Static fail-safe. */ }
    function changed(event: MediaQueryListEvent) {
      reducedRef.current = event.matches
      setReduced(event.matches)
      if (event.matches) { video.current?.pause(); setPlaying(false); request.current?.abort(); setLoading(false) }
    }
    media?.addEventListener('change', changed)
    return () => {
      active.current = false
      request.current?.abort()
      media?.removeEventListener('change', changed)
      if (ownedUrl.current) URL.revokeObjectURL(ownedUrl.current)
      ownedUrl.current = ''
    }
  }, [])

  useEffect(() => {
    if (playing && url && !reduced) {
      void video.current?.play().catch(() => {
        setPlaying(false)
        setError('Playback was blocked. Use Play again; the static original remains available.')
      })
    }
  }, [playing, url, reduced])

  async function play(restart = false) {
    if (reducedRef.current || loading) return
    setError('')
    if (ownedUrl.current) {
      if (video.current && restart) video.current.currentTime = 0
      if (playing) await video.current?.play()
      else setPlaying(true)
      return
    }
    const controller = new AbortController()
    request.current = controller
    setLoading(true)
    try {
      const blob = await loadVideo(controller.signal)
      if (!active.current || controller.signal.aborted || reducedRef.current) return
      const next = URL.createObjectURL(blob)
      ownedUrl.current = next
      setUrl(next)
      setPlaying(true)
    } catch (failure) {
      if (!active.current || controller.signal.aborted) return
      setError(failure instanceof Error ? failure.message : 'Output could not be loaded. Retry Play explicitly.')
    } finally {
      if (active.current && !controller.signal.aborted) setLoading(false)
    }
  }

  function staticMode() { request.current?.abort(); video.current?.pause(); setPlaying(false); setLoading(false) }

  function mediaFailed() {
    staticMode()
    if (ownedUrl.current) URL.revokeObjectURL(ownedUrl.current)
    ownedUrl.current = ''
    setUrl('')
    setError('The animation could not be played. The static original remains available; retry Play explicitly.')
  }

  return <div className="local-playback">
    <div className="local-toolbar" aria-label="Local reading controls">
      <button onClick={() => void play()} disabled={reduced || loading}>{loading ? 'Loading animation…' : 'Play'}</button>
      <button onClick={() => void play(true)} disabled={reduced || loading}>Restart</button>
      <button onClick={staticMode}>Static</button>
    </div>
    {reduced && <p>Reduced motion is enabled. Reading stays static.</p>}
    {error && <p role="alert">{error}</p>}
    <img hidden={playing && !reduced} alt={`${staticLabel}: ${name}`} src={originalUrl} />
    {!reduced && <video ref={video} hidden={!playing} src={url || undefined} controls muted playsInline preload="none"
      aria-label={`Animated page: ${name}`} onEnded={staticMode} onError={mediaFailed} />}
  </div>
}
import { useEffect, useRef, useState } from 'react'
