import { ApiClient } from "../api/client";
import type { CatalogEntry, CatalogPage } from "../domains/catalog/types";
import type { CatalogAsset } from "./localCatalog";
import { addCatalogAsset, readCatalog, writeCatalog } from "./localCatalog";

export type CatalogSource = "api" | "fallback";
export type CatalogResult = { assets: CatalogAsset[]; source: CatalogSource; error?: string };

const statuses = ["draft", "pending-review", "published", "archived"] as const;
const isCatalogEntry = (value: unknown): value is CatalogEntry => {
  if (!value || typeof value !== "object") return false;
  const item = value as Record<string, unknown>;
  return typeof item.contentId === "string" && typeof item.title === "string" &&
    typeof item.creatorId === "string" && Array.isArray(item.tagIds) &&
    item.tagIds.every((tag) => typeof tag === "string") && Array.isArray(item.previewIds) &&
    item.previewIds.every((preview) => typeof preview === "string") &&
    statuses.includes(item.publicationStatus as (typeof statuses)[number]);
};
export const isCatalogPage = (value: unknown): value is CatalogPage => {
  if (!value || typeof value !== "object") return false;
  const page = value as Record<string, unknown>;
  return Array.isArray(page.entries) && page.entries.every(isCatalogEntry) && typeof page.total === "number";
};

const fromEntry = (entry: CatalogEntry): CatalogAsset => ({
  id: entry.contentId, name: entry.title, type: entry.type,
  metadata: { duration: "--", size: "Metadata only", format: "--" },
  tags: entry.tagIds.map((label) => ({ label })), color: "#35d0ba", favorite: false,
  waveform: [], publicationStatus: entry.publicationStatus === "rejected" ? "pending-review" : entry.publicationStatus,
  localAvailability: "metadata-only", label: "API local catalog",
});

export function mergeCatalogAssets(remote: CatalogAsset[], local: CatalogAsset[]): CatalogAsset[] {
  return Array.from(new Map([...local, ...remote].map((asset) => [asset.id, asset])).values());
}

export class CatalogRepository {
  constructor(private readonly api = new ApiClient()) {}
  async list(): Promise<CatalogResult> {
    const result = await this.api.request("/api/catalog", { method: "GET" }, isCatalogPage);
    const local = readCatalog();
    if (!result.ok) return { assets: local, source: "fallback", error: result.error.message };
    return { assets: mergeCatalogAssets(result.data.entries.map(fromEntry), local), source: "api" };
  }
  async create(asset: CatalogAsset): Promise<{ asset?: CatalogAsset; source: CatalogSource; error?: string }> {
    const result = await this.api.request("/api/catalog", { method: "POST", body: JSON.stringify({ title: asset.name, type: asset.type, tagIds: asset.tags.map((tag) => tag.label), publicationStatus: asset.publicationStatus }) }, isCatalogEntry);
    if (result.ok) {
      const created = fromEntry(result.data);
      writeCatalog(mergeCatalogAssets([created], readCatalog()));
      return { asset: created, source: "api" };
    }
    if (result.error.code !== "NETWORK_ERROR" && result.error.code !== "TIMEOUT") return { source: "api", error: result.error.message };
    const next = addCatalogAsset(readCatalog(), asset);
    if (!next) return { source: "fallback", error: "Ya existe un asset con ese nombre y tipo." };
    writeCatalog(next);
    return { asset: next[0], source: "fallback", error: result.error.message };
  }
  async update(asset: CatalogAsset): Promise<{ asset?: CatalogAsset; source: CatalogSource; error?: string }> {
    const result = await this.api.request(`/api/catalog/${encodeURIComponent(asset.id)}`, { method: "PUT", body: JSON.stringify({ title: asset.name, type: asset.type, tagIds: asset.tags.map((tag) => tag.label), publicationStatus: asset.publicationStatus }) }, isCatalogEntry);
    if (result.ok) { const updated = fromEntry(result.data); writeCatalog([updated, ...readCatalog().filter((item) => item.id !== updated.id)]); return { asset: updated, source: "api" }; }
    if (result.error.code !== "NETWORK_ERROR" && result.error.code !== "TIMEOUT") return { source: "api", error: result.error.message };
    writeCatalog([asset, ...readCatalog().filter((item) => item.id !== asset.id)]);
    return { asset, source: "fallback" };
  }
  async remove(id: string): Promise<{ deleted?: boolean; source: CatalogSource; error?: string }> {
    const result = await this.api.request(`/api/catalog/${encodeURIComponent(id)}`, { method: "DELETE" }, (value): value is { id: string } => Boolean(value && typeof value === "object" && (value as { id?: unknown }).id === id));
    if (result.ok) { writeCatalog(readCatalog().filter((item) => item.id !== id)); return { deleted: true, source: "api" }; }
    if (result.error.code !== "NETWORK_ERROR" && result.error.code !== "TIMEOUT") return { source: "api", error: result.error.message };
    writeCatalog(readCatalog().filter((item) => item.id !== id));
    return { deleted: true, source: "fallback" };
  }
}
