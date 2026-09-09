import { timingSafeEqual } from 'node:crypto'
import type { ServerConfig } from './config'
export type Role = 'admin' | 'creator'
export type AuditEvent = 'login_success' | 'login_failure' | 'logout' | 'create' | 'update' | 'delete'
export type AuditEntry = { event: AuditEvent; actorId?: string; requestId: string; at: string }
export class RateLimiter {
  private readonly hits = new Map<string, number[]>()
  constructor(private readonly limitOrConfig: number | ServerConfig = 5, private readonly configuredWindowMs = 60000) {}
  private get limit(): number { return typeof this.limitOrConfig === 'number' ? this.limitOrConfig : this.limitOrConfig.rateLimit.limit }
  private get windowMs(): number { return typeof this.limitOrConfig === 'number' ? this.configuredWindowMs : this.limitOrConfig.rateLimit.windowMs }
  allow(key: string): boolean { const now = Date.now(); const valid = (this.hits.get(key) || []).filter(time => now - time < this.windowMs); if (valid.length >= this.limit) { this.hits.set(key, valid); return false }; valid.push(now); this.hits.set(key, valid); return true }
  clear(): void { this.hits.clear() }
}
export const csrfMatches = (expected: string | undefined, supplied: string | undefined): boolean => { if (!expected || !supplied) return false; const a = Buffer.from(expected); const b = Buffer.from(supplied); return a.length === b.length && timingSafeEqual(a, b) }
export class AuditLog {
  readonly entries: AuditEntry[] = []
  record(event: AuditEvent, requestId: string, actorId?: string): void { this.entries.push({ event, requestId, ...(actorId ? { actorId } : {}), at: new Date().toISOString() }); if (this.entries.length > 500) this.entries.shift() }
  clear(): void { this.entries.length = 0 }
}
