import { describe, expect, it } from 'vitest'
import { isAllowedOrigin, loadConfig } from './config'
import { publicTunnelViteOptions } from './public-tunnel'

describe('server config', () => {
  it('uses safe local defaults', () => {
    const value = loadConfig({})
    expect(value.port).toBe(4174)
    expect(value.corsOrigins).toEqual(['http://localhost:5173', 'http://127.0.0.1:5187', 'http://127.0.0.1:5188'])
    expect(value.trustProxyHeaders).toBe(false)
    expect(value.cookie).toEqual({ secure: false, sameSite: 'Lax' })
    expect(value.storageQuotaBytes).toBeUndefined()
    expect(value.planStorageBytes).toEqual({ free: undefined, creator: undefined, studio: undefined })
    expect(value.mercadoPago.enabled).toBe(false)
    expect(value.mercadoPago.paymentsEnabled).toBe(false)
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
  it('only enables Mercado Pago test payments after all settings are supplied', () => {
    const credentials = { MERCADOPAGO_CLIENT_ID: '1234567890123456', MERCADOPAGO_CLIENT_SECRET: 'client-secret', MERCADOPAGO_WEBHOOK_SECRET: 'a'.repeat(32), BEATVAULT_MP_TOKEN_ENCRYPTION_KEY: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=', BEATVAULT_PUBLIC_URL: 'https://payments.example.test', BEATVAULT_CORS_ORIGINS: 'http://127.0.0.1:5188,https://payments.example.test', BEATVAULT_COOKIE_SECURE: 'true', BEATVAULT_DEMO_ENABLED: 'false' }
    expect(loadConfig(credentials).mercadoPago).toMatchObject({ enabled: true, paymentsEnabled: false })
    expect(loadConfig({ ...credentials, BEATVAULT_MP_USD_MXN_RATE: '18.25', BEATVAULT_MP_MARKETPLACE_FEE_BPS: '500' }).mercadoPago).toMatchObject({ enabled: true, paymentsEnabled: true, usdMxnRate: 18.25, marketplaceFeeBps: 500 })
    expect(() => loadConfig({ MERCADOPAGO_CLIENT_ID: credentials.MERCADOPAGO_CLIENT_ID })).toThrow('Configura juntos')
    expect(() => loadConfig({ ...credentials, BEATVAULT_MP_TOKEN_ENCRYPTION_KEY: 'invalid' })).toThrow('base64 válido')
    expect(() => loadConfig({ ...credentials, MERCADOPAGO_WEBHOOK_SECRET: 'short' })).toThrow('al menos 32 caracteres')
    expect(() => loadConfig({ ...credentials, BEATVAULT_MP_USD_MXN_RATE: '101' })).toThrow('USD_MXN_RATE')
    expect(() => loadConfig({ ...credentials, BEATVAULT_MP_MARKETPLACE_FEE_BPS: '10000' })).toThrow('MARKETPLACE_FEE_BPS')
    expect(loadConfig({ ...credentials, BEATVAULT_PUBLIC_URL: 'http://localhost:5188' }).mercadoPago.enabled).toBe(false)
    expect(() => loadConfig({ BEATVAULT_PUBLIC_URL: 'https://attacker.test/path' })).toThrow('URL de origen válida')
    expect(() => loadConfig({ ...credentials, NODE_ENV: 'production', BEATVAULT_COOKIE_SECURE: 'true', BEATVAULT_CORS_ORIGINS: 'https://payments.example.test', BEATVAULT_STORAGE_BACKEND: 'postgres', DATABASE_URL: 'postgresql://beatvault:secret@db/beatvault', BEATVAULT_DEMO_ENABLED: 'false' })).toThrow('no puede habilitarse en producción')
  })
  it('requires a safe profile before exposing local development through an HTTPS tunnel', () => {
    const tunnel = { BEATVAULT_PUBLIC_URL: 'https://payments.example.test', BEATVAULT_CORS_ORIGINS: 'https://payments.example.test', BEATVAULT_COOKIE_SECURE: 'true', BEATVAULT_DEMO_ENABLED: 'false' }
    expect(loadConfig(tunnel).mercadoPago.enabled).toBe(false)
    expect(() => loadConfig({ ...tunnel, BEATVAULT_COOKIE_SECURE: 'false' })).toThrow('COOKIE_SECURE=true')
    expect(() => loadConfig({ ...tunnel, BEATVAULT_CORS_ORIGINS: 'http://127.0.0.1:5188' })).toThrow('BEATVAULT_CORS_ORIGINS')
    expect(() => loadConfig({ ...tunnel, BEATVAULT_DEMO_ENABLED: 'true' })).toThrow('BEATVAULT_DEMO_ENABLED')
    expect(() => loadConfig({ ...tunnel, BEATVAULT_DEV_AUTH_TOKENS: 'true' })).toThrow('BEATVAULT_DEV_AUTH_TOKENS')
  })
  it('allows only the exact configured HTTPS hostname and origin in Vite for a tunnel', () => {
    expect(publicTunnelViteOptions('https://public-test.example')).toEqual({
      allowedHosts: ['public-test.example'],
      corsOrigins: ['http://localhost:5188', 'http://127.0.0.1:5188', 'https://public-test.example'],
    })
    expect(publicTunnelViteOptions('https://public-test.example/')).toEqual({
      allowedHosts: ['public-test.example'],
      corsOrigins: ['http://localhost:5188', 'http://127.0.0.1:5188', 'https://public-test.example'],
    })
    expect(publicTunnelViteOptions('http://public-test.example')).toBeUndefined()
    expect(publicTunnelViteOptions('https://localhost:5188')).toBeUndefined()
    expect(publicTunnelViteOptions('https://127.0.0.1')).toBeUndefined()
    expect(publicTunnelViteOptions('https://public-test.example/path')).toBeUndefined()
  })
})
