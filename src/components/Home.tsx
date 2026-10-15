import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { Bookmark, Check, CirclePlus, Flag, Heart, Image as ImageIcon, Maximize2, MessageCircle, Music2, Play, Send, Trash2, Video, X } from "lucide-react";
import type { AudioAsset } from "../types";
import type { CatalogAsset } from "../data/localCatalog";
import { creatorType } from "../data/creatorUploads";
import { scopedKey } from "../data/storageScope";
import { readLocalHomePosts, type LocalHomePost } from "../data/homePosts";
import { createCatalogComment, readCatalogSocial, toggleCatalogReaction } from "../data/socialRepository";
import type { CatalogSocial } from "../domains/social";
import { HomeComposer } from "./HomeComposer";
import { createSocialPostComment, deleteSocialPost, readProfileSocialPosts, readSocialFeed, readSocialPostInteractions, reportSocialPost, toggleSocialPostReaction, type SocialPostInteraction, type SocialPostReportReason, type SocialPostView } from "../data/socialPostRepository";
import orchestraCover from "../../assets/demo/dark-orchestra.png";
import loFiCover from "../../assets/demo/chill-lo-fi.png";
import hard808Cover from "../../assets/demo/hard-808s.png";
import "../styles/home.css";

type FeedKind = "status" | "photo" | "video" | "beat" | "short";
type FeedPost = {
  id: string;
  kind: FeedKind;
  creator: string;
  handle: string;
  avatar: string;
  profileBio?: string;
  profileGenres?: string[];
  profileHref?: string;
  time: string;
  text: string;
  image?: string;
  tags: string[];
  likes: number;
  comments: number;
  beat?: string;
  href?: string;
  asset?: CatalogAsset;
  demo?: boolean;
  mediaUrl?: string;
  localOnly?: boolean;
  socialPost?: SocialPostView;
};
type Story = { creator: string; title: string; image: string; kind: "status" | "short" };
type HomeComment = { id: string; text: string; createdAt: string; authorName?: string };

function readComments(scope: string): Record<string, HomeComment[]> {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(scopedKey("beatvault:home-comments", scope)) || "{}");
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    return Object.fromEntries(Object.entries(value).map(([postId, items]) => [postId,
      Array.isArray(items) ? items.filter((item): item is HomeComment => !!item && typeof item === "object" && typeof item.id === "string" && typeof item.text === "string" && typeof item.createdAt === "string").slice(-100) : [],
    ]));
  } catch { return {}; }
}

const stories: Story[] = [
  { creator: "Milo North", title: "808 de hoy", image: hard808Cover, kind: "status" },
  { creator: "Ari Sol", title: "Texturas nuevas", image: loFiCover, kind: "short" },
  { creator: "Kade Seven", title: "En el estudio", image: orchestraCover, kind: "status" },
  { creator: "Luna Keys", title: "Idea vocal", image: loFiCover, kind: "short" },
  { creator: "Juno.wav", title: "Nueva sesion", image: hard808Cover, kind: "status" },
];

const samplePosts: FeedPost[] = [
  { id: "post-status-1", kind: "status", creator: "Milo North", handle: "@milonorth", avatar: hard808Cover, profileBio: "Productor de beats con bajos pesados y drums secos.", profileGenres: ["Trap", "Drill"], time: "hace 12 min", text: "¿Qué le pondrías a este bajo: drums secos o una textura más sucia?", tags: ["808", "trap"], likes: 18, comments: 4, demo: true },
  { id: "post-photo-1", kind: "photo", creator: "Ari Sol", handle: "@arisol", avatar: loFiCover, profileBio: "Buscando calidez en samples, cinta y grabaciones cotidianas.", profileGenres: ["Lo-fi", "Soul"], time: "hace 38 min", text: "Una tarde buscando sonidos en cinta. Este loop terminó convirtiéndose en el inicio de un beat.", image: loFiCover, tags: ["lofi", "sample"], likes: 42, comments: 7, demo: true },
  { id: "post-short-1", kind: "short", creator: "Kade Seven", handle: "@kadeseven", avatar: orchestraCover, profileBio: "Diseño sonoro y percusiones hechas a mano.", profileGenres: ["Sound design", "Cinemático"], time: "hace 1 h", text: "De una percusión grabada en casa a una textura para el próximo track.", image: orchestraCover, tags: ["sounddesign", "shorts"], likes: 31, comments: 3, href: "#/shorts", demo: true },
  { id: "post-beat-1", kind: "beat", creator: "Juno.wav", handle: "@junowav", avatar: hard808Cover, profileBio: "Beats melódicos, espacios abiertos y demos para colaborar.", profileGenres: ["Melodic", "R&B"], time: "hace 2 h", text: "Boceto nocturno: espacio para una voz y un hook sencillo.", image: hard808Cover, tags: ["melodic", "beat"], likes: 26, comments: 5, beat: "Night Window", href: "#/beats", demo: true },
];

