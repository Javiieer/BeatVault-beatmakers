import { describe, expect, it } from 'vitest'
import { AuditLog, csrfMatches, RateLimiter } from './security'
describe('security primitives', () => {
  it('limits requests and can be cleared', () => { const limiter = new RateLimiter(1, 60000); expect(limiter.allow('x')).toBe(true); expect(limiter.allow('x')).toBe(false); limiter.clear(); expect(limiter.allow('x')).toBe(true) })
  it('requires an exact CSRF token', () => { expect(csrfMatches('secret', 'wrong')).toBe(false); expect(csrfMatches('secret', 'secret')).toBe(true) })
  it('keeps audit entries free of credentials', () => { const log = new AuditLog(); log.record('login_failure', 'request-1'); expect(JSON.stringify(log.entries)).not.toContain('password'); expect(JSON.stringify(log.entries)).not.toContain('token') })
})
