import { Pool } from 'pg'
import { createRepository } from './repository'
import { config } from './config'
import { AuditLog } from './security'
import { bootstrapAdmin } from './bootstrap'
import { ProductionAdminOperationError, runProductionAdminOperation } from './production-admin'

async function main(): Promise<void> {
  if (config.environment === 'production') {
    if (!config.database.url) throw new ProductionAdminOperationError('ADMIN_OPERATION_DATABASE_REQUIRED')
    const pool = new Pool({ connectionString: config.database.url, max: 2, connectionTimeoutMillis: config.database.connectionTimeoutMs })
    try {
      const result = await runProductionAdminOperation(process.argv[2], process.env, pool)
      console.log(`Admin operation: ${result.action} (${result.email})`)
    } finally {
      await pool.end()
    }
    return
  }

  if (process.argv[2]) throw new ProductionAdminOperationError('ADMIN_PRODUCTION_OPERATION_REQUIRES_PRODUCTION')
  const runtime = createRepository()
  const audit = new AuditLog(runtime.auditStore)
  try {
    await audit.initialize()
    const result = await bootstrapAdmin(process.env, runtime.repository, audit, config)
    console.log(`Admin bootstrap: ${result.action} (${result.email})`)
  } finally {
    await runtime.close()
  }
}

main().catch(error => {
  const message = error instanceof ProductionAdminOperationError
    ? error.code
    : error instanceof Error ? error.message : 'Admin bootstrap failed'
  console.error(message)
  process.exitCode = 1
})
