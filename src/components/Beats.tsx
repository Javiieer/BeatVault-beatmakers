import { useState } from "react";
import { assets } from "../data/mock";
import { Badge, PageHeader } from "./ui";
import type { AudioAsset, Project } from "../types";
import { getQuery } from "../app/routing";
import { ArrowLeft, ArrowUpRight, Play, Search } from "lucide-react";
import type { CatalogAsset } from "../data/localCatalog";

export function Beats({
  catalogAssets,
  onPlay,
}: {
  catalogAssets: CatalogAsset[];
  onPlay: (asset: AudioAsset) => void;
}) {
  const [query, setQuery] = useState("");
  const [genre, setGenre] = useState("Todos los estilos");
  const publishedBeats = catalogAssets.filter(asset => asset.publicationStatus === 'published' && asset.type.toLowerCase() === 'beat');
  const genres = [
    "Todos los estilos",
    ...Array.from(new Set(publishedBeats.flatMap(asset => asset.tags.map(tag => tag.label)))).sort(),
  ];
  const visible = publishedBeats.filter((asset) => {
    const searchable = `${asset.name} ${asset.tags.map(tag => tag.label).join(' ')}`.toLowerCase();
    return (
      (!query.trim() || searchable.includes(query.trim().toLowerCase())) &&
      (genre === "Todos los estilos" || asset.tags.some(tag => tag.label === genre))
    );
  });
  return (
    <>
      <PageHeader
        eyebrow="Catálogo publicado"
        title="Beats aprobados"
        description="Escucha y explora beats que ya pasaron revisión."
        action={<a className="button" href="#/upload">Publicar un beat <ArrowUpRight size={16} aria-hidden="true" /></a>}
      />
      <div className="beats-toolbar">
        <label className="search" htmlFor="beats-search">
          <Search size={18} aria-hidden="true" />
          <span className="sr-only">Search beats</span>
          <input
            id="beats-search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar beats y tags..."
          />
        </label>
        <div className="filter-chips" aria-label="Filtrar beats por tag">
          {genres.map((item) => (
            <button
              type="button"
              key={item}
              className={genre === item ? "active" : ""}
              aria-pressed={genre === item}
              onClick={() => setGenre(item)}
            >
              {item}
            </button>
          ))}
        </div>
      </div>
      {visible.length ? (
        <section className="beats-grid" aria-label="Beat catalog">
          {visible.map((asset) => {
            return (
              <article className="beat-card panel" key={asset.id}>
                <div className="beat-card-cover" style={{ backgroundImage: `url(${asset.cover ?? "/assets/demo/hard-808s.png"})` }} aria-label={`Portada de ${asset.name}`}><span aria-hidden="true">♫</span></div>
                <div className="beat-card-body">
                  <div className="section-heading">
                    <div>
                      <p className="eyebrow">{asset.tags.map(tag => `#${tag.label}`).join(' ') || 'Beat'}</p>
                      <h2>{asset.name}</h2>
                    </div>
                    <Badge tone="active">Publicado</Badge>
                  </div>
                  <div className="beat-card-meta"><span>{asset.type}</span><span>Por {asset.ownerId || 'creador'}</span></div>
                  <div className="beat-card-actions">
                    {asset.previewUrl ? (
                      <button
                        type="button"
                        className="button"
                        aria-label={`Escuchar ${asset.name}`}
                        onClick={() => onPlay(asset)}
                      >
                        <Play size={16} fill="currentColor" aria-hidden="true" /> Escuchar preview
                      </button>
                    ) : (
                      <span
                        className="preview-unavailable compact"
                        role="status"
                      >
                        Preview no disponible
                      </span>
                    )}
                    {asset.downloadUrl && <a className="button ghost" href={asset.downloadUrl} download>Descargar</a>}
                  </div>
                </div>
              </article>
            );
          })}
        </section>
      ) : (
        <section className="panel empty-state">
          <h2>{publishedBeats.length ? 'No hay coincidencias' : 'Aún no hay beats publicados'}</h2>
          <p>{publishedBeats.length ? 'Prueba otra búsqueda o tag.' : 'Cuando una subida sea aprobada, aparecerá aquí para todos los creadores.'}</p>
        </section>
      )}
    </>
  );
}

