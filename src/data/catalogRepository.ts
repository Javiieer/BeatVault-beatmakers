import { ApiClient, apiUrl } from "../api/client";
import type { CatalogEntry, CatalogPage } from "../domains/catalog/types";
import type { CatalogAsset } from "./localCatalog";
import { addCatalogAsset, readCatalog, writeCatalog } from "./localCatalog";
import { creatorType, uploadCovers } from "./creatorUploads";
import { formatFileSize } from './localUploadDraft';

export type CatalogSource = "api" | "fallback";
export type CatalogResult = { assets: CatalogAsset[]; source: CatalogSource; error?: string };

const statuses = ["draft", "pending-review", "published", "archived", "rejected"] as const;
const isCatalogEntry = (value: unknown): value is CatalogEntry => {
  if (!value || typeof value !== "object") return false;
  const item = value as Record<string, unknown>;
  if (item.assetId !== undefined && typeof item.assetId !== 'string') return false;
  if (item.coverId !== undefined && !uploadCovers.some(cover => cover.id === item.coverId)) return false;
  if (item.audio !== undefined) {
    if (!item.audio || typeof item.audio !== 'object') return false;
    const audio = item.audio as Record<string, unknown>;
    if (typeof audio.originalName !== 'string' || typeof audio.mimeType !== 'string' ||
      typeof audio.sizeBytes !== 'number' || !Number.isFinite(audio.sizeBytes) || audio.sizeBytes <= 0 ||
      !['available', 'missing', 'metadata-only'].includes(audio.state as string)) return false;
  }
  return typeof item.contentId === "string" && typeof item.title === "string" &&
    typeof item.creatorId === "string" && Array.isArray(item.tagIds) &&
    item.tagIds.every((tag) => typeof tag === "string") && Array.isArray(item.previewIds) &&
    item.previewIds.every((preview) => typeof preview === "string") &&
    statuses.includes(item.publicationStatus as (typeof statuses)[number]) &&
    (item.reviewNote === undefined || typeof item.reviewNote === 'string' && item.reviewNote.length <= 160);
};
export const isCatalogPage = (value: unknown): value is CatalogPage => {
  if (!value || typeof value !== "object") return false;
  const page = value as Record<string, unknown>;
  return Array.isArray(page.entries) && page.entries.every(isCatalogEntry) && typeof page.total === "number";
};

const fromEntry = (entry: CatalogEntry, cached?: CatalogAsset): CatalogAsset => ({
  id: entry.contentId, name: entry.title, type: creatorType(entry.type) || entry.type,
  ownerId: entry.creatorId, assetId: entry.assetId, coverId: entry.coverId,
  cover: uploadCovers.find(cover => cover.id === entry.coverId)?.url || cached?.cover,
  previewUrl: entry.assetId && entry.audio?.state === 'available' ? apiUrl(`/api/assets/${encodeURIComponent(entry.assetId)}/preview`) : undefined,
  downloadUrl: entry.assetId && entry.audio?.state === 'available' ? apiUrl(`/api/assets/${encodeURIComponent(entry.assetId)}/download`) : undefined,
  productType: entry.type === "beat" ? "beat" : entry.type === "pack" ? "sound-pack" : "sound",
  metadata: entry.audio ? { duration: "--", size: formatFileSize(entry.audio.sizeBytes), format: entry.audio.originalName.split('.').pop()?.toUpperCase() || 'AUDIO' } : cached?.metadata || { duration: "--", size: "Metadata only", format: "--" },
  tags: entry.tagIds.map((label) => ({ label })), color: "#35d0ba", favorite: false,
  waveform: [], publicationStatus: entry.publicationStatus,
  reviewNote: entry.reviewNote,
  localAvailability: entry.audio?.state === 'available' ? undefined : entry.audio?.state === 'missing' ? 'missing' : 'metadata-only', label: "API local catalog",
});

