import { randomUUID } from 'node:crypto'
import { config } from './config'
import { JsonStore } from './store'
import type { AuditEvent, AuditStore } from './security'
import type { SqlClient } from './postgres'

const valid = (value: unknown): value is AuditEvent => {
  if (!value || typeof value !== 'object') return false
  const item = value as Partial<AuditEvent>
  return typeof item.id === 'string' && typeof item.timestamp === 'string' && typeof item.action === 'string' && typeof item.requestId === 'string' && typeof item.success === 'boolean' && !!item.metadata && typeof item.metadata === 'object'
}
export class JsonAuditStore implements AuditStore {
  constructor(private readonly store: Pick<JsonStore, 'read' | 'write'> & Partial<Pick<JsonStore, 'update'>> = new JsonStore(`${config.dataDirectory}/audit.json`)) {}
  async list(): Promise<AuditEvent[]> { const cutoff = Date.now() - config.audit.retentionDays * 86400000; const events = await this.store.read<AuditEvent[]>([], valid); return events.filter(item => Date.parse(item.timestamp) >= cutoff).slice(-config.audit.maxEntries) }
  async append(event: AuditEvent): Promise<void> {
    if (this.store.update) {
      const cutoff = Date.now() - config.audit.retentionDays * 86400000
      await this.store.update<AuditEvent[], void>([], valid, items => ({ value: items.filter(item => Date.parse(item.timestamp) >= cutoff && item.id !== event.id).concat(event).slice(-config.audit.maxEntries), result: undefined }))
    } else { const events = (await this.list()).filter(item => item.id !== event.id).concat(event).slice(-config.audit.maxEntries); await this.store.write(events) }
  }
}
export class PostgresAuditStore implements AuditStore {
  constructor(private readonly db: SqlClient) {}
  async list(): Promise<AuditEvent[]> {
    const result = await this.db.query<Omit<AuditEvent, 'timestamp'> & { timestamp: string | Date }>('SELECT id, timestamp, action, request_id AS "requestId", actor_id AS "actorId", target_id AS "targetId", success, metadata FROM audit_events WHERE timestamp >= NOW() - ($1 * INTERVAL \'1 day\') ORDER BY timestamp DESC LIMIT $2', [config.audit.retentionDays, config.audit.maxEntries])
    return result.rows.reverse().map(event => ({ ...event, timestamp: event.timestamp instanceof Date ? event.timestamp.toISOString() : event.timestamp }))
  }
  async append(event: AuditEvent): Promise<void> { await this.db.query('INSERT INTO audit_events (id, timestamp, action, request_id, actor_id, target_id, success, metadata) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)', [event.id || randomUUID(), event.timestamp, event.action, event.requestId, event.actorId ?? null, event.targetId ?? null, event.success, JSON.stringify(event.metadata)]) }
}
