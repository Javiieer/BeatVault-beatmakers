import { useEffect, useState } from "react";
import { assets } from "../data/mock";
import { AssetRow, PageHeader } from "../components/ui";
import { AudioLines, Grid2X2, Heart, List, Music2, PackageOpen, Plus, Search, X } from "lucide-react";
import { readFavoriteIds, writeFavoriteIds } from "../data/localFavorites";
import {
  hasShortDraft,
  canSendShortDraft,
  parseShortTags,
  readShortDraft,
  saveShortDraft,
  shortDraftChangedEvent,
  shortStatusLabel,
  updateShortDraftStatus,
  type ShortDraft,
  type ShortDraftStatus,
} from "../domains/shorts/localDraft";
import { type CatalogAsset, type CatalogStatus } from "../data/localCatalog";
import { filterAndSortLibrary } from "../data/libraryFilters";
import { getQuery } from "../app/routing";
import type { LibrarySection } from "../data/libraryFilters";
import type { CatalogSource } from "../data/catalogRepository";

const publicationStatusLabels: Record<"all" | CatalogStatus, string> = {
  all: "All states",
  draft: "Draft",
  "pending-review": "Pending review",
  published: "Published",
  archived: "Archived",
};

const librarySortLabels = {
  curated: "Curated order",
  name: "Name A-Z",
  type: "Asset type",
  favorites: "Favorites first",
} as const;