export function mergeCatalogAssets(remote: CatalogAsset[], local: CatalogAsset[]): CatalogAsset[] {
  return Array.from(new Map([...local, ...remote].map((asset) => [asset.id, asset])).values());
}

export class CatalogRepository {
  constructor(private readonly api = new ApiClient(), private readonly scope?: string) {}
  private get authenticated() { return Boolean(this.scope && this.scope !== 'demo'); }
  private read() { return readCatalog(this.scope); }
  private write(assets: CatalogAsset[]) { return writeCatalog(assets, this.scope); }
  private payload(asset: CatalogAsset) {
    return JSON.stringify({ title: asset.name, type: asset.type, tagIds: asset.tags.map(tag => tag.label), publicationStatus: asset.publicationStatus, assetId: asset.assetId, coverId: asset.coverId || uploadCovers.find(cover => cover.url === asset.cover)?.id });
  }
  async list(): Promise<CatalogResult> {
    const result = await this.api.request("/api/catalog", { method: "GET" }, isCatalogPage);
    const local = this.read();
    if (!result.ok) return { assets: this.authenticated ? [] : local, source: "fallback", error: result.error.message };
    const remote = result.data.entries.map(entry => fromEntry(entry, local.find(asset => asset.id === entry.contentId)));
    if (this.authenticated) this.write(remote.filter(asset => asset.ownerId === this.scope));
    return { assets: this.authenticated ? remote : mergeCatalogAssets(remote, local), source: "api" };
  }
  async create(asset: CatalogAsset): Promise<{ asset?: CatalogAsset; source: CatalogSource; error?: string }> {
    if (!creatorType(asset.type)) return { source: "fallback", error: "Solo se admiten Beats y One-shots." };
    const result = await this.api.request("/api/catalog", { method: "POST", body: this.payload(asset) }, isCatalogEntry);
    if (result.ok) {
      const created = fromEntry(result.data, asset);
      this.write(mergeCatalogAssets([created], this.read()));
      return { asset: created, source: "api" };
    }
    if (this.authenticated || (result.error.code !== "NETWORK_ERROR" && result.error.code !== "TIMEOUT")) return { source: "api", error: result.error.message };
    const next = addCatalogAsset(this.read(), asset);
    if (!next) return { source: "fallback", error: "Ya existe un asset con ese nombre y tipo." };
    if (!this.write(next)) return { source: "fallback", error: "No se pudo guardar la subida en este navegador." };
    return { asset: next[0], source: "fallback", error: result.error.message };
  }
  async update(asset: CatalogAsset): Promise<{ asset?: CatalogAsset; source: CatalogSource; error?: string }> {
    const result = await this.api.request(`/api/catalog/${encodeURIComponent(asset.id)}`, { method: "PUT", body: this.payload(asset) }, isCatalogEntry);
    if (result.ok) { const updated = fromEntry(result.data, asset); this.write([updated, ...this.read().filter((item) => item.id !== updated.id)]); return { asset: updated, source: "api" }; }
    if (this.authenticated || (result.error.code !== "NETWORK_ERROR" && result.error.code !== "TIMEOUT")) return { source: "api", error: result.error.message };
    if (!this.write([asset, ...this.read().filter((item) => item.id !== asset.id)])) return { source: "fallback", error: "No se pudieron guardar los cambios." };
    return { asset, source: "fallback" };
  }
  async remove(id: string): Promise<{ deleted?: boolean; source: CatalogSource; error?: string }> {
    const result = await this.api.request(`/api/catalog/${encodeURIComponent(id)}`, { method: "DELETE" }, (value): value is { id: string } => Boolean(value && typeof value === "object" && (value as { id?: unknown }).id === id));
    if (result.ok) { this.write(this.read().filter((item) => item.id !== id)); return { deleted: true, source: "api" }; }
    if (this.authenticated || (result.error.code !== "NETWORK_ERROR" && result.error.code !== "TIMEOUT")) return { source: "api", error: result.error.message };
    this.write(this.read().filter((item) => item.id !== id));
    return { deleted: true, source: "fallback" };
  }
}
