import type { AudioAsset } from "../types";
import type { LocalAssetAvailability } from "../types";

export type CatalogStatus = "draft" | "pending-review" | "published" | "archived";
export type CatalogAsset = AudioAsset & { publicationStatus: CatalogStatus };

const catalogKey = "beatvault:local-catalog";

function isCatalogTag(value: unknown): value is { label: string } {
  return Boolean(value && typeof value === "object" && typeof (value as { label?: unknown }).label === "string");
}

function isCatalogAsset(value: unknown): value is CatalogAsset {
  if (!value || typeof value !== "object") return false;
  const asset = value as Partial<CatalogAsset>;
  return (
    typeof asset.id === "string" &&
    typeof asset.name === "string" &&
    typeof asset.type === "string" &&
    Array.isArray(asset.tags) && asset.tags.every(isCatalogTag) &&
    (asset.localAvailability === undefined || ["session-preview", "metadata-only", "preview-unavailable", "rejected", "missing"].includes(asset.localAvailability as LocalAssetAvailability)) &&
    ["draft", "pending-review", "published", "archived"].includes(
      asset.publicationStatus ?? "",
    )
  );
}

export function readCatalog(): CatalogAsset[] {
  if (typeof localStorage === "undefined") return [];
  try {
    const value: unknown = JSON.parse(localStorage.getItem(catalogKey) ?? "[]");
    return Array.isArray(value) ? value.filter(isCatalogAsset) : [];
  } catch {
    return [];
  }
}

export function writeCatalog(value: CatalogAsset[]) {
  if (typeof localStorage === "undefined") return false;
  try {
    localStorage.setItem(catalogKey, JSON.stringify(value));
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
