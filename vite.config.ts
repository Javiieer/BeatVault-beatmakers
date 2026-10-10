import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: { proxy: { '/api': { target: process.env.BEATVAULT_API_PROXY || 'http://127.0.0.1:4174' } } },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts', './server/test-setup.ts'],
    pool: 'forks',
    maxWorkers: 2,
    include: ['src/**/*.{test,spec}.{ts,tsx}', 'server/**/*.{test,spec}.ts'],
    exclude: ['tests/**', 'node_modules/**'],
  },
})
