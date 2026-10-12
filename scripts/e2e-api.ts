import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { randomBytes } from 'node:crypto'
import { e2eAdmin } from './e2e-admin'

const directory = await mkdtemp(join(tmpdir(), 'beatvault-e2e-'))
Object.assign(process.env, {
  NODE_ENV: 'test', BEATVAULT_STORAGE_BACKEND: 'json',
  BEATVAULT_DATA_DIR: join(directory, 'data'), BEATVAULT_UPLOAD_DIR: join(directory, 'uploads'),
  BEATVAULT_DEMO_ENABLED: 'false', BEATVAULT_RATE_LIMIT: '100',
  BEATVAULT_CORS_ORIGINS: 'http://127.0.0.1:5187',
})
const { server, auth, audit } = await import('../server/index')
await auth.initialize()
await audit.initialize()
const [{ createRepository }, { bootstrapAdmin }, { config }] = await Promise.all([
  import('../server/repository'), import('../server/bootstrap'), import('../server/config'),
])
const adminRuntime = createRepository()
await bootstrapAdmin({
  ...process.env,
  BEATVAULT_ADMIN_EMAIL: e2eAdmin.email,
  BEATVAULT_ADMIN_PASSWORD: e2eAdmin.password,
  BEATVAULT_ADMIN_BOOTSTRAP_TOKEN: randomBytes(32).toString('base64url'),
}, adminRuntime.repository, audit, config)
await adminRuntime.close()
server.listen(45174, '127.0.0.1')
const close = () => {
  auth.clearSessions()
  server.close(() => { void rm(directory, { recursive: true, force: true }).then(() => process.exit(0)) })
  server.closeAllConnections()
}
process.once('SIGTERM', close)
process.once('SIGINT', close)
