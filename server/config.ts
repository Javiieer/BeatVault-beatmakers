import { resolve } from 'node:path'

export type CookieSameSite = 'Lax' | 'Strict' | 'None'
export type StorageBackend = 'json' | 'postgres'
export type ServerConfig = {
  environment: string
  host: string
  port: number
  corsOrigins: readonly string[]
  trustProxyHeaders: boolean
  cookie: { secure: boolean; sameSite: CookieSameSite }
  sessionTtlSeconds: number
  rateLimit: { limit: number; windowMs: number }
  dataDirectory: string
  uploadDirectory: string
  storageQuotaBytes?: number
  planStorageBytes: { free?: number; creator?: number; studio?: number }
  ffmpegPath: string
  ffprobePath: string
  previewDurationSeconds: number
  uploadLimits: { fileBytes: number; requestBytes: number; files: number; fields: number }
  audit: { maxEntries: number; retentionDays: number }
  storageBackend: StorageBackend
  database: { url: string | undefined; maxConnections: number; idleTimeoutMs: number; connectionTimeoutMs: number }
  demo: { enabled: boolean; email: string; password: string | undefined }
  devAuthTokens: boolean
  mercadoPago: { clientId?: string; clientSecret?: string; webhookSecret?: string; tokenEncryptionKey?: string; publicUrl: string; enabled: boolean; paymentsEnabled: boolean; marketplaceFeeBps?: number; usdMxnRate?: number }
}

const bool = (value: string | undefined, fallback: boolean): boolean => value === undefined ? fallback : value.toLowerCase() === 'true'
const positive = (name: string, value: string | undefined, fallback: number): number => {
  const parsed = value === undefined ? fallback : Number(value)
  if (!Number.isSafeInteger(parsed) || parsed <= 0) throw new Error(`${name} debe ser un entero positivo.`)
  return parsed
}

