import { createRepository } from './repository'
import { config } from './config'
import { AuditLog } from './security'
import { bootstrapAdmin } from './bootstrap'

const runtime = createRepository()
const audit = new AuditLog()
bootstrapAdmin(process.env, runtime.repository, audit, config)
  .then(result => {
    console.log(`Admin bootstrap: ${result.action} (${result.email})`)
    return runtime.close()
  })
  .catch(error => {
    console.error(error instanceof Error ? error.message : 'Admin bootstrap failed')
    return runtime.close().finally(() => process.exitCode = 1)
  })
