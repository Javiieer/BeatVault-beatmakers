import { describe, expect, it } from 'vitest'
import { isAllowedOrigin, loadConfig } from './config'

describe('server config', () => {
  it('uses safe local defaults', () => {
    const value = loadConfig({})
    expect(value.port).toBe(4174)
    expect(value.corsOrigins).toEqual(['http://localhost:5173', 'http://127.0.0.1:5187', 'http://127.0.0.1:5188'])
    expect(value.trustProxyHeaders).toBe(false)
    expect(value.cookie).toEqual({ secure: false, sameSite: 'Lax' })
    expect(value.storageQuotaBytes).toBeUndefined()
    expect(value.planStorageBytes).toEqual({ free: undefined, creator: undefined, studio: undefined })
  })
  it('parses allowlists and rejects invalid values', () => {
    expect(loadConfig({ BEATVAULT_CORS_ORIGINS: 'https://a.test, https://b.test' }).corsOrigins).toEqual(['https://a.test', 'https://b.test'])
    expect(() => loadConfig({ BEATVAULT_PORT: 'nope' })).toThrow('BEATVAULT_PORT')
    expect(() => loadConfig({ BEATVAULT_COOKIE_SAMESITE: 'None' })).toThrow('SameSite=None')
    expect(loadConfig({ BEATVAULT_STORAGE_QUOTA_BYTES: '4096' }).storageQuotaBytes).toBe(4096)
    expect(() => loadConfig({ BEATVAULT_STORAGE_QUOTA_BYTES: '0' })).toThrow('BEATVAULT_STORAGE_QUOTA_BYTES')
    expect(loadConfig({ BEATVAULT_PLAN_CREATOR_STORAGE_BYTES: '8192' }).planStorageBytes.creator).toBe(8192)
    expect(() => loadConfig({ BEATVAULT_PLAN_STUDIO_STORAGE_BYTES: '0' })).toThrow('BEATVAULT_PLAN_STUDIO_STORAGE_BYTES')
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
  it('enables proxy headers only when explicitly configured', () => {
    expect(loadConfig({ BEATVAULT_TRUST_PROXY_HEADERS: 'true' }).trustProxyHeaders).toBe(true)
    expect(loadConfig({ BEATVAULT_TRUST_PROXY_HEADERS: 'false' }).trustProxyHeaders).toBe(false)
  })
  it('only enables Stripe when paired test credentials are configured', () => {
    expect(loadConfig({ STRIPE_SECRET_KEY: 'sk_test_example', STRIPE_WEBHOOK_SECRET: 'whsec_example' }).stripe.enabled).toBe(true)
    expect(loadConfig({ STRIPE_SECRET_KEY: 'sk_test_example', STRIPE_WEBHOOK_SECRET: 'whsec_example' }).stripe.paymentsEnabled).toBe(false)
    expect(loadConfig({ STRIPE_SECRET_KEY: 'sk_test_example', STRIPE_WEBHOOK_SECRET: 'whsec_example', STRIPE_PROCESSING_RATE_BPS: '320', STRIPE_PROCESSING_FIXED_MINOR: '30' }).stripe).toMatchObject({ enabled: true, paymentsEnabled: true, commissionBps: 500, processingRateBps: 320, processingFixedMinor: 30 })
    expect(() => loadConfig({ STRIPE_PROCESSING_RATE_BPS: '-1' })).toThrow('STRIPE_PROCESSING_RATE_BPS')
    expect(loadConfig({}).stripe.enabled).toBe(false)
    expect(() => loadConfig({ STRIPE_SECRET_KEY: 'sk_live_example', STRIPE_WEBHOOK_SECRET: 'whsec_example' })).toThrow('solo acepta claves de prueba')
    expect(loadConfig({ STRIPE_SECRET_KEY: 'rk_test_example', STRIPE_WEBHOOK_SECRET: 'whsec_example', STRIPE_PROCESSING_RATE_BPS: '0' }).stripe.enabled).toBe(true)
    expect(() => loadConfig({ STRIPE_SECRET_KEY: 'sk_test_example' })).toThrow('configurados juntos')
    expect(() => loadConfig({ STRIPE_SECRET_KEY: 'sk_test_example', STRIPE_WEBHOOK_SECRET: 'not-a-signing-secret' })).toThrow('whsec_')
    expect(() => loadConfig({ BEATVAULT_PUBLIC_URL: 'https://attacker.test/path' })).toThrow('URL de origen válida')
    expect(() => loadConfig({ NODE_ENV: 'production', BEATVAULT_COOKIE_SECURE: 'true', BEATVAULT_CORS_ORIGINS: 'https://beatvault.example', BEATVAULT_STORAGE_BACKEND: 'postgres', DATABASE_URL: 'postgresql://beatvault:secret@db/beatvault', BEATVAULT_DEMO_ENABLED: 'false', STRIPE_SECRET_KEY: 'sk_test_example', STRIPE_WEBHOOK_SECRET: 'whsec_example' })).toThrow('no puede configurarse en producción')
  })
})
