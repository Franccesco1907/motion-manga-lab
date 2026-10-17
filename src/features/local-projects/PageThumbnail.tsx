import { useEffect, useState } from 'react'
import type { LocalProject } from './contracts'
import type { LocalProjectClient } from './local-project-client'

interface PageThumbnailProps { project: LocalProject; client: LocalProjectClient }
interface Thumbnail { url: string; ready: boolean; failed: boolean; projectId: string; client: LocalProjectClient }

export function PageThumbnail({ project, client }: PageThumbnailProps) {
  const [stored, setThumbnail] = useState<Thumbnail>()
  const thumbnail = stored?.projectId === project.id && stored.client === client ? stored : undefined
  useEffect(() => {
    const controller = new AbortController()
    let url = ''
    void client.original(project.id, controller.signal).then(blob => {
      if (controller.signal.aborted) return
      url = URL.createObjectURL(blob)
      setThumbnail({ url, ready: false, failed: false, projectId: project.id, client })
    }).catch(() => {
      if (!controller.signal.aborted) setThumbnail({ url: '', ready: false, failed: true, projectId: project.id, client })
    })
    return () => { controller.abort(); if (url) URL.revokeObjectURL(url) }
  }, [client, project.id])

  return <span className="page-card__thumbnail" aria-hidden="true">
    {!thumbnail?.ready && <span className="page-card__placeholder">{thumbnail?.failed ? 'Preview unavailable' : 'Loading preview…'}</span>}
    {thumbnail?.url && !thumbnail.failed && <img src={thumbnail.url} alt="" hidden={!thumbnail.ready} width={project.width} height={project.height}
      onLoad={() => setThumbnail({ ...thumbnail, ready: true })}
      onError={() => setThumbnail({ ...thumbnail, ready: false, failed: true })} />}
  </span>
}
