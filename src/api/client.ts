import type { ApiResult } from "../domains/core/contracts";
import { isExchangeRates } from "../domains/marketplace/currency";

export const defaultApiBaseUrl = "";
export const apiUrl = (path: string) => `${import.meta.env.VITE_API_BASE_URL || defaultApiBaseUrl}${path}`;
type Decoder<T> = (value: unknown) => value is T;
export type ProjectRecord = { id: string; ownerId: string; title: string; status: "draft" | "working" | "demo" | "ready" | "released"; updatedAt: string };
export type AssetRecord = { id: string; ownerId: string; originalName: string; storageKey: string; mimeType: string; sizeBytes: number; contentHash: string; state: "available" | "missing" | "metadata-only"; createdAt: string; updatedAt: string; previewStorageKey?: string; previewMimeType?: 'audio/mp4'; previewSizeBytes?: number };

function isApiResult<T>(value: unknown, isData: Decoder<T>): value is ApiResult<T> {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  if (candidate.ok === true) return isData(candidate.data);
  if (candidate.ok === false && candidate.error && typeof candidate.error === "object") {
    const error = candidate.error as Record<string, unknown>;
    return typeof error.code === "string" && typeof error.message === "string";
  }
  return false;
}

export class ApiClient {
  constructor(private readonly baseUrl = import.meta.env.VITE_API_BASE_URL || defaultApiBaseUrl, private readonly timeoutMs = 4000, private readonly fetcher: typeof fetch = fetch) {}

  async request<T>(path: string, init: RequestInit, isData: Decoder<T>, timeoutMs = this.timeoutMs): Promise<ApiResult<T>> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const csrf = typeof document !== "undefined" ? document.cookie.split('; ').find(value => value.startsWith('beatvault_csrf='))?.split('=')[1] : undefined;
      const headers = { ...(init.body instanceof FormData ? {} : { "Content-Type": "application/json" }), ...(init.method && init.method !== "GET" ? { "X-CSRF-Token": csrf || "" } : {}), ...init.headers };
      // Browser fetch must not receive the ApiClient instance as its receiver.
      const fetcher = this.fetcher;
      const response = await fetcher(`${this.baseUrl}${path}`, { ...init, credentials: "include", signal: controller.signal, headers });
      const payload: unknown = await response.json();
      if (!isApiResult(payload, isData)) return { ok: false, error: { code: "INVALID_RESPONSE", message: "Respuesta inválida de la API local." } };
      if (!response.ok && payload.ok) return { ok: false, error: { code: `HTTP_${response.status}`, message: "La API local devolvió un estado HTTP inesperado." } };
      return payload;
    } catch (error) {
      return { ok: false, error: { code: error instanceof DOMException && error.name === "AbortError" ? "TIMEOUT" : "NETWORK_ERROR", message: "La API local no está disponible.", retryable: true } };
    } finally { clearTimeout(timeout); }
  }
}

export const isProjectRecord = (value: unknown): value is ProjectRecord => {
  if (!value || typeof value !== "object") return false;
  const item = value as Record<string, unknown>;
  return typeof item.id === "string" && typeof item.ownerId === "string" && typeof item.title === "string" && ["draft", "working", "demo", "ready", "released"].includes(item.status as string) && typeof item.updatedAt === "string";
};

export const isProjectRecordList = (value: unknown): value is readonly ProjectRecord[] => Array.isArray(value) && value.every(isProjectRecord);

export type AuthUser = { id: string; email: string; role: 'creator' | 'community_manager' | 'admin'; verificationState: 'unverified' | 'pending' | 'verified'; planId?: 'free' | 'creator' | 'studio' };
export const isAuthUser = (value: unknown): value is AuthUser => {
  if (!value || typeof value !== "object") return false;
  const item = value as Record<string, unknown>;
  return typeof item.id === "string" && typeof item.email === "string" && (item.role === "creator" || item.role === "community_manager" || item.role === "admin") && (item.verificationState === "unverified" || item.verificationState === "pending" || item.verificationState === "verified") && (item.planId === undefined || ['free', 'creator', 'studio'].includes(item.planId as string));
};
export const isNull = (value: unknown): value is null => value === null;

