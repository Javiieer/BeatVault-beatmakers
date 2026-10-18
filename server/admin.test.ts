import { describe, expect, it } from 'vitest'
import { adminData, redactAccount } from './admin'

describe('admin redaction', () => {
  it('never exposes account credentials or token hashes', () => {
    const account = { id: 'a', email: 'a@test.local', passwordHash: 'secret-hash', role: 'admin' as const, verificationState: 'verified' as const, resetTokenHash: 'reset-secret' }
    expect(redactAccount(account)).toEqual({ id: 'a', email: 'a@test.local', role: 'admin', verificationState: 'verified', planId: 'free' })
    expect(JSON.stringify(adminData([account], [], [], []))).not.toContain('secret')
  })

  it('normalizes legacy accounts missing verification state', () => {
    const legacyAccount = { id: 'legacy', email: 'legacy@test.local', passwordHash: 'hash', role: 'creator' } as Parameters<typeof redactAccount>[0]
    expect(redactAccount(legacyAccount)).toEqual({ id: 'legacy', email: 'legacy@test.local', role: 'creator', verificationState: 'unverified', planId: 'free' })
  })
})
