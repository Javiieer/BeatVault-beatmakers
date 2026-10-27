import { describe, expect, it, vi } from "vitest";
import { ApiClient } from "../api/client";
import { CatalogRepository, isCatalogPage, mergeCatalogAssets } from "./catalogRepository";
import { readCatalog, writeCatalog, type CatalogAsset } from "./localCatalog";
import { readUploadDraft, writeUploadDraft, emptyUploadDraft } from './localUploadDraft';

const local: CatalogAsset = { id: "same", name: "Local", type: "One-shot", metadata: { duration: "1", size: "1", format: "WAV" }, tags: [], color: "#000", favorite: false, waveform: [], publicationStatus: "draft" };
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const page = { entries: [{ contentId: "same", type: "loop", title: "Remote", creatorId: "creator", tagIds: ["ambient"], previewIds: [], publicationStatus: "published" }], total: 1 };
describe("CatalogRepository", () => {
  it('loads public details without hydrating private drafts from cache', async () => {
    const entry = { ...page.entries[0], type: 'beat' };
    const fetcher = vi.fn().mockResolvedValue(response({ ok: true, data: entry }));
    const repo = new CatalogRepository(new ApiClient('http://api', 100, fetcher), 'owner');
    expect((await repo.publishedDetail('same')).asset?.name).toBe('Remote');
    expect(fetcher).toHaveBeenCalledWith('http://api/api/catalog/same', expect.anything());
    fetcher.mockResolvedValueOnce(response({ ok: true, data: { ...entry, publicationStatus: 'draft' } }));
    expect(await repo.publishedDetail('same')).toEqual({ notFound: true });
    fetcher.mockResolvedValueOnce(response({ ok: true, data: { ...entry, contentId: 'other' } }));
    expect(await repo.publishedDetail('same')).toEqual({ notFound: true });
    fetcher.mockRejectedValueOnce(new Error('offline'));
    expect((await repo.publishedDetail('same')).asset).toBeUndefined();
  });
  it('rejects malformed audio metadata before rendering it', () => {
    for (const audio of [null, {}, { originalName: 123, mimeType: 'audio/wav', sizeBytes: 2, state: 'available' }]) {
      expect(isCatalogPage({ ...page, entries: [{ ...page.entries[0], audio }] })).toBe(false);
    }
    for (const type of [undefined, null, {}, 'unknown', '<script>']) {
      expect(isCatalogPage({ ...page, entries: [{ ...page.entries[0], type }] })).toBe(false);
    }
  });
  it('isolates caches and drafts without migrating unowned legacy storage', () => {
    writeCatalog([local]); writeCatalog([{ ...local, ownerId: 'a' }], 'a');
    expect(readCatalog('b')).toEqual([]);
    expect(readCatalog('demo')).toEqual([]);
    expect(readCatalog('a')[0].ownerId).toBe('a');
    writeUploadDraft({ ...emptyUploadDraft, title: 'Private' }, 'a');
    expect(readUploadDraft('b').title).toBe('');
    expect(readUploadDraft('a').title).toBe('Private');
  });
  it('does not show stale private data or fake successful writes on an authenticated network failure', async () => {
    writeCatalog([local], 'a');
    const repo = new CatalogRepository(new ApiClient('http://api', 100, vi.fn().mockRejectedValue(new Error('offline'))), 'a');
    expect((await repo.list()).assets).toEqual([]);
    expect((await repo.create(local)).asset).toBeUndefined();
    expect((await repo.update(local)).asset).toBeUndefined();
    expect((await repo.remove(local.id)).deleted).toBeUndefined();
  });
  it('restores a durable preview and cover from the API without browser cache', async () => {
    const entry = { ...page.entries[0], creatorId: 'owner', assetId: 'audio-id', coverId: 'lo-fi', audio: { originalName: 'beat.wav', mimeType: 'audio/wav', sizeBytes: 2044, state: 'available' } };
    const repo = new CatalogRepository(new ApiClient('http://api', 100, vi.fn().mockResolvedValue(response({ ok: true, data: { entries: [entry], total: 1 } }))), 'owner');
    const asset = (await repo.list()).assets[0];
    expect(asset.previewUrl).toBe('/api/assets/audio-id/preview');
    expect(asset.downloadUrl).toBe('/api/assets/audio-id/download');
    expect(asset.cover).toContain('chill-lo-fi.png');
    expect(asset.metadata).toMatchObject({ size: '2.0 KB', format: 'WAV' });
  });
  it('requests filtered marketplace pages and preserves the next cursor', async () => {
    const entry = { ...page.entries[0], type: 'beat' as const, title: 'Night Session' };
    const fetcher = vi.fn().mockResolvedValue(response({ ok: true, data: { entries: [entry], total: 31, nextCursor: entry.contentId } }));
    const repo = new CatalogRepository(new ApiClient('http://api', 100, fetcher), 'visitor');
    const result = await repo.marketplacePage({ query: 'night', type: 'beat', tag: 'trap', limit: 24 });
    expect(fetcher.mock.calls[0][0]).toBe('http://api/api/marketplace?q=night&type=beat&tag=trap&limit=24');
    expect(result).toMatchObject({ total: 31, nextCursor: entry.contentId, assets: [{ name: 'Night Session' }] });
  });
  it('scopes marketplace queries to a creator without broadening the listing', async () => {
    const creatorId = '6a3f6a77-01e1-41e4-9810-b364765939a5';
    const fetcher = vi.fn().mockResolvedValue(response({ ok: true, data: { entries: [], total: 0 } }));
    const repo = new CatalogRepository(new ApiClient('http://api', 100, fetcher), 'visitor');
    await repo.marketplacePage({ type: 'beat', creatorId, limit: 48 });
    expect(fetcher.mock.calls[0][0]).toBe(`http://api/api/marketplace?type=beat&creatorId=${creatorId}&limit=48`);
  });
  it('retries a processed preview and refreshes the owner catalog state', async () => {
    const entry = { ...page.entries[0], contentId: 'beat-id', creatorId: 'owner', assetId: 'audio-id', audio: { originalName: 'beat.wav', mimeType: 'audio/wav', sizeBytes: 2044, state: 'available', previewReady: true } };
    const fetcher = vi.fn()
      .mockResolvedValueOnce(response({ ok: true, data: { id: 'audio-id', previewReady: true } }))
      .mockResolvedValueOnce(response({ ok: true, data: { entries: [entry], total: 1 } }));
    const repo = new CatalogRepository(new ApiClient('http://api', 100, fetcher), 'owner');
    const result = await repo.retryPreview('audio-id');
    expect(fetcher.mock.calls[0][0]).toBe('http://api/api/assets/audio-id/preview/process');
    expect(fetcher.mock.calls[0][1]).toMatchObject({ method: 'POST', credentials: 'include' });
    expect(result.asset).toMatchObject({ id: 'beat-id', assetId: 'audio-id', previewReady: true });
  });
  it('preserves rejected status so creators can see review outcomes', async () => {
    const rejected = { ...page.entries[0], creatorId: 'owner', publicationStatus: 'rejected' }
    const repo = new CatalogRepository(new ApiClient('http://api', 100, vi.fn().mockResolvedValue(response({ ok: true, data: { entries: [rejected], total: 1 } }))), 'owner')
    expect((await repo.list()).assets[0].publicationStatus).toBe('rejected')
  });
  it("loads and deduplicates API catalog", async () => { writeCatalog([local]); const repo = new CatalogRepository(new ApiClient("http://api", 100, vi.fn().mockResolvedValue(response({ ok: true, data: page })))); const result = await repo.list(); expect(result.source).toBe("api"); expect(result.assets).toHaveLength(1); expect(result.assets[0].name).toBe("Remote"); });
  it("falls back on API errors", async () => { writeCatalog([local]); const repo = new CatalogRepository(new ApiClient("http://api", 100, vi.fn().mockResolvedValue(response({ ok: false, error: { code: "UNAUTHORIZED", message: "No" } }, 401)))); const result = await repo.list(); expect(result.source).toBe("fallback"); expect(result.assets).toEqual([local]); });
  it("falls back on invalid API data", async () => { writeCatalog([local]); const repo = new CatalogRepository(new ApiClient("http://api", 100, vi.fn().mockResolvedValue(response({ ok: true, data: { entries: [{ broken: true }], total: 1 } })))); expect((await repo.list()).source).toBe("fallback"); });
  it("deduplicates by ID", () => expect(mergeCatalogAssets([local], [{ ...local, name: "Other" }])).toHaveLength(1));
  it("creates catalog metadata through the API", async () => {
    const created = { contentId: "new", type: "loop", title: "New Loop", creatorId: "creator", tagIds: ["dark"], previewIds: [], publicationStatus: "pending-review" };
    const repo = new CatalogRepository(new ApiClient("http://api", 100, vi.fn().mockResolvedValue(response({ ok: true, data: created }, 201))));
    const result = await repo.create(local);
    expect(result.source).toBe("api");
    expect(result.asset?.id).toBe("new");
  });
  it("does not fake success on validation errors", async () => {
    const repo = new CatalogRepository(new ApiClient("http://api", 100, vi.fn().mockResolvedValue(response({ ok: false, error: { code: "VALIDATION_ERROR", message: "No" } }, 400))));
    const result = await repo.create(local);
    expect(result.source).toBe("api");
    expect(result.asset).toBeUndefined();
  });
});