export const authClient = new ApiClient();
export type AccountStorageUsage = { usedBytes: number; limitBytes: number | null; availableBytes: number | null; quotaSource: 'account' | 'plan' | 'server' | 'none'; planId: 'free' | 'creator' | 'studio' };
export const isAccountStorageUsage = (value: unknown): value is AccountStorageUsage => {
  if (!value || typeof value !== 'object') return false;
  const item = value as Record<string, unknown>;
  return typeof item.usedBytes === 'number' && item.usedBytes >= 0 &&
    (item.limitBytes === null || typeof item.limitBytes === 'number' && item.limitBytes > 0) &&
    (item.availableBytes === null || typeof item.availableBytes === 'number' && item.availableBytes >= 0) &&
    (item.quotaSource === 'account' || item.quotaSource === 'plan' || item.quotaSource === 'server' || item.quotaSource === 'none') && ['free', 'creator', 'studio'].includes(item.planId as string);
};
export const getAccountStorageUsage = () => authClient.request('/api/account/storage', { method: 'GET' }, isAccountStorageUsage);
export type CommercePolicySnapshot = { mode: 'disabled' | 'test'; platformCommissionBps: number; planBasedFees: false; promotionsApplied: false };
export type AccountPlanSnapshot = { planId: 'free' | 'creator' | 'studio'; status: 'local'; plan: { id: 'free' | 'creator' | 'studio'; name: string; description: string; storageLimitBytes: number | null }; plans: Array<{ id: 'free' | 'creator' | 'studio'; name: string; description: string; storageLimitBytes: number | null }>; pricing: 'undecided'; billing: 'disabled'; commerce?: CommercePolicySnapshot };
const isPlanDefinition = (value: unknown): value is AccountPlanSnapshot['plan'] => Boolean(value && typeof value === 'object' && ['free', 'creator', 'studio'].includes((value as Record<string, unknown>).id as string) && typeof (value as Record<string, unknown>).name === 'string' && typeof (value as Record<string, unknown>).description === 'string' && ((value as Record<string, unknown>).storageLimitBytes === null || typeof (value as Record<string, unknown>).storageLimitBytes === 'number'));
export const isAccountPlanSnapshot = (value: unknown): value is AccountPlanSnapshot => {
  if (!value || typeof value !== 'object') return false;
  const row = value as Record<string, unknown>;
  const commerce = row.commerce as Partial<CommercePolicySnapshot> | undefined;
  const validCommerce = commerce === undefined || Boolean(commerce && ['disabled', 'test'].includes(commerce.mode || '') && Number.isSafeInteger(commerce.platformCommissionBps) && typeof commerce.platformCommissionBps === 'number' && commerce.platformCommissionBps >= 0 && commerce.platformCommissionBps < 10000 && commerce.planBasedFees === false && commerce.promotionsApplied === false);
  return ['free', 'creator', 'studio'].includes(row.planId as string) && row.status === 'local' && isPlanDefinition(row.plan) && Array.isArray(row.plans) && row.plans.every(isPlanDefinition) && row.pricing === 'undecided' && row.billing === 'disabled' && validCommerce;
};
export const getAccountPlan = () => authClient.request('/api/account/plan', { method: 'GET' }, isAccountPlanSnapshot);
const mercadoPagoOrigins = new Set(['https://www.mercadopago.com.mx', 'https://sandbox.mercadopago.com.mx']);
export function safeMercadoPagoUrl(value: string): string | undefined {
  try {
    const url = new URL(value);
    return mercadoPagoOrigins.has(url.origin) && !url.username && !url.password && !url.hash && url.pathname.startsWith('/checkout/') ? url.href : undefined;
  } catch { return undefined; }
}
const mercadoPagoOAuthOrigin = 'https://auth.mercadopago.com.mx';
export function safeMercadoPagoOAuthUrl(value: string): string | undefined {
  try {
    const url = new URL(value);
    const expected = ['client_id', 'response_type', 'platform_id', 'redirect_uri', 'state', 'code_challenge', 'code_challenge_method'];
    if (url.origin !== mercadoPagoOAuthOrigin || url.pathname !== '/authorization' || url.username || url.password || url.hash || url.searchParams.size !== expected.length ||
      expected.some(key => url.searchParams.getAll(key).length !== 1) || [...url.searchParams.keys()].some(key => !expected.includes(key))) return undefined;
    const redirect = new URL(url.searchParams.get('redirect_uri')!);
    const redirectIsLoopback = ['localhost', '127.0.0.1', '[::1]'].includes(redirect.hostname);
    return /^[0-9]{1,40}$/.test(url.searchParams.get('client_id')!) && url.searchParams.get('response_type') === 'code' &&
      url.searchParams.get('platform_id') === 'mp' && url.searchParams.get('code_challenge_method') === 'S256' &&
      /^[A-Za-z0-9_-]{43}$/.test(url.searchParams.get('state')!) && /^[A-Za-z0-9_-]{43}$/.test(url.searchParams.get('code_challenge')!) &&
      (redirect.protocol === 'https:' || redirect.protocol === 'http:' && redirectIsLoopback) && !redirect.username && !redirect.password && !redirect.search && !redirect.hash ? url.href : undefined;
  } catch { return undefined; }
}
export type MercadoPagoSellerStatus = { enabled: boolean; connected: boolean; tokenExpiresAt?: string };
export const isMercadoPagoSellerStatus = (value: unknown): value is MercadoPagoSellerStatus => {
  if (!value || typeof value !== 'object') return false;
  const row = value as Record<string, unknown>;
  return typeof row.enabled === 'boolean' && typeof row.connected === 'boolean' &&
    (row.tokenExpiresAt === undefined || typeof row.tokenExpiresAt === 'string' && Number.isFinite(Date.parse(row.tokenExpiresAt)));
};
export const getMercadoPagoSellerStatus = () => authClient.request('/api/payments/mercadopago/seller', { method: 'GET' }, isMercadoPagoSellerStatus);
export const startMercadoPagoOAuth = () => authClient.request('/api/payments/mercadopago/oauth/start', { method: 'POST', body: JSON.stringify({}) }, (value): value is { url: string } => Boolean(value && typeof value === 'object' && typeof (value as Record<string, unknown>).url === 'string' && safeMercadoPagoOAuthUrl((value as Record<string, unknown>).url as string)));
const currencyClient = new ApiClient(undefined, 8000);
export const getCurrencyRates = () => currencyClient.request('/api/currency-rates', { method: 'GET' }, isExchangeRates);
export const isAssetRecord = (value: unknown): value is AssetRecord => { if (!value || typeof value !== "object") return false; const item = value as Record<string, unknown>; return typeof item.id === "string" && typeof item.ownerId === "string" && typeof item.originalName === "string" && typeof item.storageKey === "string" && typeof item.mimeType === "string" && typeof item.sizeBytes === "number" && typeof item.contentHash === "string" && ["available", "missing", "metadata-only"].includes(item.state as string) && typeof item.createdAt === "string" && typeof item.updatedAt === "string" && (item.previewStorageKey === undefined || typeof item.previewStorageKey === 'string') && (item.previewMimeType === undefined || item.previewMimeType === 'audio/mp4') && (item.previewSizeBytes === undefined || typeof item.previewSizeBytes === 'number' && item.previewSizeBytes > 0); };
const uploadClient = new ApiClient(undefined, 10 * 60 * 1000);
export const uploadAsset = (file: File): Promise<ApiResult<AssetRecord>> => { const form = new FormData(); form.append("file", file, file.name); return uploadClient.request("/api/assets/upload", { method: "POST", body: form }, isAssetRecord); };
export type ArtworkUploadResult = { assetId: string; mimeType: 'image/jpeg' | 'image/png'; sizeBytes: number; width: number; height: number };
const isArtworkUploadResult = (value: unknown): value is ArtworkUploadResult => Boolean(value && typeof value === 'object' && typeof (value as Record<string, unknown>).assetId === 'string' && ['image/jpeg', 'image/png'].includes((value as Record<string, unknown>).mimeType as string) && Number.isSafeInteger((value as Record<string, unknown>).sizeBytes) && Number.isSafeInteger((value as Record<string, unknown>).width) && Number.isSafeInteger((value as Record<string, unknown>).height));
export const uploadArtwork = (assetId: string, file: File): Promise<ApiResult<ArtworkUploadResult>> => uploadClient.request(`/api/assets/${encodeURIComponent(assetId)}/artwork`, { method: 'POST', body: file, headers: { 'Content-Type': file.type } }, isArtworkUploadResult);
