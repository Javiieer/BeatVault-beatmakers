import { ApiClient, apiUrl } from "../api/client";
import type { CatalogEntry, CatalogPage } from "../domains/catalog/types";
import type { CatalogAsset } from "./localCatalog";
import { addCatalogAsset, readCatalog, writeCatalog } from "./localCatalog";
import { creatorType, uploadCovers } from "./creatorUploads";
import { formatFileSize } from './localUploadDraft';

export type CatalogSource = "api" | "fallback";
export type CatalogResult = { assets: CatalogAsset[]; source: CatalogSource; error?: string };
export type MarketplaceFilters = { query?: string; type?: 'beat' | 'sample'; tag?: string; creatorId?: string; cursor?: string; limit?: number };
export type MarketplacePage = { assets: CatalogAsset[]; total: number; nextCursor?: string; source: CatalogSource; error?: string };

const statuses = ["draft", "pending-review", "published", "archived", "rejected"] as const;
const contentTypes = ['sample', 'beat', 'loop', 'vocal', 'midi', 'preset', 'pack', 'stem', 'template'];
const isPurchaseOffer = (value: unknown): boolean => {
  if (!value || typeof value !== 'object') return false
  const offer = value as Record<string, unknown>
  return typeof offer.id === 'string' && typeof offer.label === 'string' && Number.isSafeInteger(offer.amountMinor) &&
    Number(offer.amountMinor) >= 100 && offer.currency === 'USD' && Array.isArray(offer.deliverables) && offer.deliverables.every(item => typeof item === 'string') &&
    (offer.available === undefined || typeof offer.available === 'boolean') &&
    (offer.unavailableReason === undefined || typeof offer.unavailableReason === 'string' && offer.unavailableReason.length <= 300)
}
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
      !['available', 'missing', 'metadata-only'].includes(audio.state as string) ||
      (audio.previewReady !== undefined && typeof audio.previewReady !== 'boolean')) return false;
  }
  if (item.purchaseOffers !== undefined && (!Array.isArray(item.purchaseOffers) || !item.purchaseOffers.every(isPurchaseOffer))) return false;
  return typeof item.contentId === "string" && typeof item.title === "string" &&
    typeof item.type === 'string' && contentTypes.includes(item.type) &&
    typeof item.creatorId === "string" && Array.isArray(item.tagIds) &&
    item.tagIds.every((tag) => typeof tag === "string") && Array.isArray(item.previewIds) &&
    item.previewIds.every((preview) => typeof preview === "string") &&
    statuses.includes(item.publicationStatus as (typeof statuses)[number]) &&
    (item.reviewNote === undefined || typeof item.reviewNote === 'string' && item.reviewNote.length <= 160) &&
    (item.creatorName === undefined || typeof item.creatorName === 'string') &&
    (item.previewUrl === undefined || typeof item.previewUrl === 'string') &&
    (item.artworkUrl === undefined || typeof item.artworkUrl === 'string');
};
export const isCatalogPage = (value: unknown): value is CatalogPage => {
  if (!value || typeof value !== "object") return false;
  const page = value as Record<string, unknown>;
  return Array.isArray(page.entries) && page.entries.every(isCatalogEntry) && typeof page.total === "number" && Number.isSafeInteger(page.total) && page.total >= 0 && (page.nextCursor === undefined || typeof page.nextCursor === 'string' && page.nextCursor.length <= 80);
};

