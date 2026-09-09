import type { ApiResult } from "../domains/core/contracts";

export const defaultApiBaseUrl = "http://localhost:4174";
type Decoder<T> = (value: unknown) => value is T;
export type ProjectRecord = { id: string; ownerId: string; title: string; status: "draft" | "working" | "demo" | "ready" | "released"; updatedAt: string };

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
      const headers = { "Content-Type": "application/json", ...(init.method && init.method !== "GET" ? { "X-CSRF-Token": csrf || "" } : {}), ...init.headers };
      const response = await this.fetcher(`${this.baseUrl}${path}`, { ...init, credentials: "include", signal: controller.signal, headers });
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

export type AuthUser = { id: string; email: string };
export const isAuthUser = (value: unknown): value is AuthUser => {
  if (!value || typeof value !== "object") return false;
  const item = value as Record<string, unknown>;
  return typeof item.id === "string" && typeof item.email === "string";
};
export const isNull = (value: unknown): value is null => value === null;

export const authClient = new ApiClient();
