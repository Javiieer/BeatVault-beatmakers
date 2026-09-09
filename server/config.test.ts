import { describe, expect, it } from 'vitest'
import { isAllowedOrigin, loadConfig } from './config'

describe('server config', () => {
  it('uses safe local defaults', () => {
    const value = loadConfig({})
    expect(value.port).toBe(4174)
    expect(value.corsOrigins).toEqual(['http://localhost:5173'])
    expect(value.cookie).toEqual({ secure: false, sameSite: 'Lax' })
  })
  it('parses allowlists and rejects invalid values', () => {
    expect(loadConfig({ BEATVAULT_CORS_ORIGINS: 'https://a.test, https://b.test' }).corsOrigins).toEqual(['https://a.test', 'https://b.test'])
    expect(() => loadConfig({ BEATVAULT_PORT: 'nope' })).toThrow('BEATVAULT_PORT')
    expect(() => loadConfig({ BEATVAULT_COOKIE_SAMESITE: 'None' })).toThrow('SameSite=None')
  })
  it('only allows configured origins', () => {
    expect(isAllowedOrigin('https://allowed.test', ['https://allowed.test'])).toBe(true)
    expect(isAllowedOrigin('https://other.test', ['https://allowed.test'])).toBe(false)
    expect(isAllowedOrigin(undefined, ['https://allowed.test'])).toBe(true)
  })
})
