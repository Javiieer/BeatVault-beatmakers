import { describe, expect, it } from 'vitest'
import { isAllowedOrigin, loadConfig } from './config'

describe('server config', () => {
  it('uses safe local defaults', () => {
    const value = loadConfig({})
    expect(value.port).toBe(4174)
    expect(value.corsOrigins).toEqual(['http://localhost:5173', 'http://127.0.0.1:5187', 'http://127.0.0.1:5188'])
    expect(value.cookie).toEqual({ secure: false, sameSite: 'Lax' })
  })
  it('parses allowlists and rejects invalid values', () => {
    expect(loadConfig({ BEATVAULT_CORS_ORIGINS: 'https://a.test, https://b.test' }).corsOrigins).toEqual(['https://a.test', 'https://b.test'])
    expect(() => loadConfig({ BEATVAULT_PORT: 'nope' })).toThrow('BEATVAULT_PORT')
    expect(() => loadConfig({ BEATVAULT_COOKIE_SAMESITE: 'None' })).toThrow('SameSite=None')
  })
  it('fails closed on incomplete or unsafe production settings', () => {
    const production = {
      NODE_ENV: 'production',
      BEATVAULT_COOKIE_SECURE: 'true',
      BEATVAULT_CORS_ORIGINS: 'https://beatvault.example',
      BEATVAULT_STORAGE_BACKEND: 'postgres',
      DATABASE_URL: 'postgresql://beatvault:secret@db/beatvault',
    }
    expect(loadConfig(production).storageBackend).toBe('postgres')
    expect(() => loadConfig({ NODE_ENV: 'production' })).toThrow('allowlist CORS explícita')
    expect(() => loadConfig({ ...production, BEATVAULT_DEMO_ENABLED: 'true' })).toThrow('desactivadas en producción')
    expect(() => loadConfig({ ...production, BEATVAULT_CORS_ORIGINS: 'http://localhost:5173' })).toThrow('allowlist CORS explícita')
    expect(() => loadConfig({ ...production, BEATVAULT_STORAGE_BACKEND: 'json' })).toThrow('PostgreSQL')
  })
  it('only allows configured origins', () => {
    expect(isAllowedOrigin('https://allowed.test', ['https://allowed.test'])).toBe(true)
    expect(isAllowedOrigin('https://other.test', ['https://allowed.test'])).toBe(false)
    expect(isAllowedOrigin(undefined, ['https://allowed.test'])).toBe(true)
  })
})
