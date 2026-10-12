import { describe, expect, it, vi } from "vitest";
import { ApiClient, isAccountPlanSnapshot, isAccountStorageUsage, isProjectRecord } from "./client";

const record = { id: "p1", ownerId: "o1", title: "Idea", status: "draft", updatedAt: "2026-01-01" };
const response = (body: unknown, status = 200) => Promise.resolve(new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }));
describe("ApiClient", () => {
  it('validates account storage usage and package metadata', () => {
    expect(isAccountStorageUsage({ usedBytes: 2048, limitBytes: null, availableBytes: null, quotaSource: 'none', planId: 'free' })).toBe(true);
    expect(isAccountStorageUsage({ usedBytes: 2048, limitBytes: -1, availableBytes: 0, quotaSource: 'server', planId: 'free' })).toBe(false);
  });
  it('validates local package capacity without inventing billing values', () => {
    expect(isAccountPlanSnapshot({ planId: 'free', status: 'local', plan: { id: 'free', name: 'Free', description: 'Starter', storageLimitBytes: 5 * 1024 ** 3 }, plans: [{ id: 'free', name: 'Free', description: 'Starter', storageLimitBytes: 5 * 1024 ** 3 }], pricing: 'undecided', billing: 'disabled' })).toBe(true);
    expect(isAccountPlanSnapshot({ planId: 'free', status: 'active', plan: {}, plans: [], pricing: 'free', billing: 'enabled' })).toBe(false);
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
