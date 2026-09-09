import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Badge, PageHeader } from "./ui";
import { projects } from "../data/mock";
import { ArrowDown, ArrowUp, Bookmark, Heart, Play, Search, Share2, Upload, X } from "lucide-react";
import {
  hasShortDraft,
  canPublishShortDraft,
  parseShortTags,
  readShortDraft,
  saveShortDraft,
  shortDraftChangedEvent,
  shortStatusLabel,
  updateShortDraftStatus,
  type ShortDraftStatus,
  readShortIdSet,
  writeShortIdSet,
  shortsLikesKey,
  shortsSavesKey,
  shortsFollowsKey,
} from "../domains/shorts/localDraft";
type Clip = {
  id: string;
  creator: string;
  handle: string;
  title: string;
  tags: string[];
  cover: string;
  views: string;
  beat: string;
  duration: string;
};
const seed: Omit<Clip, "id">[] = [
  {
    creator: "Milo North",
    handle: "@milonorth",
    title: "Building the bounce around one 808",
    tags: ["dark", "808", "trap"],
    cover: "/assets/demo/hard-808s.png",
    views: "12.4K",
    beat: "Night Shift",
    duration: "0:18",
  },
  {
    creator: "Ari Sol",
    handle: "@arisol",
    title: "A dusty loop into a full idea",
    tags: ["lo-fi", "sample", "soul"],
    cover: "/assets/demo/chill-lo-fi.png",
    views: "8.9K",
    beat: "Dusty Room Loop",
    duration: "0:22",
  },
  {
    creator: "Kade Seven",
    handle: "@kadeseven",
    title: "Texture first, melody second",
    tags: ["sound design", "texture", "beats"],
    cover: "/assets/demo/dark-orchestra.png",
    views: "5.2K",
    beat: "Afterglow",
    duration: "0:15",
  },
];
const clips: Clip[] = Array.from({ length: 9 }, (_, index) => ({
  ...seed[index % seed.length],
  id: String(index + 1),
  title:
    index > 2
      ? `${seed[index % seed.length].title} — take ${Math.floor(index / 3) + 1}`
      : seed[index].title,
}));
export function ShortsFeed({ sharedShortId }: { sharedShortId?: string | null }) {
  const [activeTag, setActiveTag] = useState("All");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Clip | null>(null);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [liked, setLiked] = useState<string[]>(() => {
    return [...readShortIdSet(shortsLikesKey, "beatvault-short-likes")];
  });
  const [saved, setSaved] = useState<string[]>(() => {
    return [...readShortIdSet(shortsSavesKey, "beatvault-short-saves")];
  });
  const [followed, setFollowed] = useState<string[]>(() => {
    const stored = readShortIdSet(shortsFollowsKey);
    return [...stored].map((value) => clips.find((clip) => clip.id === value)?.handle ?? value);
  });
  const [draftSaved, setDraftSaved] = useState(false);
  const [draft, setDraft] = useState(() => readShortDraft());
  const [editDraft, setEditDraft] = useState(() => readShortDraft());
  const [mediaError, setMediaError] = useState("");
  const [mediaUrl, setMediaUrl] = useState("");
  const [publishError, setPublishError] = useState("");
  const [draftActionError, setDraftActionError] = useState("");
  const [shareMessage, setShareMessage] = useState("");
  const [publicationStatus, setPublicationStatus] = useState(() => readShortDraft().publicationStatus);
  const [mediaInfo, setMediaInfo] = useState<{ name: string; size: string; type: string } | null>(null);
  const mediaUrlRef = useRef("");
  const viewerRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (sharedShortId) setSelected(clips.find((clip) => clip.id === sharedShortId) ?? null);
  }, [sharedShortId]);
  useEffect(() => () => {
    if (mediaUrlRef.current) URL.revokeObjectURL(mediaUrlRef.current);
  }, []);
  useEffect(() => {
    writeShortIdSet(shortsLikesKey, new Set(liked));
  }, [liked]);
  useEffect(() => {
    writeShortIdSet(shortsSavesKey, new Set(saved));
  }, [saved]);
  useEffect(() => {
    writeShortIdSet(shortsFollowsKey, new Set(followed));
  }, [followed]);
  useEffect(() => {
    if (selected) viewerRef.current?.focus();
  }, [selected]);
  useEffect(() => {
    const syncDraft = () => {
      const next = readShortDraft();
       setDraft(next);
       setDraftSaved(true);
       setDraftActionError("");
       if (!uploadOpen) setPublicationStatus(next.publicationStatus);
    };
    window.addEventListener(shortDraftChangedEvent, syncDraft);
    window.addEventListener("storage", syncDraft);
    return () => {
      window.removeEventListener(shortDraftChangedEvent, syncDraft);
      window.removeEventListener("storage", syncDraft);
    };
   }, [uploadOpen]);
  const tags = [
    "All",
    ...Array.from(new Set(clips.flatMap((clip) => clip.tags))),
  ];
  const visible = useMemo(
    () =>
      clips.filter(
        (clip) =>
          (!query ||
            `${clip.creator} ${clip.handle} ${clip.title} ${clip.beat} ${clip.tags.join(" ")}`
              .toLowerCase()
              .includes(query.toLowerCase())) &&
          (activeTag === "All" || clip.tags.includes(activeTag)),
      ),
    [activeTag, query],
  );
  const selectAdjacent = useCallback((direction: number) => {
    if (!selected) return;
    const index = visible.findIndex((clip) => clip.id === selected.id);
    setSelected(visible[(index + direction + visible.length) % visible.length]);
  }, [selected, visible]);
  const toggle = (type: "like" | "save") => {
    if (!selected) return;
    const setter = type === "like" ? setLiked : setSaved;
    const list = type === "like" ? liked : saved;
    setter(
      list.includes(selected.id)
        ? list.filter((id) => id !== selected.id)
        : [...list, selected.id],
    );
  };
  const toggleFollow = () => {
    if (!selected) return;
    setFollowed((current) =>
      current.includes(selected.handle)
        ? current.filter((handle) => handle !== selected.handle)
        : [...current, selected.handle],
    );
  };
  const share = async () => {
    if (!selected) return;
    const url = `${window.location.origin}${window.location.pathname}#/shorts?short=${encodeURIComponent(selected.id)}`;
    try {
      if (navigator.share) await navigator.share({ title: selected.title, url });
      else throw new Error("share unavailable");
      setShareMessage("Shared");
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      try {
        await navigator.clipboard.writeText(url);
        setShareMessage("Link copied");
      } catch {
        setShareMessage("Copy unavailable");
      }
    }
    window.setTimeout(() => setShareMessage(""), 2200);
  };
  const hasDraft = hasShortDraft(draft);
  const draftTags = parseShortTags(draft.tags);
  const hasCurrentMedia = Boolean(mediaUrl && mediaInfo?.name === editDraft.fileName);
  const replaceMediaUrl = useCallback((nextUrl: string) => {
    if (mediaUrlRef.current) URL.revokeObjectURL(mediaUrlRef.current);
    mediaUrlRef.current = nextUrl;
    setMediaUrl(nextUrl);
  }, []);
  const clearMedia = useCallback(() => {
    replaceMediaUrl("");
    setMediaInfo(null);
  }, [replaceMediaUrl]);
  const openUpload = () => {
    if (mediaInfo && mediaInfo.name !== draft.fileName) clearMedia();
    setEditDraft({ ...draft });
    setPublicationStatus(draft.publicationStatus);
    setDraftSaved(false);
    setPublishError("");
    setMediaError("");
    setUploadOpen(true);
  };
  const closeUpload = useCallback(() => {
    setUploadOpen(false);
    clearMedia();
  }, [clearMedia]);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!selected || uploadOpen) return;
      if (event.key === "Escape") setSelected(null);
      if (event.key === "ArrowDown" || event.key === "ArrowRight") selectAdjacent(1);
      if (event.key === "ArrowUp" || event.key === "ArrowLeft") selectAdjacent(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selected, uploadOpen, selectAdjacent]);
  useEffect(() => {
    if (!uploadOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeUpload();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [uploadOpen, closeUpload]);
  const updateDraftStatus = (status: ShortDraftStatus) => {
    if (
      status === "pending" &&
       !canPublishShortDraft(draft, hasCurrentMedia)
    ) {
      openUpload();
      setPublishError("Añade un video, caption y al menos un tag antes de revisión.");
      return;
    }
    const result = updateShortDraftStatus(draft, status);
    if (!result.saved) {
      setDraftActionError(
        "No se pudo actualizar el estado en el almacenamiento local.",
      );
      return;
    }
     setDraft(result.draft);
     setPublicationStatus(result.draft.publicationStatus);
     setDraftActionError("");
     setDraftSaved(true);
  };
  return (
    <>
      <PageHeader
        eyebrow="Creator discovery"
        title="Shorts"
        description="Find sounds, ideas, and producers in motion."
        action={
          <button type="button" className="button" onClick={openUpload}>
             <Upload size={16} aria-hidden="true" /> Upload Short
          </button>
        }
      />
      <div className="shorts-discovery">
        <label className="search" htmlFor="shorts-search">
           <Search size={17} aria-hidden="true" />
          <input
            id="shorts-search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search creators, sounds, or tags..."
          />
        </label>
        <div className="shorts-tag-filter" aria-label="Filter Shorts by tag">
          {tags.map((tag) => (
            <button
              type="button"
              className={activeTag === tag ? "active" : ""}
              aria-pressed={activeTag === tag}
              onClick={() => setActiveTag(tag)}
              key={tag}
            >
              #{tag}
            </button>
          ))}
        </div>
      </div>
      {visible.length ? (
        <section className="shorts-gallery" aria-label="Published Shorts">
          {visible.map((clip) => (
            <button
              className="short-tile"
              key={clip.id}
              onClick={() => setSelected(clip)}
            >
              <div
                className="short-tile-media"
                style={{ backgroundImage: `url(${clip.cover})` }}
              >
                <span>{clip.duration}</span>
                 <i><Play size={18} fill="currentColor" aria-hidden="true" /></i>
              </div>
              <strong>{clip.title}</strong>
              <small>
                {clip.handle} · {clip.views} views
              </small>
              <div>
                {clip.tags.slice(0, 3).map((tag) => (
                  <em key={tag}>#{tag}</em>
                ))}
              </div>
            </button>
          ))}
        </section>
      ) : (
        <section className="panel empty-state">
          <h2>No Shorts found</h2>
          <p>Try another tag or search term.</p>
        </section>
      )}
      <p className="shorts-note">
        <Badge tone="violet">Local feed</Badge> Select a Short to open the
        focused vertical viewer.
      </p>
      {hasDraft && (
        <section className="short-draft-panel" aria-label="Short draft management">
          <div>
            <p className="eyebrow">Creator workspace</p>
            <h2>Local draft</h2>
            <p className="short-draft-meta">
              {draft.fileName || "No video selected"} ·{" "}
              {draft.caption || "No caption yet"}
            </p>
            <div className="draft-tags">
              {draftTags.length ? (
                draftTags.map((tag) => <span key={tag}>#{tag}</span>)
              ) : (
                <small>No tags yet</small>
              )}
            </div>
          </div>
          <div className="draft-review-side">
           <span className={`publication-pill ${draft.publicationStatus}`}>
             {shortStatusLabel(draft.publicationStatus)}
           </span>
            {draftActionError && <small className="upload-error" role="alert">{draftActionError}</small>}
            <div className="draft-actions">
             <button type="button" className="button ghost" onClick={openUpload}>
                Edit
              </button>
              {draft.publicationStatus !== "pending" && (
                 <button type="button" className="button" onClick={() => updateDraftStatus("pending")}>
                  Send to review
                </button>
              )}
              {draft.publicationStatus === "archived" ? (
                 <button type="button" className="text-button" onClick={() => updateDraftStatus("draft")}>
                  Restore
                </button>
              ) : (
                 <button type="button" className="text-button" onClick={() => updateDraftStatus("archived")}>
                  Archive
                </button>
              )}
            </div>
          </div>
        </section>
      )}
      {selected && (
        <div
           className="short-viewer-backdrop"
               onClick={() => setSelected(null)}
        >
          <section
            className="short-viewer-stage"
            ref={viewerRef}
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
            aria-label={`Short by ${selected.creator}`}
            onClick={(event) => event.stopPropagation()}
            onPointerDown={(event) => {
               if (uploadOpen || (event.target as HTMLElement).closest("button")) return;
               (event.currentTarget as HTMLElement).dataset.startX = String(event.clientX);
              (event.currentTarget as HTMLElement).dataset.startY = String(
                event.clientY,
              );
            }}
            onPointerUp={(event) => {
               if (uploadOpen || (event.target as HTMLElement).closest("button")) return;
               const startX = Number((event.currentTarget as HTMLElement).dataset.startX);
              const start = Number(
                (event.currentTarget as HTMLElement).dataset.startY,
              );
               if (Math.abs(event.clientY - start) > 55 && Math.abs(event.clientY - start) > Math.abs(event.clientX - startX))
                selectAdjacent(event.clientY < start ? 1 : -1);
            }}
          >
             <button
               type="button"
               className="short-viewer-close"
              onClick={() => setSelected(null)}
              aria-label="Close"
            >
               <X size={20} aria-hidden="true" />
            </button>
            <button
              className="short-viewer-arrow previous"
               type="button"
               onClick={() => selectAdjacent(-1)}
              aria-label="Previous Short"
            >
               <ArrowUp size={20} aria-hidden="true" />
            </button>
            <article
              className="feed-card"
              style={{ backgroundImage: `url(${selected.cover})` }}
            >
              <div className="feed-shade" />
              <span className="feed-duration">{selected.duration}</span>
              <div className="feed-copy">
                 <strong>{selected.creator}</strong>
                 <small>{selected.handle}</small>
                   <button type="button" className="feed-follow" aria-pressed={followed.includes(selected.handle)} onClick={toggleFollow}>{followed.includes(selected.handle) ? "Following" : "Follow"}</button>
                <p>{selected.title}</p>
                <div>
                  {selected.tags.map((tag) => (
                    <span key={tag}>#{tag}</span>
                  ))}
                </div>
                  <button type="button" className="feed-beat" onClick={() => { const beat = projects.find((project) => project.name === selected.beat); window.location.hash = `#/beat-detail?${beat ? `id=${encodeURIComponent(beat.id)}` : `name=${encodeURIComponent(selected.beat)}`}`; }}>♫ {selected.beat}</button>
              </div>
              <div className="feed-actions">
                 <button
                   type="button"
                   aria-label="Like"
                  aria-pressed={liked.includes(selected.id)}
                  className={liked.includes(selected.id) ? "active" : ""}
                  onClick={() => toggle("like")}
                >
                   <Heart size={22} fill={liked.includes(selected.id) ? "currentColor" : "none"} aria-hidden="true" /><small>{selected.views}</small>
                </button>
                 <button
                   type="button"
                   aria-label="Save"
                  aria-pressed={saved.includes(selected.id)}
                  className={saved.includes(selected.id) ? "active" : ""}
                  onClick={() => toggle("save")}
                >
                   <Bookmark size={22} fill={saved.includes(selected.id) ? "currentColor" : "none"} aria-hidden="true" /><small>Save</small>
                </button>
                  <button type="button" aria-label="Share" onClick={share}>
                   <Share2 size={22} aria-hidden="true" /><small>Share</small>
                </button>
               </div>
            </article>
            <button
              className="short-viewer-arrow next"
               type="button"
               onClick={() => selectAdjacent(1)}
              aria-label="Next Short"
            >
               <ArrowDown size={20} aria-hidden="true" />
            </button>
          </section>
          {shareMessage && <p className="share-feedback" role="status">{shareMessage}</p>}
        </div>
      )}
      {uploadOpen && (
        <div
          className="short-upload-backdrop"
           onClick={closeUpload}
        >
          <section
            className="panel short-upload"
            role="dialog"
            aria-modal="true"
            aria-labelledby="short-upload-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="section-heading">
              <div>
                <p className="eyebrow">Shorts creator tools</p>
                <h2 id="short-upload-title">Upload a Short</h2>
              </div>
               <button
                 type="button"
                className="modal-close"
                 onClick={closeUpload}
                 aria-label="Close Short upload"
              >
                 <X size={20} aria-hidden="true" />
              </button>
            </div>
             <label className="dropzone" htmlFor="short-upload-file">
                 <input id="short-upload-file" type="file" accept="video/*" onChange={(event) => { const file = event.target.files?.[0]; if (!file) return; if (!file.type.startsWith("video/")) { setMediaError("Selecciona un archivo de video válido."); clearMedia(); setEditDraft({ ...editDraft, fileName: "" }); return; } if (file.size > 100 * 1024 * 1024) { setMediaError("El prototipo acepta videos de hasta 100 MB."); clearMedia(); setEditDraft({ ...editDraft, fileName: "" }); return; } setMediaError(""); replaceMediaUrl(URL.createObjectURL(file)); setMediaInfo({ name: file.name, size: `${(file.size / 1024 / 1024).toFixed(1)} MB`, type: file.type }); setEditDraft({ ...editDraft, fileName: file.name }); }} />
               <span className="dropzone-icon"><Upload size={24} aria-hidden="true" /></span>
              <strong>Choose a vertical video</strong>
              <small>
                Video upload is prepared locally for the visual prototype
              </small>
            </label>
            {mediaError && <small className="upload-error" role="alert">{mediaError}</small>}
            {mediaInfo && <div className="media-file-preview"><strong>{mediaInfo.name}</strong><small>{mediaInfo.type} · {mediaInfo.size} · Solo referencia local</small></div>}
             {hasCurrentMedia && <video className="short-upload-preview" src={mediaUrl} controls muted playsInline aria-label="Selected Short preview" />}
              <label className="short-upload-field" htmlFor="short-publication-status">Publication status<select id="short-publication-status" value={publicationStatus} onChange={(event) => setPublicationStatus(event.target.value as ShortDraftStatus)}><option value="draft">Draft</option><option value="pending">Pending review</option><option value="archived">Archived</option><option value="published">Published</option></select></label>
            {publishError && <small className="upload-error" role="alert">{publishError}</small>}
             <label className="short-upload-field" htmlFor="short-caption">
               Caption
                <input id="short-caption" value={editDraft.caption} onChange={(event) => setEditDraft({ ...editDraft, caption: event.target.value })} placeholder="What are you making?" />
            </label>
             <label className="short-upload-field" htmlFor="short-tags">
               Tags
                <input id="short-tags" value={editDraft.tags} onChange={(event) => setEditDraft({ ...editDraft, tags: event.target.value })} placeholder="#trap #808 #beats" />
            </label>
            <div className="upload-actions">
               <button
                 type="button"
                className="button ghost"
                 onClick={closeUpload}
              >
                Cancel
              </button>
               <button
                 type="button"
                className="button"
                onClick={() => {
                     if (publicationStatus === "pending" && !canPublishShortDraft(editDraft, hasCurrentMedia)) { setPublishError("Vuelve a seleccionar el video antes de enviarlo a revisión."); return; } const result = saveShortDraft({ ...editDraft, publicationStatus }); if (!result.saved) { setPublishError("No se pudo guardar el draft en el almacenamiento local. Los cambios no se han guardado."); return; } const next = result.draft;
                   setDraft(next);
                   setEditDraft(next);
                   setPublicationStatus(next.publicationStatus);
                  setDraftSaved(true);
                  setPublishError("");
                  setUploadOpen(false);
                }}
              >
                Save draft
              </button>
            </div>
            {draftSaved && (
              <small className="local-save-status">Draft saved locally</small>
            )}
            {draft.fileName && <small className="local-save-status">Restored file: {draft.fileName}</small>}
          </section>
        </div>
      )}
    </>
  );
}
