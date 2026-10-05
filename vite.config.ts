import react from '@vitejs/plugin-react'
import { defaultExclude, defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [react()],
  test: {
    exclude: [...defaultExclude, 'experiments/**'],
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
  },
})
