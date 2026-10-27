import { describe, expect, it, vi } from "vitest";
import { ApiClient, isAccountPlanSnapshot, isAccountStorageUsage, isMercadoPagoSellerStatus, isProjectRecord, safeMercadoPagoOAuthUrl, safeMercadoPagoUrl } from "./client";

const record = { id: "p1", ownerId: "o1", title: "Idea", status: "draft", updatedAt: "2026-01-01" };
const response = (body: unknown, status = 200) => Promise.resolve(new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }));
describe("ApiClient", () => {
  it('allows media processing past the ordinary request budget but still aborts at its explicit limit', async () => {
    vi.useFakeTimers();
    try {
      let signal: AbortSignal | undefined;
      const fetcher = vi.fn((_input, init) => new Promise((_resolve, reject) => {
        signal = init?.signal;
        signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
      })) as typeof fetch;
      const pending = new ApiClient('http://api', 4000, fetcher).request('/media', { method: 'POST' }, isProjectRecord, 120000);
      await vi.advanceTimersByTimeAsync(5000);
      expect(signal?.aborted).toBe(false);
      await vi.advanceTimersByTimeAsync(115000);
      expect((await pending)).toMatchObject({ ok: false, error: { code: 'TIMEOUT' } });
      expect(signal?.aborted).toBe(true);
    } finally { vi.useRealTimers(); }
  });
  it('validates account storage usage and package metadata', () => {
    expect(isAccountStorageUsage({ usedBytes: 2048, limitBytes: null, availableBytes: null, quotaSource: 'none', planId: 'free' })).toBe(true);
    expect(isAccountStorageUsage({ usedBytes: 2048, limitBytes: -1, availableBytes: 0, quotaSource: 'server', planId: 'free' })).toBe(false);
  });
  it('validates local package capacity without inventing billing values', () => {
    expect(isAccountPlanSnapshot({ planId: 'free', status: 'local', plan: { id: 'free', name: 'Free', description: 'Starter', storageLimitBytes: 5 * 1024 ** 3 }, plans: [{ id: 'free', name: 'Free', description: 'Starter', storageLimitBytes: 5 * 1024 ** 3 }], pricing: 'undecided', billing: 'disabled' })).toBe(true);
    expect(isAccountPlanSnapshot({ planId: 'free', status: 'active', plan: {}, plans: [], pricing: 'free', billing: 'enabled' })).toBe(false);
  });
  it('validates the effective test commission independently from proposed membership pricing', () => {
    const base = { planId: 'free', status: 'local', plan: { id: 'free', name: 'Free', description: 'Starter', storageLimitBytes: 1024 }, plans: [], pricing: 'undecided', billing: 'disabled' };
    const commerce = { mode: 'disabled', platformCommissionBps: 500, planBasedFees: false, promotionsApplied: false };
    expect(isAccountPlanSnapshot({ ...base, commerce })).toBe(true);
    expect(isAccountPlanSnapshot({ ...base, commerce: { ...commerce, platformCommissionBps: 10000 } })).toBe(false);
    expect(isAccountPlanSnapshot({ ...base, commerce: { ...commerce, mode: 'live' } })).toBe(false);
    expect(isAccountPlanSnapshot({ ...base, commerce: { ...commerce, planBasedFees: true } })).toBe(false);
  });
  it('accepts only the exact Mercado Pago production and sandbox HTTPS origins', () => {
    expect(safeMercadoPagoUrl('https://www.mercadopago.com.mx/checkout/abc')).toBe('https://www.mercadopago.com.mx/checkout/abc');
    expect(safeMercadoPagoUrl('https://sandbox.mercadopago.com.mx/checkout/test?pref_id=p1')).toBe('https://sandbox.mercadopago.com.mx/checkout/test?pref_id=p1');
    for (const url of ['http://www.mercadopago.com.mx/checkout/1', 'https://mercadopago.com.mx/checkout/1', 'https://www.mercadopago.com.mx.evil.test/checkout/1', 'https://user:pass@www.mercadopago.com.mx/checkout/1', 'https://www.mercadopago.com.mx/oauth/authorize', 'https://www.mercadopago.com.mx/checkout/1#fragment', 'javascript:alert(1)']) expect(safeMercadoPagoUrl(url)).toBeUndefined();
  });
  it('accepts the exact Mercado Pago OAuth origin without widening checkout destinations', () => {
    const query = 'client_id=123&response_type=code&platform_id=mp&redirect_uri=https%3A%2F%2Fexample.test%2Fcallback&state=' + 's'.repeat(43) + '&code_challenge=' + 'c'.repeat(43) + '&code_challenge_method=S256';
    expect(safeMercadoPagoOAuthUrl(`https://auth.mercadopago.com.mx/authorization?${query}`)).toBe(`https://auth.mercadopago.com.mx/authorization?${query}`);
    const localCallback = query.replace('https%3A%2F%2Fexample.test%2Fcallback', 'http%3A%2F%2F127.0.0.1%3A5187%2Fapi%2Fpayments%2Fmercadopago%2Foauth%2Fcallback');
    expect(safeMercadoPagoOAuthUrl(`https://auth.mercadopago.com.mx/authorization?${localCallback}`)).toContain('http%3A%2F%2F127.0.0.1');
    for (const url of [`http://auth.mercadopago.com.mx/authorization?${query}`, `https://auth.mercadopago.com.mx.evil.test/authorization?${query}`, `https://user:pass@auth.mercadopago.com.mx/authorization?${query}`, 'https://auth.mercadopago.com.mx/authorization?client_id=123', `https://auth.mercadopago.com.mx/elsewhere?${query}`, `https://auth.mercadopago.com.mx/authorization?${query.replace('https%3A%2F%2Fexample.test%2Fcallback', 'http%3A%2F%2Fevil.test%2Fcallback')}`]) expect(safeMercadoPagoOAuthUrl(url)).toBeUndefined();
    expect(safeMercadoPagoUrl('https://auth.mercadopago.com.mx/authorization')).toBeUndefined();
  });
  it('validates Mercado Pago seller connection and optional token expiry', () => {
    expect(isMercadoPagoSellerStatus({ enabled: true, connected: true })).toBe(true);
    expect(isMercadoPagoSellerStatus({ enabled: true, connected: true, tokenExpiresAt: '2026-11-01T00:00:00.000Z' })).toBe(true);
    expect(isMercadoPagoSellerStatus({ enabled: true, connected: true, tokenExpiresAt: 'soon' })).toBe(false);
    expect(isMercadoPagoSellerStatus({ enabled: 1, connected: false })).toBe(false);
  });
  it('does not bind browser fetch to the client instance', async () => {
    const fetcher = function(this: unknown) {
      expect(this).toBeUndefined();
      return response({ ok: true, data: record });
    };
    expect((await new ApiClient('http://api', 100, fetcher).request('/x', {}, isProjectRecord)).ok).toBe(true);
  });
  it("accepts a successful ApiResult", async () => expect((await new ApiClient("http://api", 100, vi.fn(() => response({ ok: true, data: record })) as typeof fetch).request("/x", {}, isProjectRecord)).ok).toBe(true));
  it("includes cookies for session requests", async () => {
    const fetcher = vi.fn((...args: Parameters<typeof fetch>) => { void args; return response({ ok: true, data: record }); });
    await new ApiClient("http://api", 100, fetcher as typeof fetch).request("/x", { method: "GET" }, isProjectRecord);
    expect(fetcher.mock.calls[0]?.[1]).toMatchObject({ credentials: "include" });
  });
  it("turns HTTP errors into an error result", async () => expect((await new ApiClient("http://api", 100, vi.fn(() => response({ ok: false, error: { code: "NO", message: "no" } }, 500)) as typeof fetch).request("/x", {}, isProjectRecord)).ok).toBe(false));
  it("handles timeout and network failure", async () => {
    const timeout = new ApiClient("http://api", 1, vi.fn((_input, init) => new Promise((_resolve, reject) => { init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError"))); })) as typeof fetch);
    expect((await timeout.request("/x", {}, isProjectRecord)).ok).toBe(false);
    expect((await new ApiClient("http://api", 100, vi.fn(() => Promise.reject(new Error("offline"))) as typeof fetch).request("/x", {}, isProjectRecord)).ok).toBe(false);
  });
  it("rejects invalid envelopes", async () => expect((await new ApiClient("http://api", 100, vi.fn(() => response({ ok: true, data: { nope: true } })) as typeof fetch).request("/x", {}, isProjectRecord)).ok).toBe(false));
});
