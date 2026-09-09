import { Pool } from 'pg'
import { config } from './config'
import { LocalRepository, type ServerRepository } from './store'
import { PostgresRepository } from './postgres'
export type RepositoryRuntime = { repository: ServerRepository; close: () => Promise<void>; checkDatabase: () => Promise<boolean> }
export const createRepository = (): RepositoryRuntime => {
  if (config.storageBackend === 'json') return { repository: new LocalRepository(), close: async () => undefined, checkDatabase: async () => true }
  if (!config.database.url) throw new Error('PostgreSQL requiere DATABASE_URL o BEATVAULT_DATABASE_URL.')
  const pool = new Pool({ connectionString: config.database.url, max: config.database.maxConnections, idleTimeoutMillis: config.database.idleTimeoutMs, connectionTimeoutMillis: config.database.connectionTimeoutMs })
  return { repository: new PostgresRepository(pool), close: () => pool.end(), checkDatabase: async () => { try { await pool.query('SELECT 1'); return true } catch { return false } } }
}
