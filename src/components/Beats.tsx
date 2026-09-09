import { useState } from "react";
import { assets } from "../data/mock";
import { Badge, PageHeader } from "./ui";
import type { AudioAsset, Project } from "../types";
import { getQuery } from "../app/routing";
import { ArrowLeft, ArrowUpRight, Play, Search } from "lucide-react";

export function Beats({
  projects,
  onPlay,
}: {
  projects: Project[];
  onPlay: (asset: AudioAsset) => void;
}) {
  const [query, setQuery] = useState("");
  const [genre, setGenre] = useState("All genres");
  const genres = [
    "All genres",
    ...Array.from(new Set(projects.map((project) => project.genre))),
  ];
  const visible = projects.filter((project) => {
    const searchable =
      `${project.name} ${project.genre} ${project.key}`.toLowerCase();
    return (
      (!query.trim() || searchable.includes(query.trim().toLowerCase())) &&
      (genre === "All genres" || project.genre === genre)
    );
  });
  return (
    <>
      <PageHeader
        eyebrow="Beat catalog"
        title="Find the next direction"
        description="Browse local beat references by mood, genre, and tempo."
        action={
          <a className="button" href="#/shorts">
            Discover through Shorts <ArrowUpRight size={16} aria-hidden="true" />
          </a>
        }
      />
      <div className="beats-toolbar">
        <label className="search" htmlFor="beats-search">
          <Search size={18} aria-hidden="true" />
          <span className="sr-only">Search beats</span>
          <input
            id="beats-search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search beats, genres, or keys..."
          />
        </label>
        <div className="filter-chips" aria-label="Filter beats by genre">
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
          {visible.map((project) => {
            const preview = assets.find((asset) => asset.name === project.name);
            return (
              <article className="beat-card panel" key={project.id}>
                <a
                  className="beat-card-cover"
                  href={`#/beat-detail?id=${encodeURIComponent(project.id)}`}
                  style={{
                    backgroundImage: `url(${project.cover ?? "/assets/demo/hard-808s.png"})`,
                  }}
                  aria-label={`Open ${project.name} beat detail`}
                >
                  <span aria-hidden="true">♫</span>
                </a>
                <div className="beat-card-body">
                  <div className="section-heading">
                    <div>
                      <p className="eyebrow">{project.genre}</p>
                      <h2>{project.name}</h2>
                    </div>
                    <Badge tone={project.status.toLowerCase()}>
                      {project.status}
                    </Badge>
                  </div>
                  <div className="beat-card-meta">
                    <span>{project.bpm} BPM</span>
                    <span>{project.key}</span>
                    <span>{project.tracks} tracks</span>
                  </div>
                  <div className="beat-card-actions">
                    <a
                      className="button ghost"
                      href={`#/beat-detail?id=${encodeURIComponent(project.id)}`}
                    >
                      View detail
                    </a>
                    {preview ? (
                      <button
                        type="button"
                        className="text-button"
                        aria-label={`Play local preview of ${project.name}`}
                        onClick={() => onPlay(preview)}
                      >
                        <Play size={16} fill="currentColor" aria-hidden="true" /> Play local preview
                      </button>
                    ) : (
                      <span
                        className="preview-unavailable compact"
                        role="status"
                      >
                        No local preview
                      </span>
                    )}
                  </div>
                </div>
              </article>
            );
          })}
        </section>
      ) : (
        <section className="panel empty-state">
          <h2>No beats found</h2>
          <p>Try a different search or genre.</p>
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
