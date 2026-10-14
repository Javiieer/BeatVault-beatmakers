import { describe, expect, it } from 'vitest'
import { AuditLog, clientAddress, csrfMatches, RateLimiter } from './security'
describe('security primitives', () => {
  it('limits requests and can be cleared', () => { const limiter = new RateLimiter(1, 60000); expect(limiter.allow('x')).toBe(true); expect(limiter.allow('x')).toBe(false); limiter.clear(); expect(limiter.allow('x')).toBe(true) })
  it('uses proxy client IP only when trusted and valid', () => {
    const request = { headers: { 'x-beatvault-client-ip': '203.0.113.7' }, socket: { remoteAddress: '172.20.0.5' } } as unknown as Parameters<typeof clientAddress>[0]
    expect(clientAddress(request, false)).toBe('172.20.0.5')
    expect(clientAddress(request, true)).toBe('203.0.113.7')
    expect(clientAddress({ ...request, headers: { 'x-beatvault-client-ip': 'spoofed' } }, true)).toBe('172.20.0.5')
  })
  it('isolates login rate-limit buckets by visitor behind a shared proxy', () => {
    const limiter = new RateLimiter(1, 60000)
    const proxy = '172.20.0.5'
    const addressFor = (address: string) => clientAddress({ headers: { 'x-beatvault-client-ip': address }, socket: { remoteAddress: proxy } } as unknown as Parameters<typeof clientAddress>[0], true)
    const firstVisitor = addressFor('203.0.113.7')
    const secondVisitor = addressFor('203.0.113.8')
    expect(limiter.allow(`login:${firstVisitor}`)).toBe(true)
    expect(limiter.allow(`login:${firstVisitor}`)).toBe(false)
    expect(limiter.allow(`login:${secondVisitor}`)).toBe(true)
  })
  it('requires an exact CSRF token', () => { expect(csrfMatches('secret', 'wrong')).toBe(false); expect(csrfMatches('secret', 'secret')).toBe(true) })
  it('keeps audit entries free of credentials', () => { const log = new AuditLog(); log.record('login_failure', 'request-1'); expect(JSON.stringify(log.entries)).not.toContain('password'); expect(JSON.stringify(log.entries)).not.toContain('token') })
})