export const loadConfig = (env: NodeJS.ProcessEnv = process.env): ServerConfig => {
  const environment = env.NODE_ENV || 'development'
  const trustProxyHeaders = bool(env.BEATVAULT_TRUST_PROXY_HEADERS, false)
  const storageBackend = env.BEATVAULT_STORAGE_BACKEND || 'json'
  if (storageBackend !== 'json' && storageBackend !== 'postgres') throw new Error('BEATVAULT_STORAGE_BACKEND debe ser json o postgres.')
  const configuredOrigins = env.BEATVAULT_CORS_ORIGINS
  const origins = (configuredOrigins || 'http://localhost:5173,http://127.0.0.1:5187,http://127.0.0.1:5188').split(',').map(origin => origin.trim()).filter(Boolean)
  const sameSite = env.BEATVAULT_COOKIE_SAMESITE || 'Lax'
  if (!['Lax', 'Strict', 'None'].includes(sameSite)) throw new Error('BEATVAULT_COOKIE_SAMESITE debe ser Lax, Strict o None.')
  const secure = bool(env.BEATVAULT_COOKIE_SECURE, false)
  if (sameSite === 'None' && !secure) throw new Error('Las cookies SameSite=None requieren Secure.')
  if (environment === 'production' && (!secure || origins.length === 0 || origins.includes('*'))) throw new Error('Producción requiere cookies Secure y una allowlist CORS explícita.')
  const demoEnabled = bool(env.BEATVAULT_DEMO_ENABLED, environment !== 'production')
  const password = env.BEATVAULT_DEMO_PASSWORD
  if (demoEnabled && password !== undefined && password.length < 12) throw new Error('BEATVAULT_DEMO_PASSWORD debe contener al menos 12 caracteres.')
  const databaseUrl = env.DATABASE_URL || env.BEATVAULT_DATABASE_URL
  const mercadoPagoClientId = env.MERCADOPAGO_CLIENT_ID?.trim() || undefined
  const mercadoPagoClientSecret = env.MERCADOPAGO_CLIENT_SECRET?.trim() || undefined
  const mercadoPagoWebhookSecret = env.MERCADOPAGO_WEBHOOK_SECRET?.trim() || undefined
  const mercadoPagoTokenEncryptionKey = env.BEATVAULT_MP_TOKEN_ENCRYPTION_KEY?.trim() || undefined
  const mercadoPagoRateValue = env.BEATVAULT_MP_USD_MXN_RATE?.trim() || undefined
  const mercadoPagoFeeValue = env.BEATVAULT_MP_MARKETPLACE_FEE_BPS?.trim() || undefined
  const mercadoPagoUsdMxnRate = mercadoPagoRateValue === undefined ? undefined : Number(mercadoPagoRateValue)
  const mercadoPagoMarketplaceFeeBps = mercadoPagoFeeValue === undefined ? undefined : Number(mercadoPagoFeeValue)
  const mpCredentials = [mercadoPagoClientId, mercadoPagoClientSecret, mercadoPagoWebhookSecret, mercadoPagoTokenEncryptionKey]
  if (mpCredentials.some(Boolean) && mpCredentials.some(value => !value)) throw new Error('Configura juntos MERCADOPAGO_CLIENT_ID, MERCADOPAGO_CLIENT_SECRET, MERCADOPAGO_WEBHOOK_SECRET y BEATVAULT_MP_TOKEN_ENCRYPTION_KEY.')
  if (mercadoPagoTokenEncryptionKey && (Buffer.from(mercadoPagoTokenEncryptionKey, 'base64').length !== 32 || Buffer.from(mercadoPagoTokenEncryptionKey, 'base64').toString('base64').replace(/=+$/, '') !== mercadoPagoTokenEncryptionKey.replace(/=+$/, ''))) throw new Error('BEATVAULT_MP_TOKEN_ENCRYPTION_KEY debe ser base64 válido de 32 bytes.')
  if (mercadoPagoWebhookSecret && mercadoPagoWebhookSecret.length < 32) throw new Error('MERCADOPAGO_WEBHOOK_SECRET debe tener al menos 32 caracteres.')
  if (mercadoPagoMarketplaceFeeBps !== undefined && (!Number.isSafeInteger(mercadoPagoMarketplaceFeeBps) || mercadoPagoMarketplaceFeeBps < 0 || mercadoPagoMarketplaceFeeBps >= 10_000)) throw new Error('BEATVAULT_MP_MARKETPLACE_FEE_BPS debe ser un entero de 0 a 9999.')
  if (mercadoPagoUsdMxnRate !== undefined && (!Number.isFinite(mercadoPagoUsdMxnRate) || mercadoPagoUsdMxnRate < 5 || mercadoPagoUsdMxnRate > 100 || !/^(?:[5-9]|[1-9]\d|100)(?:\.\d{1,6})?$/.test(mercadoPagoRateValue!))) throw new Error('BEATVAULT_MP_USD_MXN_RATE debe ser una tasa decimal entre 5 y 100 con hasta 6 decimales.')
  if (environment === 'production' && (mercadoPagoClientId || mercadoPagoClientSecret)) throw new Error('Mercado Pago Marketplace permanece en modo local/de pruebas y no puede habilitarse en producción.')
  const publicUrl = env.BEATVAULT_PUBLIC_URL || (environment === 'production' ? origins[0] : 'http://localhost:5188')
  if (environment === 'production') {
    const httpsOrigins = origins.every(origin => {
      try { return new URL(origin).origin === origin && new URL(origin).protocol === 'https:' }
      catch { return false }
    })
    if (!bool(env.BEATVAULT_COOKIE_SECURE, false) || !configuredOrigins || !httpsOrigins || origins.includes('*')) {
      throw new Error('Producción requiere cookies seguras y una allowlist CORS explícita de orígenes HTTPS.')
    }
    if (demoEnabled) throw new Error('Las cuentas demo deben estar desactivadas en producción.')
    if (storageBackend !== 'postgres' || !databaseUrl) throw new Error('Producción requiere PostgreSQL y DATABASE_URL.')
  }
  try {
    const parsed = new URL(publicUrl)
    if (parsed.origin !== publicUrl.replace(/\/$/, '') || (environment === 'production' && parsed.protocol !== 'https:')) throw new Error()
  } catch { throw new Error('BEATVAULT_PUBLIC_URL debe ser una URL de origen válida y usar HTTPS en producción.') }
  const publicUrlParsed = new URL(publicUrl)
  const mercadoPagoPublicCallbackReady = publicUrlParsed.protocol === 'https:' && !['localhost', '127.0.0.1', '[::1]'].includes(publicUrlParsed.hostname) && !/^(?:\d{1,3}\.){3}\d{1,3}$/.test(publicUrlParsed.hostname)
  return {
    environment, host: env.BEATVAULT_HOST || '127.0.0.1', port: positive('BEATVAULT_PORT', env.BEATVAULT_PORT, 4174),
    corsOrigins: origins, trustProxyHeaders, cookie: { secure, sameSite: sameSite as CookieSameSite },
    sessionTtlSeconds: positive('BEATVAULT_SESSION_TTL_SECONDS', env.BEATVAULT_SESSION_TTL_SECONDS, 28800),
    rateLimit: { limit: positive('BEATVAULT_RATE_LIMIT', env.BEATVAULT_RATE_LIMIT, 5), windowMs: positive('BEATVAULT_RATE_WINDOW_MS', env.BEATVAULT_RATE_WINDOW_MS, 60000) },
    dataDirectory: resolve(env.BEATVAULT_DATA_DIR || 'data/server-local'),
    uploadDirectory: resolve(env.BEATVAULT_UPLOAD_DIR || 'data/uploads'),
    storageQuotaBytes: env.BEATVAULT_STORAGE_QUOTA_BYTES === undefined ? undefined : positive('BEATVAULT_STORAGE_QUOTA_BYTES', env.BEATVAULT_STORAGE_QUOTA_BYTES, 1),
    planStorageBytes: {
      free: env.BEATVAULT_PLAN_FREE_STORAGE_BYTES === undefined ? undefined : positive('BEATVAULT_PLAN_FREE_STORAGE_BYTES', env.BEATVAULT_PLAN_FREE_STORAGE_BYTES, 1),
      creator: env.BEATVAULT_PLAN_CREATOR_STORAGE_BYTES === undefined ? undefined : positive('BEATVAULT_PLAN_CREATOR_STORAGE_BYTES', env.BEATVAULT_PLAN_CREATOR_STORAGE_BYTES, 1),
      studio: env.BEATVAULT_PLAN_STUDIO_STORAGE_BYTES === undefined ? undefined : positive('BEATVAULT_PLAN_STUDIO_STORAGE_BYTES', env.BEATVAULT_PLAN_STUDIO_STORAGE_BYTES, 1),
    },
    ffmpegPath: env.BEATVAULT_FFMPEG_PATH || 'ffmpeg',
    ffprobePath: env.BEATVAULT_FFPROBE_PATH || 'ffprobe',
    previewDurationSeconds: positive('BEATVAULT_PREVIEW_DURATION_SECONDS', env.BEATVAULT_PREVIEW_DURATION_SECONDS, 30),
    uploadLimits: { fileBytes: positive('BEATVAULT_UPLOAD_MAX_FILE_BYTES', env.BEATVAULT_UPLOAD_MAX_FILE_BYTES, 500 * 1024 * 1024), requestBytes: positive('BEATVAULT_UPLOAD_MAX_REQUEST_BYTES', env.BEATVAULT_UPLOAD_MAX_REQUEST_BYTES, 510 * 1024 * 1024), files: positive('BEATVAULT_UPLOAD_MAX_FILES', env.BEATVAULT_UPLOAD_MAX_FILES, 1), fields: positive('BEATVAULT_UPLOAD_MAX_FIELDS', env.BEATVAULT_UPLOAD_MAX_FIELDS, 8) },
    audit: { maxEntries: positive('BEATVAULT_AUDIT_MAX_ENTRIES', env.BEATVAULT_AUDIT_MAX_ENTRIES, 10000), retentionDays: positive('BEATVAULT_AUDIT_RETENTION_DAYS', env.BEATVAULT_AUDIT_RETENTION_DAYS, 365) },
    storageBackend,
    database: { url: databaseUrl, maxConnections: positive('BEATVAULT_DB_MAX_CONNECTIONS', env.BEATVAULT_DB_MAX_CONNECTIONS, 10), idleTimeoutMs: positive('BEATVAULT_DB_IDLE_TIMEOUT_MS', env.BEATVAULT_DB_IDLE_TIMEOUT_MS, 10000), connectionTimeoutMs: positive('BEATVAULT_DB_CONNECTION_TIMEOUT_MS', env.BEATVAULT_DB_CONNECTION_TIMEOUT_MS, 5000) },
    demo: { enabled: demoEnabled, email: (env.BEATVAULT_DEMO_EMAIL || 'demo@beatvault.local').trim().toLowerCase(), password },
    devAuthTokens: environment !== 'production' && bool(env.BEATVAULT_DEV_AUTH_TOKENS, false),
    mercadoPago: { clientId: mercadoPagoClientId, clientSecret: mercadoPagoClientSecret, webhookSecret: mercadoPagoWebhookSecret, tokenEncryptionKey: mercadoPagoTokenEncryptionKey, publicUrl: publicUrl.replace(/\/$/, ''), enabled: Boolean(mercadoPagoClientId && mercadoPagoClientSecret && mercadoPagoWebhookSecret && mercadoPagoTokenEncryptionKey && mercadoPagoPublicCallbackReady), paymentsEnabled: Boolean(mercadoPagoClientId && mercadoPagoClientSecret && mercadoPagoWebhookSecret && mercadoPagoTokenEncryptionKey && mercadoPagoMarketplaceFeeBps !== undefined && mercadoPagoUsdMxnRate !== undefined && mercadoPagoPublicCallbackReady), marketplaceFeeBps: mercadoPagoMarketplaceFeeBps, usdMxnRate: mercadoPagoUsdMxnRate }
  }
}

export const config = loadConfig()
export const isAllowedOrigin = (origin: string | undefined, origins: readonly string[]): boolean => !origin || origins.includes(origin)
