import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'

const workspaceRoot = fileURLToPath(new URL('.', import.meta.url)).replaceAll('\\', '/')
const privateFiles = ['.tools', 'data', 'backups', 'artifacts', 'logs'].map(directory => `${workspaceRoot}${directory}/**`)

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: { '/api': { target: process.env.BEATVAULT_API_PROXY || 'http://127.0.0.1:4174' } },
    // Local database files and credentials must never be served or watched as app assets.
    fs: { deny: ['.env', '.env.*', '*.{crt,pem}', '**/.git/**', ...privateFiles] },
    watch: { ignored: privateFiles },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts', './server/test-setup.ts'],
    pool: 'forks',
    // Media processing and JSON writes contend for disk on fresh Windows installs.
    maxWorkers: process.platform === 'win32' ? 1 : 2,
    include: ['src/**/*.{test,spec}.{ts,tsx}', 'server/**/*.{test,spec}.ts'],
    exclude: ['tests/**', 'node_modules/**'],
  },
})