function Library({
  catalogAssets,
  sessionPreviews,
  catalogSource,
  catalogError,
  onUpdateCatalogAsset,
  onDeleteCatalogAsset,
}: {
  catalogAssets: CatalogAsset[];
  sessionPreviews: ReadonlyMap<string, string>;
  catalogSource: CatalogSource;
  catalogError?: string;
  onUpdateCatalogAsset: (asset: CatalogAsset) => Promise<{ error?: string }>;
  onDeleteCatalogAsset: (asset: CatalogAsset) => Promise<{ error?: string }>;
}) {
  const [query, setQuery] = useState(() =>
    getQuery(window.location.hash).get("search") ?? "",
  );
  const [category, setCategory] = useState("All assets");
  const [section, setSection] = useState<LibrarySection>(() => {
    const value = getQuery(window.location.hash).get("section");
    return value === "sound-packs" || value === "sounds" ? value : "beats";
  });
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [view, setView] = useState<"list" | "grid">("list");
  const [status, setStatus] = useState<"all" | CatalogStatus>("all");
  const [sort, setSort] = useState<"curated" | "name" | "type" | "favorites">("curated");
  const [editing, setEditing] = useState<CatalogAsset>();
  const [actionError, setActionError] = useState("");
  const [saving, setSaving] = useState(false);
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(() => {
    const stored = readFavoriteIds();
    return (
      stored ??
      new Set(assets.filter((asset) => asset.favorite).map((asset) => asset.id))
    );
  });
  const [favoriteStorageError, setFavoriteStorageError] = useState(false);
  const [favoriteMessage, setFavoriteMessage] = useState("");
  const categories = [
    "All assets",
    "Loops",
    "One-shots",
    "Vocals",
    "Presets",
    "FL Studio Demo Pack",
  ];
  const sortedAssets = filterAndSortLibrary(assets, catalogAssets, {
    query, category: category as Parameters<typeof filterAndSortLibrary>[2]["category"], section,
    favoritesOnly, status, sort, favoriteIds,
  });
  const toggleFavorite = (id: string) =>
    setFavoriteIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      const saved = writeFavoriteIds(next);
      setFavoriteStorageError(!saved);
      setFavoriteMessage(
        saved
          ? next.has(id)
            ? "Added to favorites"
            : "Removed from favorites"
          : "Favorite updated for this session only; local storage is unavailable.",
      );
      return next;
    });
  const [localShortDraft, setLocalShortDraft] = useState<ShortDraft>(() =>
    readShortDraft(),
  );
  const [shortEditorOpen, setShortEditorOpen] = useState(false);
  const [shortEditorDraft, setShortEditorDraft] = useState<ShortDraft>(() =>
    readShortDraft(),
  );
  const [shortDraftError, setShortDraftError] = useState("");
  useEffect(() => {
    if (!shortEditorOpen) return;
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") setShortEditorOpen(false);
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [shortEditorOpen]);
  useEffect(() => {
    const syncDraft = () => setLocalShortDraft(readShortDraft());
    window.addEventListener(shortDraftChangedEvent, syncDraft);
    window.addEventListener("storage", syncDraft);
    return () => {
      window.removeEventListener(shortDraftChangedEvent, syncDraft);
      window.removeEventListener("storage", syncDraft);
    };
  }, []);
  useEffect(() => {
    const applyGlobalSearch = (event: Event) => {
      const queryEvent = event as CustomEvent<string>;
      if (typeof queryEvent.detail === "string") setQuery(queryEvent.detail);
    };
    window.addEventListener("beatvault:library-search", applyGlobalSearch);
    return () =>
      window.removeEventListener("beatvault:library-search", applyGlobalSearch);
  }, []);
  const localShortTags = parseShortTags(localShortDraft.tags);
  const hasLocalShortDraft = hasShortDraft(localShortDraft);
  const updateLocalShortDraft = (status: ShortDraftStatus) => {
    if (status === "pending") {
      setShortDraftError(
        canSendShortDraft(localShortDraft)
          ? "Vuelve a seleccionar el video en Shorts antes de enviarlo a revisión."
          : "Añade un video, caption y al menos un tag antes de revisión.",
      );
      setShortEditorDraft(localShortDraft);
      setShortEditorOpen(true);
      return;
    }
    const result = updateShortDraftStatus(localShortDraft, status);
    if (!result.saved) {
      setShortDraftError(
        "No se pudo actualizar el estado en el almacenamiento local.",
      );
      return;
    }
    setLocalShortDraft(result.draft);
    setShortDraftError("");
  };
  return (
    <>
      {editing && <div className="modal-backdrop" onClick={() => !saving && setEditing(undefined)}><section className="panel short-draft-editor" role="dialog" aria-modal="true" aria-labelledby="catalog-edit-title" onClick={(event) => event.stopPropagation()}>
        <div className="modal-heading"><h2 id="catalog-edit-title">Edit catalog metadata</h2><button type="button" className="modal-close" aria-label="Close editor" onClick={() => setEditing(undefined)}><X size={18} aria-hidden="true" /></button></div>
        <label className="short-upload-field" htmlFor="catalog-name">Name<input id="catalog-name" value={editing.name} onChange={(event) => setEditing({ ...editing, name: event.target.value })} /></label>
        <label className="short-upload-field" htmlFor="catalog-type">Type<input id="catalog-type" value={editing.type} onChange={(event) => setEditing({ ...editing, type: event.target.value })} /></label>
        <label className="short-upload-field" htmlFor="catalog-tags">Tags<input id="catalog-tags" value={editing.tags.map((tag) => tag.label).join(", ")} onChange={(event) => setEditing({ ...editing, tags: event.target.value.split(",").map((label) => ({ label: label.trim() })).filter((tag) => tag.label) })} /></label>
        <label className="short-upload-field" htmlFor="catalog-status">Publication status<select id="catalog-status" value={editing.publicationStatus} onChange={(event) => setEditing({ ...editing, publicationStatus: event.target.value as CatalogStatus })}>{Object.keys(publicationStatusLabels).filter((value) => value !== "all").map((value) => <option key={value}>{value}</option>)}</select></label>
        {actionError && <small className="upload-error" role="alert">{actionError}</small>}
        <div className="modal-actions"><button type="button" className="button ghost" disabled={saving} onClick={() => setEditing(undefined)}>Cancel</button><button type="button" className="button" disabled={saving} onClick={() => { setSaving(true); setActionError(""); void onUpdateCatalogAsset(editing).then((result) => { setSaving(false); if (result.error) setActionError(result.error); else setEditing(undefined); }); }}>{saving ? "Saving..." : "Save metadata"}</button></div>
      </section></div>}
      <PageHeader
        eyebrow="Asset library"
        title="Your sound, organized"
        description="1,248 assets ready to spark your next idea."
        action={
          <a className="button" href="#/upload">
             <Plus size={16} aria-hidden="true" /> Import assets
          </a>
        }
      />
       <nav className="library-section-nav" aria-label="Library sections">
         {([['beats', 'Beats', Music2], ['sound-packs', 'Sound Packs', PackageOpen], ['sounds', 'Sounds', AudioLines]] as const).map(([value, label, Icon]) => (
           <a className={section === value ? "active" : ""} aria-current={section === value ? "page" : undefined} href={`#/library?section=${value}`} onClick={() => setSection(value)} key={value}>
             <Icon size={16} strokeWidth={1.8} aria-hidden="true" />
             <span>{label}</span>
           </a>
         ))}
       </nav>
      <p className={`action-feedback${catalogError ? " error" : ""}`} role={catalogError ? "status" : undefined}>
        {catalogSource === "api" ? "Source: local API catalog" : "Source: local fallback"}{catalogError ? " · API unavailable; using local catalog." : ""}
      </p>
      {hasLocalShortDraft && (
        <section className="library-short-bridge" aria-label="Shorts local draft">
          <div>
            <p className="eyebrow">Shorts workspace</p>
            <strong>{localShortDraft.caption || "Untitled Short"}</strong>
            <small>
              {localShortDraft.fileName || "No file selected"} ·{" "}
              {localShortTags.length
                ? localShortTags.map((tag) => `#${tag}`).join(" ")
                : "No tags"}
            </small>
          </div>
           <span className={`publication-pill ${localShortDraft.publicationStatus}`}>
             {shortStatusLabel(localShortDraft.publicationStatus)}
           </span>
           {shortDraftError && <small className="upload-error" role="alert">{shortDraftError}</small>}
            <button type="button" className="button ghost" onClick={() => { setShortEditorDraft(localShortDraft); setShortDraftError(""); setShortEditorOpen(true); }}>
             Edit draft
           </button>
           <a className="button ghost" href="#/shorts">Open Shorts</a>
          {localShortDraft.publicationStatus === "archived" ? (
             <button type="button" className="text-button" onClick={() => updateLocalShortDraft("draft")}>
              Restore
            </button>
          ) : (
            <>
              {localShortDraft.publicationStatus !== "pending" && (
                <a className="text-button" href="#/shorts">
                  Review in Shorts
                </a>
              )}
               <button type="button" className="text-button" onClick={() => updateLocalShortDraft("archived")}>
                Archive
              </button>
            </>
          )}
         </section>
       )}
       {shortEditorOpen && (
         <div className="modal-backdrop" onClick={() => setShortEditorOpen(false)}>
           <section className="panel short-draft-editor" role="dialog" aria-modal="true" aria-labelledby="short-draft-title" onClick={(event) => event.stopPropagation()}>
             <div className="modal-heading">
               <div><p className="eyebrow">Shorts workspace</p><h2 id="short-draft-title">Edit local draft</h2></div>
                 <button type="button" className="modal-close" onClick={() => setShortEditorOpen(false)} aria-label="Close draft editor"><X size={18} aria-hidden="true" /></button>
             </div>
             <p className="short-draft-file">Video reference: {shortEditorDraft.fileName || "No video selected"}</p>
              <label className="short-upload-field" htmlFor="library-short-caption">Caption<input id="library-short-caption" value={shortEditorDraft.caption} onChange={(event) => setShortEditorDraft({ ...shortEditorDraft, caption: event.target.value })} /></label>
              <label className="short-upload-field" htmlFor="library-short-tags">Tags<input id="library-short-tags" value={shortEditorDraft.tags} onChange={(event) => setShortEditorDraft({ ...shortEditorDraft, tags: event.target.value })} placeholder="#trap #808 #beats" /></label>
             {shortDraftError && <small className="upload-error" role="alert">{shortDraftError}</small>}
             <div className="modal-actions">
                <button type="button" className="button ghost" onClick={() => setShortEditorOpen(false)}>Cancel</button>
                 <button type="button" className="button" onClick={() => { if (shortEditorDraft.publicationStatus === "pending" && !canSendShortDraft(shortEditorDraft)) { setShortDraftError("Añade un video, caption y al menos un tag antes de revisión."); return; } const result = saveShortDraft(shortEditorDraft); if (!result.saved) { setShortDraftError("No se pudo guardar el draft en el almacenamiento local. Los cambios no se han guardado."); return; } setLocalShortDraft(result.draft); setShortDraftError(""); setShortEditorOpen(false); }}>Save locally</button>
             </div>
           </section>
         </div>
       )}
      <div className="library-toolbar">
         <label className="search" htmlFor="library-search">
           <Search size={17} aria-hidden="true" />
          <span className="sr-only">Search by name, type, or tag</span>
          <input
             id="library-search"
             value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search by name, type, or tag..."
          />
        </label>
         <div className="filter-chips" aria-label="Asset type and collection filters">
          {categories.map((item) => (
             <button
               type="button"
              className={category === item ? "active" : ""}
              aria-pressed={category === item}
              onClick={() => setCategory(item)}
              key={item}
            >
              {item}
            </button>
          ))}
           <button
             type="button"
            className={
              favoritesOnly ? "active favorite-filter" : "favorite-filter"
            }
            aria-pressed={favoritesOnly}
            onClick={() => setFavoritesOnly((value) => !value)}
          >
             <Heart size={16} fill={favoritesOnly ? "currentColor" : "none"} aria-hidden="true" /> Favorites
          </button>
         </div>
         <label className="library-sort" htmlFor="library-sort">
           <span>Sort</span>
           <select id="library-sort" value={sort} onChange={(event) => setSort(event.target.value as typeof sort)}>
             <option value="curated">Curated order</option>
             <option value="name">Name A-Z</option>
             <option value="type">Asset type</option>
             <option value="favorites">Favorites first</option>
           </select>
         </label>
         <div className="view-toggle" aria-label="Asset view">
           <button
             type="button"
            className={view === "list" ? "active" : ""}
            aria-label="List view"
            aria-pressed={view === "list"}
            onClick={() => setView("list")}
          >
             <List size={17} aria-hidden="true" />
          </button>
           <button
             type="button"
            className={view === "grid" ? "active" : ""}
            aria-label="Grid view"
            aria-pressed={view === "grid"}
            onClick={() => setView("grid")}
          >
             <Grid2X2 size={17} aria-hidden="true" />
          </button>
        </div>
       </div>
       {favoriteMessage && (
         <p className={`action-feedback${favoriteStorageError ? " error" : ""}`} role={favoriteStorageError ? "alert" : "status"}>
           {favoriteMessage}
         </p>
       )}
       <div className="status-filters" aria-label="Publication status">
        {(
          ["all", "draft", "pending-review", "published", "archived"] as const
        ).map((item) => (
           <button
             type="button"
             aria-pressed={status === item}
            className={status === item ? "active" : ""}
            onClick={() => setStatus(item)}
            key={item}
          >
             {publicationStatusLabels[item]}
          </button>
        ))}
      </div>
      <section className="panel library-panel">
        <div className="section-heading">
          <h2>
             {category} <small>{sortedAssets.length}</small>
           </h2>
           <span className="muted">
             {librarySortLabels[sort]}
             {status !== "all" ? ` · ${publicationStatusLabels[status]}` : ""}
           </span>
         </div>
         {sortedAssets.length === 0 ? (
          <div className="empty-state" role="status">
             <Search size={24} aria-hidden="true" />
            <h2>No assets found</h2>
            <p>
              Try another search or clear a filter to keep exploring your
              library.
            </p>
            <button
              type="button"
              className="button ghost"
              onClick={() => {
                setQuery("");
                setCategory("All assets");
                setFavoritesOnly(false);
                setStatus("all");
              }}
            >
              Clear filters
            </button>
          </div>
        ) : (
          <div className={`asset-list ${view === "grid" ? "grid-view" : ""}`}>
             {sortedAssets.map((asset) => (
               <AssetRow
                 asset={{ ...asset, previewUrl: sessionPreviews.get(asset.id), localAvailability: sessionPreviews.has(asset.id) ? "session-preview" : asset.localAvailability === "session-preview" ? "missing" : asset.localAvailability }}
                favorite={favoriteIds.has(asset.id)}
                onFavorite={() => toggleFavorite(asset.id)}
                 onEdit={catalogAssets.some((item) => item.id === asset.id) ? () => setEditing(catalogAssets.find((item) => item.id === asset.id)) : undefined}
                 onDelete={catalogAssets.some((item) => item.id === asset.id) ? () => { if (!window.confirm(`Archive ${asset.name}?`)) return; setSaving(true); setActionError(""); void onDeleteCatalogAsset(asset as CatalogAsset).then((result) => { setSaving(false); if (result.error) setActionError(result.error); }); } : undefined}
                 key={asset.id}
              />
            ))}
          </div>
        )}
      </section>
    </>
  );
}

export { Library };
