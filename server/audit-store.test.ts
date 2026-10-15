import { describe, expect, it } from 'vitest'
import { JsonAuditStore, PostgresAuditStore } from './audit-store'
import { AuditLog, redactMetadata, type AuditEvent } from './security'

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
  it('keeps pending review events visible while an earlier audit write refreshes storage', async () => {
    const events: AuditEvent[] = []
    let releaseFirstWrite: () => void = () => {}
    let writes = 0
    const firstWrite = new Promise<void>(resolve => { releaseFirstWrite = resolve })
    const store = {
      list: async () => events.slice(),
      append: async (event: AuditEvent) => { writes++; if (writes === 1) await firstWrite; events.push(event) },
    }
    const log = new AuditLog(store)
    await log.initialize()
    log.record('create', 'pending-write')
    const recommendation = log.recordAndWait('marketplace_review_recommendation', 'review-write', 'manager', 'listing', true, { decision: 'recommend' })
    releaseFirstWrite()
    await recommendation
    expect(log.entries.map(event => event.action)).toEqual(['create', 'marketplace_review_recommendation'])
    expect(events).toHaveLength(2)
  })
  it('normalizes PostgreSQL timestamps without dropping review-order milliseconds', async () => {
    const timestamp = new Date('2026-10-14T20:39:15.907Z')
    const row = { id: 'event-1', timestamp, action: 'marketplace_review_recommendation' as const, requestId: 'request-1', actorId: 'manager-1', targetId: 'listing-1', success: true, metadata: { decision: 'recommend' } }
    const store = new PostgresAuditStore({ query: async <Row>() => ({ rows: [row as unknown as Row] }) })
    const [event] = await store.list()
    expect(event.timestamp).toBe('2026-10-14T20:39:15.907Z')
    expect(Date.parse(event.timestamp)).toBe(timestamp.getTime())
  })
})