const fromEntry = (entry: CatalogEntry, cached?: CatalogAsset): CatalogAsset => ({
  id: entry.contentId, name: entry.title, type: creatorType(entry.type) || entry.type,
  ownerId: entry.creatorId, creatorName: entry.creatorName, assetId: entry.assetId, coverId: entry.coverId,
  cover: entry.artworkUrl || uploadCovers.find(cover => cover.id === entry.coverId)?.url || cached?.cover,
  previewUrl: entry.previewUrl || (entry.assetId && entry.audio?.state === 'available' ? apiUrl(`/api/assets/${encodeURIComponent(entry.assetId)}/preview`) : undefined),
  downloadUrl: entry.assetId && entry.audio?.state === 'available' ? apiUrl(`/api/assets/${encodeURIComponent(entry.assetId)}/download`) : undefined,
  previewReady: entry.audio?.previewReady,
  productType: entry.type === "beat" ? "beat" : entry.type === "pack" ? "sound-pack" : "sound",
  metadata: entry.audio ? { duration: "--", size: formatFileSize(entry.audio.sizeBytes), format: entry.audio.originalName.split('.').pop()?.toUpperCase() || 'AUDIO' } : cached?.metadata || { duration: "--", size: "Metadata only", format: "--" },
  tags: entry.tagIds.map((label) => ({ label })), color: "#35d0ba", favorite: false,
  waveform: [], publicationStatus: entry.publicationStatus,
  reviewNote: entry.reviewNote,
  purchaseOffers: entry.purchaseOffers,
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
    const result = await this.api.request("/api/catalog", { method: "GET" }, isCatalogPage, 15000);
    const local = this.read();
    if (!result.ok) return { assets: this.authenticated ? [] : local, source: "fallback", error: result.error.message };
    const remote = result.data.entries.map(entry => fromEntry(entry, local.find(asset => asset.id === entry.contentId)));
    if (this.authenticated) this.write(remote.filter(asset => asset.ownerId === this.scope));
    return { assets: this.authenticated ? remote : mergeCatalogAssets(remote, local), source: "api" };
  }
  async publishedDetail(id: string): Promise<{ asset?: CatalogAsset; error?: string; notFound?: boolean }> {
    if (!id || id.length > 100) return { notFound: true };
    const result = await this.api.request(`/api/catalog/${encodeURIComponent(id)}`, { method: 'GET' }, isCatalogEntry, 8000);
    if (!result.ok) return ['NOT_FOUND', 'CATALOG_NOT_FOUND'].includes(result.error.code) ? { notFound: true } : { error: result.error.message };
    if (result.data.contentId !== id || result.data.publicationStatus !== 'published') return { notFound: true };
    // Public detail never hydrates from an owner's draft or a stale browser cache.
    return { asset: fromEntry(result.data) };
  }
  async marketplacePage(filters: MarketplaceFilters = {}): Promise<MarketplacePage> {
    const params = new URLSearchParams();
    if (filters.query?.trim()) params.set('q', filters.query.trim());
    if (filters.type) params.set('type', filters.type);
    if (filters.tag?.trim()) params.set('tag', filters.tag.trim());
    if (filters.creatorId) params.set('creatorId', filters.creatorId);
    if (filters.cursor) params.set('cursor', filters.cursor);
    params.set('limit', String(filters.limit ?? 24));
    const result = await this.api.request(`/api/marketplace?${params}`, { method: 'GET' }, isCatalogPage, 8000);
    if (result.ok) return { assets: result.data.entries.map(entry => fromEntry(entry)), total: result.data.total, nextCursor: result.data.nextCursor, source: 'api' };
    if (this.authenticated || (result.error.code !== 'NETWORK_ERROR' && result.error.code !== 'TIMEOUT')) {
      return { assets: [], total: 0, source: 'api', error: result.error.message };
    }
    const local = this.read().filter(asset => asset.publicationStatus === 'published' && creatorType(asset.type));
    const query = filters.query?.trim().toLocaleLowerCase('en');
    const filtered = local.filter(asset => (!filters.type || creatorType(asset.type)?.toLocaleLowerCase('en') === filters.type) &&
      (!filters.tag || asset.tags.some(item => item.label.toLocaleLowerCase('en') === filters.tag!.toLocaleLowerCase('en'))) &&
      (!query || `${asset.name} ${asset.creatorName || ''} ${asset.tags.map(item => item.label).join(' ')}`.toLocaleLowerCase('en').includes(query)));
    const limit = filters.limit ?? 24;
    const cursorIndex = filters.cursor ? filtered.findIndex(asset => asset.id === filters.cursor) : -1;
    const start = filters.cursor ? cursorIndex + 1 : 0;
    if (filters.cursor && cursorIndex < 0) return { assets: [], total: filtered.length, source: 'fallback', error: 'Marketplace cursor is no longer valid.' };
    const assets = filtered.slice(start, start + limit);
    return { assets, total: filtered.length, nextCursor: start + assets.length < filtered.length ? assets.at(-1)?.id : undefined, source: 'fallback', error: result.error.message };
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
  async retryPreview(assetId: string): Promise<{ asset?: CatalogAsset; error?: string }> {
    const result = await this.api.request(`/api/assets/${encodeURIComponent(assetId)}/preview/process`, { method: 'POST' }, (value): value is { id: string; previewReady: true } => Boolean(value && typeof value === 'object' && (value as { id?: unknown }).id === assetId && (value as { previewReady?: unknown }).previewReady === true));
    if (!result.ok) return { error: result.error.message };
    const refreshed = await this.list();
    return { asset: refreshed.assets.find(asset => asset.assetId === assetId), error: refreshed.error };
  }
}
