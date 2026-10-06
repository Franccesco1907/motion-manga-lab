import react from '@vitejs/plugin-react'
import { defaultExclude, defineConfig } from 'vitest/config'
import { localProjectsPlugin } from './scripts/local-projects/vite-plugin.ts'

export default defineConfig({
  plugins: [react(), localProjectsPlugin()],
  test: {
    exclude: [...defaultExclude, 'experiments/**'],
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
  },
})
