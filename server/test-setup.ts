import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const root = await mkdtemp(join(tmpdir(), 'beatvault-vitest-'))
process.env.NODE_ENV = 'test'
process.env.BEATVAULT_STORAGE_BACKEND = 'json'
process.env.BEATVAULT_DATA_DIR = join(root, 'data')
process.env.BEATVAULT_UPLOAD_DIR = join(root, 'uploads')
delete process.env.DATABASE_URL
delete process.env.BEATVAULT_DATABASE_URL

process.once('beforeExit', async () => { await rm(root, { recursive: true, force: true }) })
