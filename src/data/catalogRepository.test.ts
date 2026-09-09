import { describe, expect, it, vi } from "vitest";
import { ApiClient } from "../api/client";
import { CatalogRepository, mergeCatalogAssets } from "./catalogRepository";
import { writeCatalog, type CatalogAsset } from "./localCatalog";

const local: CatalogAsset = { id: "same", name: "Local", type: "Loop", metadata: { duration: "1", size: "1", format: "WAV" }, tags: [], color: "#000", favorite: false, waveform: [], publicationStatus: "draft" };
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const page = { entries: [{ contentId: "same", type: "loop", title: "Remote", creatorId: "creator", tagIds: ["ambient"], previewIds: [], publicationStatus: "published" }], total: 1 };
describe("CatalogRepository", () => {
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
