import { useEffect, useState } from "react";
import { assets } from "../data/mock";
import { AssetRow, PageHeader } from "../components/ui";
import { AudioLines, Grid2X2, Heart, List, Music2, PackageOpen, Plus, RotateCcw, Search, X } from "lucide-react";
import { readFavoriteIds, writeFavoriteIds } from "../data/localFavorites";
import { type CatalogAsset, type CatalogStatus } from "../data/localCatalog";
import { filterAndSortLibrary } from "../data/libraryFilters";
import { getQuery } from "../app/routing";
import type { LibrarySection } from "../data/libraryFilters";
import type { CatalogSource } from "../data/catalogRepository";
import "../styles/library.css";

const publicationStatusLabels: Record<"all" | CatalogStatus, string> = {
  all: "Todos",
  draft: "Borrador",
  "pending-review": "En revisión",
  published: "Publicado",
  rejected: "Rechazado",
  archived: "Archivado",
};

const categoryLabels: Record<string, string> = {
  "All assets": "Todo",
  Loops: "Loops",
  "One-shots": "One-shots",
  Vocals: "Voces",
  Presets: "Presets",
  "FL Studio Demo Pack": "FL Studio Demo Pack",
};

const librarySortLabels = {
  curated: "Orden recomendado",
  name: "Nombre A-Z",
  type: "Tipo de sonido",
  favorites: "Favoritos primero",
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
    return value === "beats" || value === "sound-packs" ? value : "sounds";
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
  const categories = section === "sound-packs"
    ? ["All assets", "FL Studio Demo Pack"]
    : section === "beats"
      ? ["All assets"]
      : ["All assets", "Loops", "One-shots", "Vocals", "Presets"];
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
  useEffect(() => {
    const applyGlobalSearch = (event: Event) => {
      const queryEvent = event as CustomEvent<string>;
      if (typeof queryEvent.detail === "string") setQuery(queryEvent.detail);
    };
    window.addEventListener("beatvault:library-search", applyGlobalSearch);
    return () =>
      window.removeEventListener("beatvault:library-search", applyGlobalSearch);
  }, []);
  const sectionAssets = filterAndSortLibrary(assets, catalogAssets, {
    query: "", category: "All assets", section, favoritesOnly: false,
    status: "all", sort: "curated", favoriteIds,
  });
  const clearFilters = () => {
    setQuery("");
    setCategory("All assets");
    setFavoritesOnly(false);
    setStatus("all");
    setSort("curated");
  };
  return (
    <main className="library-page">
      {editing && <div className="modal-backdrop" onClick={() => !saving && setEditing(undefined)}><section className="panel short-draft-editor" role="dialog" aria-modal="true" aria-labelledby="catalog-edit-title" onClick={(event) => event.stopPropagation()}>
        <div className="modal-heading"><h2 id="catalog-edit-title">Editar sonido</h2><button type="button" className="modal-close" aria-label="Cerrar editor" onClick={() => setEditing(undefined)}><X size={18} aria-hidden="true" /></button></div>
        <label className="short-upload-field" htmlFor="catalog-name">Nombre<input id="catalog-name" value={editing.name} onChange={(event) => setEditing({ ...editing, name: event.target.value })} /></label>
        <label className="short-upload-field" htmlFor="catalog-type">Tipo<input id="catalog-type" value={editing.type} onChange={(event) => setEditing({ ...editing, type: event.target.value })} /></label>
        <label className="short-upload-field" htmlFor="catalog-tags">Tags<input id="catalog-tags" value={editing.tags.map((tag) => tag.label).join(", ")} onChange={(event) => setEditing({ ...editing, tags: event.target.value.split(",").map((label) => ({ label: label.trim() })).filter((tag) => tag.label) })} /></label>
        <label className="short-upload-field" htmlFor="catalog-status">Estado<select id="catalog-status" value={editing.publicationStatus} onChange={(event) => setEditing({ ...editing, publicationStatus: event.target.value as CatalogStatus })}>{Object.keys(publicationStatusLabels).filter((value) => value !== "all").map((value) => <option key={value} value={value}>{publicationStatusLabels[value as CatalogStatus]}</option>)}</select></label>
        {actionError && <small className="upload-error" role="alert">{actionError}</small>}
        <div className="modal-actions"><button type="button" className="button ghost" disabled={saving} onClick={() => setEditing(undefined)}>Cancelar</button><button type="button" className="button" disabled={saving} onClick={() => { setSaving(true); setActionError(""); void onUpdateCatalogAsset(editing).then((result) => { setSaving(false); if (result.error) setActionError(result.error); else setEditing(undefined); }); }}>{saving ? "Guardando…" : "Guardar cambios"}</button></div>
      </section></div>}
      <PageHeader
        eyebrow="TU ESPACIO CREATIVO"
        title="Biblioteca"
        description="Encuentra, escucha y organiza tus sonidos."
        action={
          <a className="button" href="#/upload">
             <Plus size={16} aria-hidden="true" /> Subir sonidos
          </a>
        }
      />
       <nav className="library-section-nav" aria-label="Colecciones de biblioteca">
         {([['beats', 'Beats', Music2], ['sound-packs', 'Packs', PackageOpen], ['sounds', 'Sonidos', AudioLines]] as const).map(([value, label, Icon]) => (
             <a className={section === value ? "active" : ""} aria-current={section === value ? "page" : undefined} href={`#/library?section=${value}`} onClick={() => { setSection(value); setCategory("All assets"); setStatus("all"); setFavoritesOnly(false); }} key={value}>
             <Icon size={16} strokeWidth={1.8} aria-hidden="true" />
             <span>{label}</span>
           </a>
         ))}
       </nav>
      <section className="library-overview" aria-label="Resumen de biblioteca">
        <div><span>En esta colección</span><strong>{sectionAssets.length}</strong><small>sonidos y recursos</small></div>
        <div><span>Con vista previa</span><strong>{sectionAssets.filter((asset) => sessionPreviews.has(asset.id) || Boolean(asset.previewUrl)).length}</strong><small>listos para escuchar</small></div>
        <div><span>Favoritos</span><strong>{sectionAssets.filter((asset) => favoriteIds.has(asset.id)).length}</strong><small>guardados por ti</small></div>
        <span className={`library-source${catalogError ? " has-error" : ""}`} role={catalogError ? "status" : undefined}>
          {catalogSource === "api" ? "Catálogo local conectado" : "Catálogo local"}{catalogError ? " · Sin conexión API" : ""}
        </span>
      </section>
      <section className="library-controls" aria-label="Buscar y filtrar sonidos">
        <div className="library-toolbar">
         <label className="search" htmlFor="library-search">
           <Search size={17} aria-hidden="true" />
          <span className="sr-only">Buscar por nombre, tipo o tag</span>
          <input
             id="library-search"
             value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Busca un sonido o tag…"
          />
        </label>
        <label className="library-sort" htmlFor="library-sort">
          <span>Ordenar</span>
          <select id="library-sort" value={sort} onChange={(event) => setSort(event.target.value as typeof sort)}>
            <option value="curated">Orden recomendado</option><option value="name">Nombre A-Z</option><option value="type">Tipo de sonido</option><option value="favorites">Favoritos primero</option>
          </select>
        </label>
        <div className="view-toggle" role="group" aria-label="Diseño de resultados">
          <button type="button" className={view === "list" ? "active" : ""} aria-label="Vista de lista" aria-pressed={view === "list"} onClick={() => setView("list")}><List size={17} aria-hidden="true" /></button>
          <button type="button" className={view === "grid" ? "active" : ""} aria-label="Vista de cuadrícula" aria-pressed={view === "grid"} onClick={() => setView("grid")}><Grid2X2 size={16} aria-hidden="true" /></button>
        </div>
      </div>
      <div className="library-filter-row">
         <div className="filter-chips" role="group" aria-label="Filtrar por tipo">
          {categories.map((item) => (
             <button
               type="button"
              className={category === item ? "active" : ""}
              aria-pressed={category === item}
              onClick={() => setCategory(item)}
              key={item}
            >
              {categoryLabels[item]}
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
            <Heart size={16} fill={favoritesOnly ? "currentColor" : "none"} aria-hidden="true" /> Favoritos
          </button>
         </div>
      </div>
       <div className="status-filters" role="group" aria-label="Estado de publicación">
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
      </section>
      {favoriteMessage && (
        <p className={`action-feedback library-feedback${favoriteStorageError ? " error" : ""}`} role={favoriteStorageError ? "alert" : "status"}>
          <Heart size={14} aria-hidden="true" /> {favoriteMessage === "Added to favorites" ? "Añadido a favoritos" : favoriteMessage === "Removed from favorites" ? "Quitado de favoritos" : "Favorito actualizado solo durante esta sesión; el almacenamiento local no está disponible."}
        </p>
      )}
      {actionError && <p className="action-feedback error" role="alert">{actionError}</p>}
      <section className="panel library-panel">
        <div className="library-results-heading"><div><p className="eyebrow">TU COLECCIÓN</p><h2>{sortedAssets.length} {sortedAssets.length === 1 ? "resultado" : "resultados"}</h2></div><span>{categoryLabels[category]} · {librarySortLabels[sort]}{status !== "all" ? ` · ${publicationStatusLabels[status]}` : ""}</span></div>
        <p className="library-demo-note">Los sonidos de muestra están marcados como demos y no se sincronizan con otros dispositivos.</p>
         {sortedAssets.length === 0 ? (
          <div className="empty-state" role="status">
            <Search size={24} aria-hidden="true" />
            <h2>No encontramos sonidos</h2>
            <p>Prueba otra búsqueda o limpia los filtros para volver a explorar.</p>
            <button
              type="button"
              className="button ghost"
              onClick={clearFilters}
            >
              <RotateCcw size={15} aria-hidden="true" /> Limpiar filtros
            </button>
          </div>
        ) : (
          <div className={`asset-list ${view === "grid" ? "grid-view" : ""}`}>
             {sortedAssets.map((asset) => (
              <AssetRow
                asset={{ ...asset, previewUrl: sessionPreviews.get(asset.id) || asset.previewUrl, localAvailability: sessionPreviews.has(asset.id) ? "session-preview" : asset.localAvailability === "session-preview" ? "missing" : asset.localAvailability }}
                favorite={favoriteIds.has(asset.id)}
                onFavorite={() => toggleFavorite(asset.id)}
                 onEdit={catalogAssets.some((item) => item.id === asset.id) ? () => setEditing(catalogAssets.find((item) => item.id === asset.id)) : undefined}
                onDelete={catalogAssets.some((item) => item.id === asset.id) ? () => { if (!window.confirm(`¿Archivar ${asset.name}?`)) return; setSaving(true); setActionError(""); void onDeleteCatalogAsset(asset as CatalogAsset).then((result) => { setSaving(false); if (result.error) setActionError(result.error); }); } : undefined}
                 key={asset.id}
              />
            ))}
          </div>
        )}
      </section>
    </main>
  );
}

export { Library };
