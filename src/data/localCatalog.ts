import type { AudioAsset } from "../types";
import type { LocalAssetAvailability } from "../types";
import { scopedKey } from './storageScope';
import type { CatalogEntry } from '../domains/catalog/types';

export type CatalogStatus = "draft" | "pending-review" | "published" | "rejected" | "archived";
export type CatalogAsset = AudioAsset & { publicationStatus: CatalogStatus; ownerId?: string; assetId?: string; coverId?: CatalogEntry['coverId']; reviewNote?: string };

const catalogKey = "beatvault:local-catalog";

function withoutSessionUrls(asset: CatalogAsset): CatalogAsset {
  const persistent = { ...asset };
  if (persistent.previewUrl?.startsWith("blob:")) delete persistent.previewUrl;
  if (persistent.downloadUrl?.startsWith("blob:")) delete persistent.downloadUrl;
  return persistent;
}

function isCatalogTag(value: unknown): value is { label: string } {
  return Boolean(value && typeof value === "object" && typeof (value as { label?: unknown }).label === "string");
}

function isCatalogAsset(value: unknown): value is CatalogAsset {
  if (!value || typeof value !== "object") return false;
  const asset = value as Partial<CatalogAsset>;
  return (
    typeof asset.id === "string" &&
    typeof asset.name === "string" &&
    typeof asset.type === "string" && (asset.reviewNote === undefined || typeof asset.reviewNote === 'string' && asset.reviewNote.length <= 160) &&
    Array.isArray(asset.tags) && asset.tags.every(isCatalogTag) &&
    (asset.localAvailability === undefined || ["session-preview", "metadata-only", "preview-unavailable", "rejected", "missing"].includes(asset.localAvailability as LocalAssetAvailability)) &&
    ["draft", "pending-review", "published", "rejected", "archived"].includes(
      asset.publicationStatus ?? "",
    )
  );
}

export function readCatalog(scope?: string): CatalogAsset[] {
  if (typeof localStorage === "undefined") return [];
  try {
    const value: unknown = JSON.parse(localStorage.getItem(scopedKey(catalogKey, scope)) ?? "[]");
    return Array.isArray(value) ? value.filter(isCatalogAsset).map(withoutSessionUrls) : [];
  } catch {
    return [];
  }
}

export function writeCatalog(value: CatalogAsset[], scope?: string) {
  if (typeof localStorage === "undefined") return false;
  try {
    localStorage.setItem(scopedKey(catalogKey, scope), JSON.stringify(value.map(withoutSessionUrls)));
    return true;
  } catch {
    return false;
  }
}

export function addCatalogAsset(
  current: CatalogAsset[],
  asset: CatalogAsset,
) {
  if (current.some((item) => item.name === asset.name && item.type === asset.type))
    return null;
  let uniqueId = asset.id;
  let suffix = 0;
  while (current.some((item) => item.id === uniqueId)) {
    suffix += 1;
    uniqueId = `${asset.id}-${Date.now()}${suffix > 1 ? `-${suffix}` : ""}`;
  }
  const nextAsset = { ...asset, id: uniqueId };
  return [nextAsset, ...current.filter((item) => item.id !== nextAsset.id)];
}
