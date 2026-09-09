import { beforeEach, describe, expect, it, vi } from "vitest";
import { isLocalProject, readLocalProjects, writeLocalProjects } from "./localProjects";
import { readFavoriteIds, writeFavoriteIds } from "./localFavorites";
import { addCatalogAsset, readCatalog, writeCatalog } from "./localCatalog";
import type { Project } from "../types";
import type { CatalogAsset } from "./localCatalog";
import { formatDuration, formatFileSize, validateUploadFile } from "./localUploadDraft";

const storage = new Map<string, string>();
Object.defineProperty(globalThis, "localStorage", {
  configurable: true,
  value: {
    clear: () => storage.clear(),
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
    removeItem: (key: string) => storage.delete(key),
  },
});

const project: Project = {
  id: "project-1", name: "Test project", genre: "Trap", bpm: 140,
  key: "C minor", modified: "Today", status: "Draft", color: "cyan", tracks: 2,
};

const asset: CatalogAsset = {
  id: "asset-1", name: "Test beat", type: "Beat", publicationStatus: "draft",
  metadata: { duration: "1:00", size: "1 MB", format: "WAV" }, tags: [], color: "cyan",
  favorite: false, waveform: [0.2, 0.8],
};

beforeEach(() => localStorage.clear());

describe("project validation and storage", () => {
  it("accepts valid projects and rejects invalid BPM or shape", () => {
    expect(isLocalProject(project)).toBe(true);
    expect(isLocalProject({ ...project, bpm: 300 })).toBe(false);
    expect(isLocalProject({ ...project, status: "Unknown" })).toBe(false);
  });

  it("round trips projects and ignores malformed entries", () => {
    localStorage.setItem("beatvault:local-projects", JSON.stringify([project, { id: 1 }]));
    expect(readLocalProjects()).toEqual({ projects: [project], error: false });
    expect(writeLocalProjects([project])).toBe(true);
    expect(JSON.parse(localStorage.getItem("beatvault:local-projects") ?? "null")).toEqual([project]);
  });
});

describe("local upload helpers", () => {
  it("formats sizes and durations consistently", () => {
    expect(formatFileSize(1024)).toBe("1.0 KB");
    expect(formatFileSize(1024 * 1024)).toBe("1.0 MB");
    expect(formatDuration(125.9)).toBe("2:05");
    expect(formatDuration(null)).toBe("Not available");
  });

  it("validates empty, oversized, supported and unsupported audio files", () => {
    expect(validateUploadFile({ name: "", size: 1, type: "audio/mpeg" })).toBe("empty");
    expect(validateUploadFile({ name: "large.wav", size: 500 * 1024 * 1024 + 1, type: "audio/wav" })).toBe("too-large");
    expect(validateUploadFile({ name: "beat.mp3", size: 10, type: "audio/mpeg" })).toBeNull();
    expect(validateUploadFile({ name: "beat.xyz", size: 10, type: "audio/x-unknown" })).toBe("unsupported-audio");
    expect(validateUploadFile({ name: "preset.fxp", size: 10, type: "application/octet-stream" })).toBe("unsupported-audio");
  });
});

describe("localStorage adapters", () => {
  it("round trips favorites and filters non-string IDs", () => {
    localStorage.setItem("beatvault:library-favorites", JSON.stringify(["a", 2]));
    expect(readFavoriteIds()).toEqual(new Set(["a"]));
    expect(writeFavoriteIds(new Set(["b"]))).toBe(true);
  });

  it("returns safe defaults for malformed catalog data", () => {
    localStorage.setItem("beatvault:local-catalog", "not-json");
    expect(readCatalog()).toEqual([]);
    expect(writeCatalog([])).toBe(true);
  });

  it("ignores invalid catalog entries while retaining valid assets", () => {
    localStorage.setItem("beatvault:local-catalog", JSON.stringify([asset, { id: 1 }, null]));
    expect(readCatalog()).toEqual([asset]);
    localStorage.setItem("beatvault:local-catalog", JSON.stringify({ assets: [asset] }));
    expect(readCatalog()).toEqual([]);
  });

  it("returns safe defaults when localStorage is unavailable or throws", () => {
    const originalStorage = globalThis.localStorage;
    Object.defineProperty(globalThis, "localStorage", { configurable: true, value: undefined });
    expect(readCatalog()).toEqual([]);
    expect(writeCatalog([])).toBe(false);
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: { getItem: () => { throw new Error("read failed"); }, setItem: () => { throw new Error("write failed"); } },
    });
    expect(readCatalog()).toEqual([]);
    expect(writeCatalog([])).toBe(false);
    Object.defineProperty(globalThis, "localStorage", { configurable: true, value: originalStorage });
  });

  it("ignores catalog assets with malformed tags", () => {
    const asset = { id: "asset", name: "Asset", type: "Loop", tags: [null], publicationStatus: "published" };
    localStorage.setItem("beatvault:local-catalog", JSON.stringify([asset]));
    expect(readCatalog()).toEqual([]);
  });

  it("deduplicates by name and type and preserves IDs on collisions", () => {
    expect(addCatalogAsset([asset], { ...asset, id: "other", name: asset.name })).toBeNull();
    const existing = { ...asset, id: "asset-1-1234567890" };
    vi.spyOn(Date, "now").mockReturnValue(1234567890);
    const result = addCatalogAsset([existing, asset], { ...asset, name: "Another beat" });
    expect(result?.map((item) => item.id)).toEqual(["asset-1-1234567890-2", "asset-1-1234567890", "asset-1"]);
    vi.restoreAllMocks();
  });
});
