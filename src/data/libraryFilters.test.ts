import { describe, expect, it } from "vitest";
import { filterAndSortLibrary } from "./libraryFilters";
import type { AudioAsset } from "../types";

const asset = (id: string, name: string, type: string, collection?: string): AudioAsset => ({
  id, name, type, collection, favorite: false, color: "cyan", waveform: [],
  metadata: { duration: "1", size: "1", format: "wav" }, tags: [{ label: "808" }],
});

describe("library filtering and sorting", () => {
  const items = [asset("1", "Zebra", "Loop"), asset("2", "Alpha", "One-shot", "FL Studio Demo Pack")];

  it("filters by query, category, collection, and favorites", () => {
    expect(filterAndSortLibrary(items, [], {
      query: "808", category: "Loops", favoritesOnly: false, status: "all", sort: "curated", favoriteIds: new Set(),
    }).map((item) => item.id)).toEqual(["1"]);
    expect(filterAndSortLibrary(items, [], {
      query: "", category: "FL Studio Demo Pack", favoritesOnly: true, status: "all", sort: "curated", favoriteIds: new Set(["2"]),
    }).map((item) => item.id)).toEqual(["2"]);
  });

  it("sorts by name and keeps curated order", () => {
    expect(filterAndSortLibrary(items, [], {
      query: "", category: "All assets", favoritesOnly: false, status: "all", sort: "name", favoriteIds: new Set(),
    }).map((item) => item.name)).toEqual(["Alpha", "Zebra"]);
  });

  it("keeps sound packs out of Sounds and maps the demo as a bundle", () => {
    const pack = asset("pack", "FL Studio Demo Pack", "Sound Pack", "FL Studio Demo Pack");
    pack.productType = "sound-pack";
    expect(filterAndSortLibrary([pack], [], { query: "", category: "All assets", section: "sound-packs", favoritesOnly: false, status: "all", sort: "curated", favoriteIds: new Set() })).toHaveLength(1);
    expect(filterAndSortLibrary([pack], [], { query: "", category: "All assets", section: "sounds", favoritesOnly: false, status: "all", sort: "curated", favoriteIds: new Set() })).toHaveLength(0);
  });
});