function readIdSet(key: string, scope: string): Set<string> {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(scopedKey(key, scope)) ?? "[]");
    return new Set(Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : []);
  } catch { return new Set(); }
}
function writeIdSet(key: string, scope: string, value: Set<string>) {
  try { localStorage.setItem(scopedKey(key, scope), JSON.stringify([...value])); } catch { /* Keep the feed usable when browser storage is unavailable. */ }
}
function toggleId(current: Set<string>, id: string): Set<string> {
  const next = new Set(current);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return next;
}

function HomeProfilePreview({ post }: { post: FeedPost }) {
  const [open, setOpen] = useState(false);
  const wrapper = useRef<HTMLDivElement>(null);
  return <div className="home-profile-hover" ref={wrapper} onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)} onFocus={() => setOpen(true)} onBlur={event => { if (!wrapper.current?.contains(event.relatedTarget as Node | null)) setOpen(false); }}>
    <button type="button" className="home-profile-trigger" aria-expanded={open} onClick={() => setOpen(value => !value)}>
      <img className="home-avatar" src={post.avatar} alt="" />
      <span className="home-post-author"><strong>{post.creator}</strong><span>{post.handle} · {post.time}</span></span>
    </button>
    {open && <section className="home-profile-popover" aria-label={`Vista previa del perfil de ${post.creator}`}>
      <div className="home-profile-cover"><img src={post.avatar} alt="" /></div>
      <div className="home-profile-body"><img className="home-profile-avatar" src={post.avatar} alt="" /><strong>{post.creator}</strong><span>{post.handle}</span>
        <p>{post.profileBio || (post.handle === "Tu publicación" ? "Comparte tus ideas y lanzamientos desde tu perfil." : "Creador de la comunidad BeatVault.")}</p>
        {post.profileGenres?.length ? <div className="home-profile-genres">{post.profileGenres.slice(0, 3).map(genre => <span key={genre}>{genre}</span>)}</div> : null}
        <a href={post.profileHref || (post.handle === "Tu publicación" ? "#/profile" : "#/friends")}>{post.profileHref || post.handle === "Tu publicación" ? "Ver perfil" : "Descubrir creadores"}</a>
      </div>
    </section>}
  </div>;
}

