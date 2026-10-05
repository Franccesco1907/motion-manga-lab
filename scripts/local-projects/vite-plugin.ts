import { homedir } from 'node:os'
import { isAbsolute, join, relative, resolve } from 'node:path'
import type { Plugin } from 'vite'
import { createLocalProjectsHandler } from './http.ts'
import { LocalProjectStore } from './store.ts'
import { LocalRenderService } from './render-service.ts'
import { LocalAssistanceService } from './assistance.ts'
import { createWorkingSource } from './working-source.ts'

export function assertLoopbackHost(host: unknown) {
  if (host !== undefined && !['127.0.0.1', 'localhost', '::1'].includes(String(host))) {
    throw new Error('Local projects require a loopback-only Vite server host.')
  }
}

export function localProjectsPlugin(): Plugin {
  const root = join(homedir(), '.local', 'share', 'motion-manga-lab', 'local-projects-v1')
  return {
    name: 'local-original-projects',
    apply: (_config, environment) => environment.command === 'serve' && !environment.isPreview,
    config(config) {
      assertLoopbackHost(config.server?.host)
      return { server: { host: config.server?.host ?? '127.0.0.1', fs: { strict: true } } }
    },
    configResolved(config) {
      assertLoopbackHost(config.server.host)
      for (const allowed of [config.root, config.publicDir, ...config.server.fs.allow]) {
        if (!allowed) continue
        const path = relative(resolve(allowed), root)
        if (path === '' || (!path.startsWith('..') && !isAbsolute(path))) throw new Error('Local project storage must remain outside Vite serving paths.')
      }
    },
    configureServer(server) {
      const assistance = new LocalAssistanceService(root)
      const renderer = new LocalRenderService(root, { readMask: (projectId, maskId, sourceVersion) => assistance.readMask(projectId, maskId, sourceVersion) })
      const handler = createLocalProjectsHandler(new LocalProjectStore(root), { renderer, assistance, workingSource: createWorkingSource })
      server.httpServer?.once('close', () => { void Promise.all([renderer.shutdown(), assistance.shutdown()]) })
      server.middlewares.use((req, res, next) => {
        if (req.url === '/api/local-projects' || req.url?.startsWith('/api/local-projects/')) void handler(req, res)
        else next()
      })
    },
  }
}
