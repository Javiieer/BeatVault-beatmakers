import { describe, expect, it } from 'vitest'
import { hashPassword, verifyPassword } from './auth'
describe('password crypto', () => {
 it('hashes and verifies without storing plaintext', async () => { const hash = await hashPassword('a sufficiently long password'); expect(hash).not.toContain('a sufficiently long password'); expect(await verifyPassword('a sufficiently long password', hash)).toBe(true); expect(await verifyPassword('wrong password', hash)).toBe(false) })
 it('rejects malformed hashes', async () => { expect(await verifyPassword('password', 'not-a-hash')).toBe(false) })
})
