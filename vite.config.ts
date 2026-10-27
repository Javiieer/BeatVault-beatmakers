import { defineConfig } from 'vitest/config'
import { loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'
import { publicTunnelViteOptions } from './server/public-tunnel.js'

const workspaceRoot = fileURLToPath(new URL('.', import.meta.url)).replaceAll('\\', '/')
const privateFiles = ['.tools', 'data', 'backups', 'artifacts', 'logs'].map(directory => `${workspaceRoot}${directory}/**`)

export default defineConfig(({ mode }) => {
  // Only public routing values are loaded here; MP credentials stay API-side.
  const localEnv = loadEnv(mode, process.cwd(), ['BEATVAULT_PUBLIC_URL', 'BEATVAULT_API_PROXY'])
  const tunnel = publicTunnelViteOptions(localEnv.BEATVAULT_PUBLIC_URL || process.env.BEATVAULT_PUBLIC_URL)
  return {
    plugins: [react()],
    server: {
      ...(tunnel ? { allowedHosts: tunnel.allowedHosts, cors: { origin: tunnel.corsOrigins } } : {}),
      proxy: { '/api': { target: localEnv.BEATVAULT_API_PROXY || process.env.BEATVAULT_API_PROXY || 'http://127.0.0.1:4174' } },
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
  }
})
