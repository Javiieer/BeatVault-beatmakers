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

  async request<T>(path: string, init: RequestInit, isData: Decoder<T>): Promise<ApiResult<T>> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
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
export type AccountPlanSnapshot = { planId: 'free' | 'creator' | 'studio'; status: 'local'; plan: { id: 'free' | 'creator' | 'studio'; name: string; description: string; storageLimitBytes: number | null }; plans: Array<{ id: 'free' | 'creator' | 'studio'; name: string; description: string; storageLimitBytes: number | null }>; pricing: 'undecided'; billing: 'disabled' };
const isPlanDefinition = (value: unknown): value is AccountPlanSnapshot['plan'] => Boolean(value && typeof value === 'object' && ['free', 'creator', 'studio'].includes((value as Record<string, unknown>).id as string) && typeof (value as Record<string, unknown>).name === 'string' && typeof (value as Record<string, unknown>).description === 'string' && ((value as Record<string, unknown>).storageLimitBytes === null || typeof (value as Record<string, unknown>).storageLimitBytes === 'number'));
export const isAccountPlanSnapshot = (value: unknown): value is AccountPlanSnapshot => Boolean(value && typeof value === 'object' && ['free', 'creator', 'studio'].includes((value as Record<string, unknown>).planId as string) && (value as Record<string, unknown>).status === 'local' && isPlanDefinition((value as Record<string, unknown>).plan) && Array.isArray((value as Record<string, unknown>).plans) && ((value as Record<string, unknown>).plans as unknown[]).every(isPlanDefinition) && (value as Record<string, unknown>).pricing === 'undecided' && (value as Record<string, unknown>).billing === 'disabled');
export const getAccountPlan = () => authClient.request('/api/account/plan', { method: 'GET' }, isAccountPlanSnapshot);
export type StripeConnectStatus = { enabled: boolean; connected: boolean; chargesEnabled: boolean; payoutsEnabled: boolean; detailsSubmitted: boolean; deauthorized: boolean };
export const isStripeConnectStatus = (value: unknown): value is StripeConnectStatus => Boolean(value && typeof value === 'object' && ['enabled', 'connected', 'chargesEnabled', 'payoutsEnabled', 'detailsSubmitted', 'deauthorized'].every(key => typeof (value as Record<string, unknown>)[key] === 'boolean'));
export const getStripeConnectStatus = () => authClient.request('/api/connect/account', { method: 'GET' }, isStripeConnectStatus);
export const startStripeConnectOnboarding = () => authClient.request('/api/connect/onboarding', { method: 'POST', body: JSON.stringify({}) }, (value): value is { url: string } => Boolean(value && typeof value === 'object' && typeof (value as Record<string, unknown>).url === 'string' && (value as Record<string, unknown>).url?.toString().startsWith('https://connect.stripe.com/')));
const currencyClient = new ApiClient(undefined, 8000);
export const getCurrencyRates = () => currencyClient.request('/api/currency-rates', { method: 'GET' }, isExchangeRates);
export const isAssetRecord = (value: unknown): value is AssetRecord => { if (!value || typeof value !== "object") return false; const item = value as Record<string, unknown>; return typeof item.id === "string" && typeof item.ownerId === "string" && typeof item.originalName === "string" && typeof item.storageKey === "string" && typeof item.mimeType === "string" && typeof item.sizeBytes === "number" && typeof item.contentHash === "string" && ["available", "missing", "metadata-only"].includes(item.state as string) && typeof item.createdAt === "string" && typeof item.updatedAt === "string" && (item.previewStorageKey === undefined || typeof item.previewStorageKey === 'string') && (item.previewMimeType === undefined || item.previewMimeType === 'audio/mp4') && (item.previewSizeBytes === undefined || typeof item.previewSizeBytes === 'number' && item.previewSizeBytes > 0); };
const uploadClient = new ApiClient(undefined, 10 * 60 * 1000);
export const uploadAsset = (file: File): Promise<ApiResult<AssetRecord>> => { const form = new FormData(); form.append("file", file, file.name); return uploadClient.request("/api/assets/upload", { method: "POST", body: form }, isAssetRecord); };
