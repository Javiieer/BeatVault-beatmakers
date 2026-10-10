import { describe, expect, it } from 'vitest'
import { JsonAuditStore } from './audit-store'
import { AuditLog, redactMetadata } from './security'

describe('persistent audit', () => {
  it('redacts sensitive keys and long values', () => {
    expect(redactMetadata({ password: 'x', csrfToken: 'y', body: 'full body', safe: 'ok', long: 'x'.repeat(161) })).toEqual({ safe: 'ok' })
  })
  it('loads and retains events through a JSON store', async () => {
    let value: unknown[] = []
    const store = new JsonAuditStore({ read: async <T>(fallback: T) => { void fallback; return value as T }, write: async <T>(next: T) => { value = next as unknown[] } })
    const log = new AuditLog(store)
    await log.initialize()
    log.record('create', 'request-1', 'actor-1', 'target-1', true, { password: 'never' })
    await new Promise(resolve => setTimeout(resolve, 0))
    const loaded = await store.list()
    expect(loaded).toHaveLength(1)
    expect(loaded[0].metadata).toEqual({})
    const restarted = new AuditLog(store)
    await restarted.initialize()
    expect(restarted.entries).toHaveLength(1)
  })
})