export function BeatDetail({
  projects,
  onPlay,
}: {
  projects: Project[];
  onPlay: (asset: AudioAsset) => void;
}) {
  const params = getQuery(window.location.hash);
  const requested = params.get("id") ?? params.get("name");
  const project = projects.find(
    (item) => item.id === requested || item.name === requested,
  );
  if (!project)
    return (
      <section className="panel empty-state beat-not-found" role="status">
        <p className="eyebrow">Beat detail</p>
        <h1>Beat not found</h1>
        <p>
          {requested
            ? `“${requested}” is not in the local Beats catalog.`
            : "This beat link is missing an identifier."}
        </p>
        <div className="beat-detail-actions">
          <a className="button" href="#/beats">
            Back to Beats
          </a>
          <a className="button ghost" href="#/shorts">
            Back to Shorts
          </a>
        </div>
      </section>
    );
  const creator =
    project.name === "Night Shift"
      ? "Milo North"
      : project.name === "Dusty Room Loop"
        ? "Ari Sol"
        : "Kade Seven";
  const tags =
    project.name === "Night Shift"
      ? ["dark", "808", "trap"]
      : project.name === "Dusty Room Loop"
        ? ["lo-fi", "sample", "soul"]
        : ["alternative", "texture", "beats"];
  const preview = assets.find((asset) => asset.name === project.name);
  return (
    <>
      <PageHeader
        eyebrow={`Beats / ${project.genre}`}
        title={project.name}
        description="A focused view of this local catalog reference and its available preview state."
        action={
          <div className="beat-detail-actions">
            <a className="button" href="#/beats">
            <ArrowLeft size={16} aria-hidden="true" /> Back to Beats
            </a>
            <a className="button ghost" href="#/shorts">
              Discover in Shorts
            </a>
          </div>
        }
      />
      <div className="beat-detail-layout">
        <section className="panel beat-hero">
          <div
            className="beat-cover"
            style={{
              backgroundImage: `url(${project.cover ?? "/assets/demo/hard-808s.png"})`,
            }}
          >
            <span aria-hidden="true">♫</span>
          </div>
          <div className="beat-copy">
            <div className="creator-line">
              <span className="avatar">
                {creator.slice(0, 2).toUpperCase()}
              </span>
              <div>
                <strong>{creator}</strong>
                <small>@{creator.toLowerCase().replace(" ", "")}</small>
              </div>
            </div>
            <p className="beat-description">
              A producer-ready idea discovered through Shorts, ready to become
              part of your next session.
            </p>
            <div className="detail-tags">
              {tags.map((tag) => (
                <Badge tone={tag === "dark" ? "violet" : "cyan"} key={tag}>
                  #{tag}
                </Badge>
              ))}
            </div>
            {preview ? (
              <div className="preview-affordance">
                <button
                  type="button"
                  className="button"
                  aria-label={`Play local preview of ${project.name}`}
                  onClick={() => onPlay(preview)}
                >
                  <Play size={16} fill="currentColor" aria-hidden="true" /> Play local preview
                </button>
                <p className="preview-note">
                  Bundled local audio reference. Playback stays in this browser.
                </p>
              </div>
            ) : (
              <div className="preview-unavailable" role="status">
                <strong>Preview unavailable locally</strong>
                <span>
                  No bundled audio file is available for this beat yet.
                </span>
              </div>
            )}
          </div>
        </section>
        <aside className="panel beat-facts">
          <p className="eyebrow">Beat context</p>
          <div>
            <span>Tempo</span>
            <strong>{project.bpm} BPM</strong>
          </div>
          <div>
            <span>Key</span>
            <strong>{project.key}</strong>
          </div>
          <div>
            <span>Genre</span>
            <strong>{project.genre}</strong>
          </div>
          <div>
            <span>Source</span>
            <strong>Shorts discovery</strong>
          </div>
          <Badge tone="violet">Local catalog reference</Badge>
        </aside>
      </div>
    </>
  );
}
