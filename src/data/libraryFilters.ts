import type { AudioAsset } from "../types";
import type { CatalogAsset, CatalogStatus } from "./localCatalog";

export type LibraryCategory =
  | "All assets"
  | "Loops"
  | "One-shots"
  | "Vocals"
  | "Presets"
  | "FL Studio Demo Pack";
export type LibrarySort = "curated" | "name" | "type" | "favorites";
export type LibrarySection = "beats" | "sound-packs" | "sounds";

function categoryFor(type: string): Exclude<LibraryCategory, "All assets" | "FL Studio Demo Pack"> {
  return type === "Loop"
    ? "Loops"
    : type === "Vocal"
      ? "Vocals"
      : type === "MIDI" || type === "Preset"
        ? "Presets"
        : "One-shots";
}

export function filterAndSortLibrary(
  assets: AudioAsset[],
  catalogAssets: CatalogAsset[],
  options: {
    query: string;
    category: LibraryCategory;
    section?: LibrarySection;
    favoritesOnly: boolean;
    status: "all" | CatalogStatus;
    sort: LibrarySort;
    favoriteIds: ReadonlySet<string>;
  },
): AudioAsset[] {
  const visibleAssets = Array.from(
    new Map([...assets, ...catalogAssets].map((asset) => [asset.id, asset])).values(),
  );
  const normalizedQuery = options.query.trim().toLocaleLowerCase();
  return visibleAssets
    .filter((asset) => {
      const searchable = [
        asset.name,
        asset.type,
        asset.collection,
        asset.label,
        asset.licenseLabel,
        ...asset.tags.map((tag) => tag.label),
      ].join(" ").toLocaleLowerCase();
      const statusMatches = options.status === "all" ||
        (asset as Partial<CatalogAsset>).publicationStatus === options.status;
      return (
        (!options.section || (asset.productType ?? (asset.collection === "FL Studio Demo Pack" ? "sound-pack" : "sound")) === (options.section === "sound-packs" ? "sound-pack" : options.section === "beats" ? "beat" : "sound")) &&
        (!normalizedQuery || searchable.includes(normalizedQuery)) &&
        (options.category === "All assets" ||
          (options.category === "FL Studio Demo Pack"
            ? asset.collection === options.category
            : categoryFor(asset.type) === options.category)) &&
        (!options.favoritesOnly || options.favoriteIds.has(asset.id)) &&
        statusMatches
      );
    })
    .sort((left, right) => {
      if (options.sort === "name") return left.name.localeCompare(right.name);
      if (options.sort === "type") return left.type.localeCompare(right.type) || left.name.localeCompare(right.name);
      if (options.sort === "favorites") return Number(options.favoriteIds.has(right.id)) - Number(options.favoriteIds.has(left.id));
      return 0;
    });
}
