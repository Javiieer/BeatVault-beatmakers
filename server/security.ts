import { randomUUID, timingSafeEqual } from 'node:crypto'
import { isIP } from 'node:net'
import type { IncomingMessage } from 'node:http'
import type { ServerConfig } from './config'
export type Role = 'admin' | 'creator' | 'community_manager'
export type AuditAction = 'login_success' | 'login_failure' | 'logout' | 'create' | 'update' | 'delete' | 'admin_bootstrap' | 'admin_read' | 'marketplace_review_recommendation' | 'marketplace_admin_decision' | 'catalog_community_decision' | 'catalog_admin_decision'
export type SafeMetadata = Readonly<Record<string, string | number | boolean | null>>
export type AuditEvent = { id: string; timestamp: string; action: AuditAction; requestId: string; actorId?: string; targetId?: string; success: boolean; metadata: SafeMetadata }
export const clientAddress = (request: Pick<IncomingMessage, 'headers' | 'socket'>, trustProxyHeader = false): string => {
  const remoteAddress = request.socket.remoteAddress || 'unknown'
  const forwardedAddress = request.headers['x-beatvault-client-ip']
  if (!trustProxyHeader || typeof forwardedAddress !== 'string') return remoteAddress
  const candidate = forwardedAddress.trim()
  return isIP(candidate) ? candidate : remoteAddress
}
export class RateLimiter {
  private readonly hits = new Map<string, number[]>()
  private nextPruneAt = 0
  constructor(private readonly limitOrConfig: number | ServerConfig = 5, private readonly configuredWindowMs = 60000) {}
  private get limit(): number { return typeof this.limitOrConfig === 'number' ? this.limitOrConfig : this.limitOrConfig.rateLimit.limit }
  private get windowMs(): number { return typeof this.limitOrConfig === 'number' ? this.configuredWindowMs : this.limitOrConfig.rateLimit.windowMs }
  allow(key: string): boolean {
    const now = Date.now()
    if (now >= this.nextPruneAt) {
      for (const [trackedKey, times] of this.hits) {
        const active = times.filter(time => now - time < this.windowMs)
        if (active.length) this.hits.set(trackedKey, active)
        else this.hits.delete(trackedKey)
      }
      this.nextPruneAt = now + Math.max(1000, Math.min(this.windowMs, 60000))
    }
    const valid = (this.hits.get(key) || []).filter(time => now - time < this.windowMs)
    if (valid.length >= this.limit) { this.hits.set(key, valid); return false }
    valid.push(now)
    this.hits.set(key, valid)
    return true
  }
  clear(): void { this.hits.clear(); this.nextPruneAt = 0 }
}
export class ConcurrencyLimiter {
  private readonly active = new Map<string, number>()
  constructor(private readonly perKeyLimit: number) {
    if (!Number.isSafeInteger(perKeyLimit) || perKeyLimit < 1) throw new Error('INVALID_CONCURRENCY_LIMIT')
  }
  acquire(key: string): (() => void) | undefined {
    const current = this.active.get(key) ?? 0
    if (current >= this.perKeyLimit) return undefined
    this.active.set(key, current + 1)
    let released = false
    return () => {
      if (released) return
      released = true
      const remaining = (this.active.get(key) ?? 1) - 1
      if (remaining <= 0) this.active.delete(key)
      else this.active.set(key, remaining)
    }
  }
}
export const csrfMatches = (expected: string | undefined, supplied: string | undefined): boolean => { if (!expected || !supplied) return false; const a = Buffer.from(expected); const b = Buffer.from(supplied); return a.length === b.length && timingSafeEqual(a, b) }
export class AuditLog {
  private entriesValue: AuditEvent[] = []
  private queue: Promise<void> = Promise.resolve()
  constructor(private readonly store?: AuditStore) {}
  get entries(): readonly AuditEvent[] { return this.entriesValue }
  async initialize(): Promise<void> { this.entriesValue = this.store ? await this.store.list() : [] }
  private event(action: AuditAction, requestId: string, actorId?: string, targetId?: string, success = true, metadata: SafeMetadata = {}): AuditEvent {
    const event: AuditEvent = { id: randomUUID(), timestamp: new Date().toISOString(), action, requestId, success, metadata: redactMetadata(metadata), ...(actorId ? { actorId } : {}), ...(targetId ? { targetId } : {}) }
    return event
  }
  private persist(event: AuditEvent): Promise<void> {
    const writing = this.queue.then(async () => {
      await this.store?.append(event)
      if (!this.store) { this.entriesValue = this.entriesValue.slice(-500); return }
      const persisted = await this.store.list()
      const persistedIds = new Set(persisted.map(item => item.id))
      const pending = this.entriesValue.filter(item => !persistedIds.has(item.id))
      this.entriesValue = [...persisted, ...pending].sort((left, right) => Date.parse(String(left.timestamp)) - Date.parse(String(right.timestamp)))
    })
    this.queue = writing.catch(() => undefined)
    return writing
  }
  record(action: AuditAction, requestId: string, actorId?: string, targetId?: string, success = true, metadata: SafeMetadata = {}): void {
    const event = this.event(action, requestId, actorId, targetId, success, metadata)
    this.entriesValue.push(event)
    void this.persist(event).catch(() => undefined)
  }
  async recordAndWait(action: AuditAction, requestId: string, actorId?: string, targetId?: string, success = true, metadata: SafeMetadata = {}): Promise<void> {
    const event = this.event(action, requestId, actorId, targetId, success, metadata)
    this.entriesValue.push(event)
    try { await this.persist(event) }
    catch (error) {
      this.entriesValue = this.entriesValue.filter(item => item.id !== event.id)
      throw error
    }
  }
  clear(): void { this.entriesValue.length = 0 }
}
export interface AuditStore { list(): Promise<AuditEvent[]>; append(event: AuditEvent): Promise<void> }
const forbidden = /password|passphrase|token|secret|cookie|csrf|authorization|body|provider/i
export const redactMetadata = (metadata: SafeMetadata): SafeMetadata => Object.fromEntries(Object.entries(metadata).filter(([key, value]) => !forbidden.test(key) && (typeof value !== 'string' || value.length <= 160)))