function HomePost({ post, liked, likeCount, saved, followed, comments, onComment, onLike, onSave, onPlay, onShare, onFollow, onExpandPhoto, onDelete, onReport }: {
  post: FeedPost; liked: boolean; likeCount: number; saved: boolean; onLike: () => void; onSave: () => void;
  onPlay: (asset: AudioAsset) => void; onShare: () => void; followed: boolean; onFollow: () => void;
  comments: HomeComment[]; onComment: (text: string) => void;
  onExpandPhoto: () => void;
  onDelete?: () => void;
  onReport?: (reason: SocialPostReportReason, details: string) => Promise<void>;
}) {
  const [commentText, setCommentText] = useState("");
  const [reportOpen, setReportOpen] = useState(false);
  const [reportReason, setReportReason] = useState<SocialPostReportReason>("other");
  const [reportDetails, setReportDetails] = useState("");
  const [reportBusy, setReportBusy] = useState(false);
  const kindLabel = post.kind === "status" ? "Estado" : post.kind === "photo" ? "Foto" : post.kind === "video" ? "Video" : post.kind === "short" ? "Short" : "Beat";
  return <article id={`feed-post-${post.id}`} className={`home-post home-post-${post.kind}`}>
    <header className="home-post-header">
      <HomeProfilePreview post={post} />
      <span className={`home-kind home-kind-${post.kind}`}>{post.asset ? creatorType(post.asset.type) : kindLabel}</span>
      {post.demo && <span className="home-demo-mark">DEMO</span>}
      {post.localOnly && <span className="home-local-mark">Solo este equipo</span>}
      {post.socialPost?.visibility === "pending-review" && <span className="home-pending-mark">Pendiente de revisión</span>}
      {post.socialPost && <span className="home-audience-mark">{post.socialPost.audience === "private" ? "Solo yo" : post.socialPost.audience === "friends" ? "Amigos" : "Público"}</span>}
      {post.handle.startsWith("@") && <button type="button" className={`home-follow ${followed ? "is-following" : ""}`} aria-pressed={followed} onClick={onFollow}>{followed ? <><Check size={13} /> Siguiendo</> : "Seguir"}</button>}
      {onDelete && <button type="button" className="home-post-owner-action" aria-label="Eliminar publicación" onClick={onDelete}><Trash2 size={16} /></button>}
    </header>
    <p className="home-post-copy">{post.text}</p>
    {post.mediaUrl && post.kind === "video" && <div className="home-post-media"><video src={post.mediaUrl} controls preload="metadata" aria-label={`Video publicado por ${post.creator}`} /></div>}
    {post.mediaUrl && post.kind === "photo" && <button type="button" className="home-post-media home-photo-open" onClick={onExpandPhoto} aria-label={`Ampliar foto de ${post.creator}`}><img src={post.mediaUrl} alt={`Foto publicada por ${post.creator}`} /><span className="home-photo-expand"><Maximize2 size={18} /></span></button>}
    {post.image && post.kind === "photo" && <button type="button" className="home-post-media home-photo-open" onClick={onExpandPhoto} aria-label={`Ampliar foto de ${post.creator}`}><img src={post.image} alt={`Foto del estudio de ${post.creator}`} /><span className="home-photo-expand"><Maximize2 size={18} /></span></button>}
    {post.image && post.kind !== "photo" && <a className={`home-post-media ${post.kind === "short" ? "is-short" : ""}`} href={post.href} aria-label={post.kind === "short" ? `Abrir Short de ${post.creator}` : undefined}>
      <img src={post.image} alt="" />
      {post.kind === "short" && <span className="home-media-play"><Play size={19} fill="currentColor" /></span>}
      {post.kind === "beat" && <span className="home-beat-title"><Music2 size={15} />{post.beat}</span>}
    </a>}
    {post.asset?.previewUrl && <button className="home-audio-preview" type="button" onClick={() => onPlay(post.asset!)}><Play size={16} fill="currentColor" /><span>Escuchar {post.asset.name}</span><span className="home-audio-bars" aria-hidden="true">▂ ▅ ▃ ▇ ▄ ▆ ▂ ▅</span></button>}
    <div className="home-post-tags">{post.tags.map(tag => <span key={tag}>#{tag}</span>)}</div>
    <div className="home-post-actions">
      <button type="button" className={liked ? "is-active" : ""} aria-pressed={liked} aria-label={liked ? "Quitar me gusta" : "Me gusta"} onClick={onLike}><Heart size={19} fill={liked ? "currentColor" : "none"} /><span>{likeCount}</span></button>
      <span className="home-comment-count" aria-label={`${post.comments + comments.length} comentarios`}><MessageCircle size={18} /><span>{post.comments + comments.length}</span></span>
      {(post.demo || post.href) && <button type="button" aria-label="Compartir publicación" onClick={onShare}><Send size={18} /></button>}
      <button type="button" className={`home-save ${saved ? "is-active" : ""}`} aria-pressed={saved} aria-label={saved ? "Quitar de guardados" : "Guardar publicación"} onClick={onSave}><Bookmark size={18} fill={saved ? "currentColor" : "none"} /></button>
      {onReport && <button type="button" className="home-report-action" aria-expanded={reportOpen} onClick={() => setReportOpen(value => !value)}><Flag size={15} />Reportar</button>}
      {post.href && <a className="home-post-open" href={post.href}>{post.kind === "short" ? "Ver Short" : post.kind === "beat" ? "Explorar beats" : "Abrir"}</a>}
    </div>
    {reportOpen && onReport && <form className="home-report-form" onSubmit={async event => { event.preventDefault(); setReportBusy(true); await onReport(reportReason, reportDetails); setReportBusy(false); setReportOpen(false); }}>
      <label>Motivo<select value={reportReason} onChange={event => setReportReason(event.target.value as SocialPostReportReason)}><option value="spam">Spam</option><option value="harassment">Acoso</option><option value="copyright">Derechos de autor</option><option value="nudity">Desnudez</option><option value="violence">Violencia</option><option value="other">Otro</option></select></label>
      <label>Detalles (opcional)<input maxLength={500} value={reportDetails} onChange={event => setReportDetails(event.target.value)} /></label>
      <button className="button" type="submit" disabled={reportBusy}>{reportBusy ? "Enviando…" : "Enviar reporte"}</button>
    </form>}
    <section className="home-comments" aria-label={`Comentarios de ${post.creator}`}>
      {comments.length > 0 && <div className="home-comment-list">{comments.slice(-3).map(comment => <p key={comment.id}><strong>{comment.authorName || "Tú"}</strong><span>{comment.text}</span></p>)}</div>}
      <form onSubmit={event => { event.preventDefault(); const text = commentText.trim(); if (!text) return; onComment(text); setCommentText(""); }}>
        <label className="sr-only" htmlFor={`comment-${post.id}`}>Escribe un comentario</label>
        <input id={`comment-${post.id}`} value={commentText} maxLength={500} onChange={event => setCommentText(event.target.value)} placeholder="Escribe un comentario..." />
        <button type="submit" aria-label="Publicar comentario" disabled={!commentText.trim()}><Send size={16} /></button>
      </form>
    </section>
  </article>;
}

function PhotoViewer({ post, comments, dialogRef, onClose, onComment }: {
  post: FeedPost;
  comments: HomeComment[];
  dialogRef: RefObject<HTMLDialogElement | null>;
  onClose: () => void;
  onComment: (text: string) => void;
}) {
  const [text, setText] = useState("");
  const image = post.mediaUrl || post.image || "";
  return <dialog ref={dialogRef} className="home-photo-viewer" aria-label={`Foto de ${post.creator}`} onClose={onClose} onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
    <div className="home-photo-viewer-image"><img src={image} alt={`Foto publicada por ${post.creator}`} /></div>
    <aside className="home-photo-viewer-comments">
      <header><div className="home-photo-viewer-author"><img src={post.avatar} alt="" /><span><strong>{post.creator}</strong><small>{post.handle} · {post.time}</small></span></div><button type="button" className="icon-button" aria-label="Cerrar foto ampliada" onClick={onClose}><X size={19} /></button></header>
      <p className="home-photo-viewer-copy">{post.text}</p>
      <section className="home-photo-viewer-thread" aria-label="Comentarios">
        {comments.length === 0 ? <p className="home-photo-viewer-empty">Aún no hay comentarios. Inicia la conversación.</p> : comments.map(comment => <p className="home-photo-comment" key={comment.id}><strong>{comment.authorName || "Tú"}</strong><span>{comment.text}</span></p>)}
      </section>
      <form onSubmit={event => { event.preventDefault(); const value = text.trim(); if (!value) return; onComment(value); setText(""); }}>
        <label className="sr-only" htmlFor={`viewer-comment-${post.id}`}>Escribe un comentario</label>
        <input id={`viewer-comment-${post.id}`} autoFocus value={text} maxLength={500} onChange={event => setText(event.target.value)} placeholder="Escribe un comentario..." />
        <button type="submit" aria-label="Publicar comentario" disabled={!text.trim()}><Send size={17} /></button>
      </form>
    </aside>
  </dialog>;
}

export function Home({ uploads, onPlay, scope = "demo" }: { uploads: CatalogAsset[]; onPlay: (asset: AudioAsset) => void; scope?: string }) {
  const [filter, setFilter] = useState("Para ti");
  const [liked, setLiked] = useState(() => readIdSet("beatvault:home-likes", scope));
  const [saved, setSaved] = useState(() => readIdSet("beatvault:home-saves", scope));
  const [followed, setFollowed] = useState(() => readIdSet("beatvault:home-follows", scope));
  const [comments, setComments] = useState(() => readComments(scope));
  const [socialByContentId, setSocialByContentId] = useState<Record<string, CatalogSocial>>({});
  const [socialByPostId, setSocialByPostId] = useState<Record<string, SocialPostInteraction>>({});
  const [story, setStory] = useState<Story | null>(null);
  const [photo, setPhoto] = useState<FeedPost | null>(null);
  const [shareMessage, setShareMessage] = useState("");
  const [localPosts, setLocalPosts] = useState<LocalHomePost[]>([]);
  const [mediaUrls, setMediaUrls] = useState<Map<string, string>>(new Map());
  const [postStorageError, setPostStorageError] = useState(false);
  const [serverPosts, setServerPosts] = useState<SocialPostView[]>([]);
  const [serverLoading, setServerLoading] = useState(false);
  const [serverError, setServerError] = useState("");
  const [nextCursor, setNextCursor] = useState<string>();
  const [ownNextCursor, setOwnNextCursor] = useState<string>();
  const [feedBusy, setFeedBusy] = useState(false);
  const storyDialog = useRef<HTMLDialogElement>(null);
  const photoDialog = useRef<HTMLDialogElement>(null);

  useEffect(() => { writeIdSet("beatvault:home-likes", scope, liked); }, [liked, scope]);
  useEffect(() => { writeIdSet("beatvault:home-saves", scope, saved); }, [saved, scope]);
  useEffect(() => { writeIdSet("beatvault:home-follows", scope, followed); }, [followed, scope]);
  useEffect(() => { try { localStorage.setItem(scopedKey("beatvault:home-comments", scope), JSON.stringify(comments)); } catch { /* Keep commenting available if storage is full. */ } }, [comments, scope]);
  useEffect(() => {
    let active = true;
    void readLocalHomePosts(scope).then(posts => { if (active) { setLocalPosts(posts); setPostStorageError(false); } }).catch(() => { if (active) setPostStorageError(true); });
    return () => { active = false; };
  }, [scope]);
  useEffect(() => {
    if (scope === "demo") { setServerPosts([]); setServerError(""); setServerLoading(false); return; }
    let active = true;
    setServerLoading(true); setServerError("");
    void Promise.all([readSocialFeed(), readProfileSocialPosts(scope)]).then(([feedResult, ownResult]) => {
      if (!active) return;
      const feedPosts = feedResult.ok ? feedResult.data.posts : [];
      const ownPosts = ownResult.ok ? ownResult.data.posts : [];
      const unique = new Map<string, SocialPostView>();
      [...feedPosts, ...ownPosts].forEach(post => unique.set(post.id, post));
      setServerPosts([...unique.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
      if (feedResult.ok) setNextCursor(feedResult.data.nextCursor);
      if (ownResult.ok) setOwnNextCursor(ownResult.data.nextCursor);
      const feedError = feedResult.ok ? undefined : feedResult.error.message;
      const ownError = ownResult.ok ? undefined : ownResult.error.message;
      if (feedError && ownError) setServerError(`${feedError} ${ownError}`);
      else if (feedError || ownError) setServerError(`La sincronización está incompleta: ${feedError || ownError}`);
    }).finally(() => { if (active) setServerLoading(false); });
    return () => { active = false; };
  }, [scope]);
  useEffect(() => {
    const urls = new Map<string, string>();
    for (const post of localPosts) if (post.media) urls.set(post.id, URL.createObjectURL(post.media));
    setMediaUrls(urls);
    return () => urls.forEach(url => URL.revokeObjectURL(url));
  }, [localPosts]);
  useEffect(() => {
    if (story) storyDialog.current?.showModal();
    else if (storyDialog.current?.open) storyDialog.current.close();
  }, [story]);
  useEffect(() => {
    if (photo) photoDialog.current?.showModal();
    else if (photoDialog.current?.open) photoDialog.current.close();
  }, [photo]);

  const addComment = (postId: string, text: string) => setComments(current => ({
    ...current,
    [postId]: [...(current[postId] || []), { id: crypto.randomUUID(), text, createdAt: new Date().toISOString() }].slice(-100),
  }));

  const posts = useMemo(() => {
    const createdPosts: FeedPost[] = localPosts.map(post => ({
      id: `local-${post.id}`, kind: post.kind, creator: "Tú", handle: "Tu publicación", profileHref: "#/profile", time: new Date(post.createdAt).toLocaleString(), avatar: hard808Cover,
      text: post.text, tags: [], likes: 0, comments: 0, mediaUrl: mediaUrls.get(post.id), localOnly: true,
    }));
    const accountPosts: FeedPost[] = serverPosts.map(post => ({
      id: `social-${post.id}`, kind: post.kind, creator: post.author.displayName, handle: `@${post.author.id}`, profileHref: `#/profile?id=${encodeURIComponent(post.author.id)}`,
      time: new Date(post.createdAt).toLocaleString(), avatar: post.author.avatarUrl || hard808Cover, text: post.body, tags: [], likes: 0, comments: 0,
      ...(post.media ? { mediaUrl: post.media.url } : {}), socialPost: post,
    }));
    const ownPosts: FeedPost[] = uploads.filter(asset => asset.publicationStatus === "published" && creatorType(asset.type)).map(asset => {
      const mine = asset.ownerId === scope;
      const creatorName = mine ? "Tu perfil" : asset.creatorName || "Productor";
      return {
      id: `own-${asset.id}`, kind: "beat", creator: creatorName, handle: mine ? "Tu publicación" : `@${creatorName.toLowerCase().replace(/[^a-z0-9]+/g, "")}`, profileHref: mine ? "#/profile" : `#/profile?id=${encodeURIComponent(asset.ownerId || "")}`, time: "publicado", avatar: asset.cover || hard808Cover,
      text: asset.name, image: asset.cover || hard808Cover, tags: asset.tags.map(tag => tag.label), likes: 0, comments: 0,
      beat: asset.name, href: "#/beats", asset,
    }; });
    return [...createdPosts, ...accountPosts, ...ownPosts, ...samplePosts];
  }, [uploads, localPosts, mediaUrls, scope, serverPosts]);
  useEffect(() => {
    if (scope === "demo") return;
    let active = true;
    const entries = posts.filter(post => post.asset).map(post => post.asset!);
    void Promise.all(entries.map(async asset => {
      const result = await readCatalogSocial(asset.id);
      return result.ok ? [asset.id, result.data] as const : undefined;
    })).then(results => {
      if (active) setSocialByContentId(Object.fromEntries(results.filter((entry): entry is NonNullable<typeof entry> => Boolean(entry))));
    });
    return () => { active = false; };
  }, [posts, scope]);
  useEffect(() => {
    if (scope === "demo") { setSocialByPostId({}); return; }
    let active = true;
    const remotePosts = serverPosts.filter(post => post.visibility === "published");
    void Promise.all(remotePosts.map(async post => {
      const result = await readSocialPostInteractions(post.id);
      return result.ok ? [post.id, result.data] as const : undefined;
    })).then(results => {
      if (active) setSocialByPostId(current => ({ ...current, ...Object.fromEntries(results.filter((entry): entry is NonNullable<typeof entry> => Boolean(entry))) }));
    });
    return () => { active = false; };
  }, [scope, serverPosts]);
  useEffect(() => {
    const query = window.location.hash.split("?")[1];
    const contentId = query ? new URLSearchParams(query).get("post") : null;
    if (!contentId) return;
    const timer = window.setTimeout(() => document.getElementById(`feed-post-own-${contentId}`)?.scrollIntoView({ behavior: "smooth", block: "center" }), 80);
    return () => window.clearTimeout(timer);
  }, [posts]);
  const addPostComment = async (post: FeedPost, text: string) => {
    if (post.socialPost && scope !== "demo") {
      const result = await createSocialPostComment(post.socialPost.id, text);
      if (result.ok) setSocialByPostId(current => ({ ...current, [post.socialPost!.id]: result.data }));
      else setShareMessage(result.error.message);
      return;
    }
    if (post.asset && scope !== "demo") {
      const result = await createCatalogComment(post.asset.id, text);
      if (result.ok) {
        const social = result.data;
        setSocialByContentId(current => ({ ...current, [post.asset!.id]: social }));
      } else setShareMessage(result.error.message);
      return;
    }
    addComment(post.id, text);
  };
  const togglePostLike = async (post: FeedPost) => {
    if (post.socialPost && scope !== "demo") {
      const result = await toggleSocialPostReaction(post.socialPost.id);
      if (result.ok) setSocialByPostId(current => ({ ...current, [post.socialPost!.id]: { ...(current[post.socialPost!.id] || { comments: [], reactedByMe: false, reactionCount: 0 }), reactedByMe: result.data.reacted, reactionCount: result.data.reactionCount } }));
      else setShareMessage(result.error.message);
      return;
    }
    if (post.asset && scope !== "demo") {
      const result = await toggleCatalogReaction(post.asset.id);
      if (result.ok) setSocialByContentId(current => ({ ...current, [post.asset!.id]: { ...(current[post.asset!.id] || { comments: [], reactedByMe: false, reactionCount: 0 }), reactedByMe: result.data.reacted, reactionCount: result.data.reactionCount } }));
      return;
    }
    setLiked(current => toggleId(current, post.id));
  };
  const deletePost = async (post: FeedPost) => {
    if (!post.socialPost) return;
    if (!window.confirm("¿Eliminar esta publicación? Esta acción no se puede deshacer.")) return;
    const result = await deleteSocialPost(post.socialPost.id);
    if (result.ok) setServerPosts(current => current.filter(item => item.id !== post.socialPost!.id));
    else setServerError(result.error.message);
  };
  const submitReport = async (post: FeedPost, reason: SocialPostReportReason, details: string) => {
    if (!post.socialPost) return;
    const result = await reportSocialPost(post.socialPost.id, reason, details);
    setShareMessage(result.ok ? "Reporte enviado al equipo de moderación." : result.error.message);
  };
  const loadMore = async () => {
    if ((!nextCursor && !ownNextCursor) || feedBusy) return;
    setFeedBusy(true);
    const [feedResult, ownResult] = await Promise.all([
      nextCursor ? readSocialFeed(30, nextCursor) : Promise.resolve(undefined),
      ownNextCursor ? readProfileSocialPosts(scope, 30, ownNextCursor) : Promise.resolve(undefined),
    ]);
    const incoming = [...(feedResult?.ok ? feedResult.data.posts : []), ...(ownResult?.ok ? ownResult.data.posts : [])];
    if (incoming.length) setServerPosts(current => {
      const merged = new Map(current.map(post => [post.id, post]));
      incoming.forEach(post => merged.set(post.id, post));
      return [...merged.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    });
    if (feedResult?.ok) setNextCursor(feedResult.data.nextCursor);
    if (ownResult?.ok) setOwnNextCursor(ownResult.data.nextCursor);
    if (feedResult && !feedResult.ok) setServerError(feedResult.error.message);
    if (ownResult && !ownResult.ok) setServerError(ownResult.error.message);
    setFeedBusy(false);
  };
  const visiblePosts = posts.filter(post => filter === "Para ti" || (filter === "Siguiendo" && followed.has(post.handle)) || (filter === "Beats" && post.kind === "beat") || (filter === "Fotos" && post.kind === "photo") || (filter === "Videos" && post.kind === "video") || (filter === "Shorts" && post.kind === "short") || (filter === "Estados" && post.kind === "status"));

  const share = async (post: FeedPost) => {
    const url = new URL(window.location.href);
    url.hash = post.href?.slice(1) || "/home";
    const shareUrl = url.toString();
    try {
      if (navigator.share) await navigator.share({ title: `${post.creator} en BeatVault`, text: post.text, url: shareUrl });
      else { await navigator.clipboard.writeText(shareUrl); setShareMessage("Enlace copiado"); window.setTimeout(() => setShareMessage(""), 2200); }
    } catch { setShareMessage("No se pudo compartir ahora"); window.setTimeout(() => setShareMessage(""), 2200); }
  };

  return <main className="home-page">
    <section className="home-stories" aria-label="Estados de productores">
      <a className="home-story home-story-own" href="#/upload"><span><CirclePlus size={21} /><small>Tu estado</small></span></a>
      {stories.map(item => <button className="home-story" type="button" key={item.creator} onClick={() => setStory(item)}><span><img src={item.image} alt="" />{item.kind === "short" && <Video size={15} />}<small>{item.creator}</small></span></button>)}
      <a className="home-story home-story-more" href="#/shorts"><span><Video size={20} /><small>Ver Shorts</small></span></a>
    </section>
    <div className="home-layout">
      <section className="home-feed" aria-label="Feed de BeatVault">
        <HomeComposer scope={scope} onPublish={post => {
          if ("author" in post) setServerPosts(current => [post, ...current.filter(item => item.id !== post.id)]);
          else setLocalPosts(current => [post, ...current]);
        }} />
        {postStorageError && <p className="home-composer-error" role="status">El almacenamiento local de publicaciones no está disponible en este navegador.</p>}
        {serverError && <p className="home-composer-error" role="alert">No se pudieron sincronizar las publicaciones: {serverError}</p>}
        <div className="home-feed-toolbar"><div className="home-feed-tabs" role="group" aria-label="Filtrar publicaciones">{["Para ti", "Siguiendo", "Beats", "Fotos", "Videos", "Shorts", "Estados"].map(item => <button type="button" key={item} className={filter === item ? "active" : ""} aria-pressed={filter === item} onClick={() => setFilter(item)}>{item}</button>)}</div><span>{visiblePosts.length} publicaciones</span></div>
        {shareMessage && <p className="home-feedback" role="status"><Check size={14} />{shareMessage}</p>}
        {visiblePosts.length === 0 && <div className="home-empty"><h2>Aún no sigues a productores</h2><p>Explora el feed y sigue perfiles para verlos aquí.</p><button className="button ghost" type="button" onClick={() => setFilter("Para ti")}>Volver a Para ti</button></div>}
        {serverLoading && <p className="home-feed-status" role="status">Sincronizando publicaciones de la comunidad…</p>}
        {visiblePosts.map(post => {
          const social = post.asset ? socialByContentId[post.asset.id] : undefined;
          const postInteraction = post.socialPost ? socialByPostId[post.socialPost.id] : undefined;
          const postComments = postInteraction ? postInteraction.comments.map(comment => ({ id: comment.id, text: comment.body, createdAt: comment.createdAt, authorName: comment.authorName })) : social ? social.comments.map(comment => ({ id: comment.id, text: comment.body, createdAt: comment.createdAt, authorName: comment.authorName })) : comments[post.id] || [];
          const own = post.socialPost?.author.id === scope;
          return <HomePost key={post.id} post={post} liked={postInteraction?.reactedByMe ?? social?.reactedByMe ?? liked.has(post.id)} likeCount={postInteraction?.reactionCount ?? social?.reactionCount ?? post.likes + (liked.has(post.id) ? 1 : 0)} saved={saved.has(post.id)} followed={followed.has(post.handle)} comments={postComments} onComment={text => { void addPostComment(post, text); }} onExpandPhoto={() => setPhoto(post)} onFollow={() => setFollowed(current => toggleId(current, post.handle))} onLike={() => { void togglePostLike(post); }} onSave={() => setSaved(current => toggleId(current, post.id))} onPlay={onPlay} onShare={() => void share(post)} onDelete={own ? () => void deletePost(post) : undefined} onReport={post.socialPost && !own && scope !== "demo" ? (reason, details) => submitReport(post, reason, details) : undefined} />;
        })}
        {(nextCursor || ownNextCursor) && <button type="button" className="button ghost home-load-more" disabled={feedBusy} onClick={() => void loadMore()}>{feedBusy ? "Cargando…" : "Cargar más publicaciones"}</button>}
      </section>
      <aside className="home-rail">
        <section className="home-rail-card home-upload-cta"><span className="home-rail-icon"><CirclePlus size={18} /></span><div><h2>¿Tienes algo nuevo?</h2><p>Sube un beat o un one-shot a tu espacio.</p></div><a className="button" href="#/upload">Subir audio</a></section>
        <section className="home-rail-card"><div className="home-rail-title"><h2>En el radar</h2><span>DEMO</span></div><a className="home-trend" href="#/beats"><img src={hard808Cover} alt="" /><span><strong>808s con carácter</strong><small>Beats · Trap</small></span><Music2 size={16} /></a><a className="home-trend" href="#/shorts"><img src={loFiCover} alt="" /><span><strong>Texturas lo-fi</strong><small>Shorts · Producción</small></span><Video size={16} /></a><a className="home-explore-link" href="#/beats">Explorar sonidos <span>→</span></a></section>
        <section className="home-rail-card home-join-card"><ImageIcon size={18} /><p>Comparte una idea, encuentra tu próximo sonido y conecta con otros productores.</p><a href="#/profile">Completar perfil <span>→</span></a></section>
      </aside>
    </div>
    <dialog ref={storyDialog} className="home-story-dialog" aria-labelledby="home-story-title" onClose={() => setStory(null)} onClick={event => { if (event.target === storyDialog.current) storyDialog.current?.close(); }}>
      {story && <><button className="home-story-close" type="button" aria-label="Cerrar estado" onClick={() => storyDialog.current?.close()}>×</button><img src={story.image} alt="" /><div><span className="eyebrow">{story.kind === "short" ? "SHORT · DEMO" : "ESTADO · DEMO"}</span><h2 id="home-story-title">{story.title}</h2><p>{story.creator} está compartiendo una idea desde su estudio.</p><a className="button" href={story.kind === "short" ? "#/shorts" : "#/beats"}>{story.kind === "short" ? "Ver Shorts" : "Explorar beats"}</a></div></>}
    </dialog>
    {photo && <PhotoViewer post={photo} comments={photo.socialPost ? (socialByPostId[photo.socialPost.id]?.comments || []).map(comment => ({ id: comment.id, text: comment.body, createdAt: comment.createdAt, authorName: comment.authorName })) : comments[photo.id] || []} dialogRef={photoDialog} onClose={() => { photoDialog.current?.close(); setPhoto(null); }} onComment={text => { void addPostComment(photo, text); }} />}
  </main>;
}
