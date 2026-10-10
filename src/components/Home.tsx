import { useEffect, useMemo, useRef, useState } from "react";
import { Bookmark, Check, CirclePlus, Heart, Image as ImageIcon, MessageCircle, Music2, Play, Send, Video } from "lucide-react";
import type { AudioAsset } from "../types";
import type { CatalogAsset } from "../data/localCatalog";
import { creatorType } from "../data/creatorUploads";
import { scopedKey } from "../data/storageScope";
import { readLocalHomePosts, type LocalHomePost } from "../data/homePosts";
import { HomeComposer } from "./HomeComposer";
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
};
type Story = { creator: string; title: string; image: string; kind: "status" | "short" };

const stories: Story[] = [
  { creator: "Milo North", title: "808 de hoy", image: hard808Cover, kind: "status" },
  { creator: "Ari Sol", title: "Texturas nuevas", image: loFiCover, kind: "short" },
  { creator: "Kade Seven", title: "En el estudio", image: orchestraCover, kind: "status" },
  { creator: "Luna Keys", title: "Idea vocal", image: loFiCover, kind: "short" },
  { creator: "Juno.wav", title: "Nueva sesion", image: hard808Cover, kind: "status" },
];

const samplePosts: FeedPost[] = [
  { id: "post-status-1", kind: "status", creator: "Milo North", handle: "@milonorth", avatar: hard808Cover, time: "hace 12 min", text: "¿Qué le pondrías a este bajo: drums secos o una textura más sucia?", tags: ["808", "trap"], likes: 18, comments: 4, demo: true },
  { id: "post-photo-1", kind: "photo", creator: "Ari Sol", handle: "@arisol", avatar: loFiCover, time: "hace 38 min", text: "Una tarde buscando sonidos en cinta. Este loop terminó convirtiéndose en el inicio de un beat.", image: loFiCover, tags: ["lofi", "sample"], likes: 42, comments: 7, demo: true },
  { id: "post-short-1", kind: "short", creator: "Kade Seven", handle: "@kadeseven", time: "hace 1 h", avatar: orchestraCover, text: "De una percusión grabada en casa a una textura para el próximo track.", image: orchestraCover, tags: ["sounddesign", "shorts"], likes: 31, comments: 3, href: "#/shorts", demo: true },
  { id: "post-beat-1", kind: "beat", creator: "Juno.wav", handle: "@junowav", time: "hace 2 h", avatar: hard808Cover, text: "Boceto nocturno: espacio para una voz y un hook sencillo.", image: hard808Cover, tags: ["melodic", "beat"], likes: 26, comments: 5, beat: "Night Window", href: "#/beats", demo: true },
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

function HomePost({ post, liked, saved, followed, onLike, onSave, onPlay, onShare, onFollow }: {
  post: FeedPost; liked: boolean; saved: boolean; onLike: () => void; onSave: () => void;
  onPlay: (asset: AudioAsset) => void; onShare: () => void; followed: boolean; onFollow: () => void;
}) {
  const kindLabel = post.kind === "status" ? "Estado" : post.kind === "photo" ? "Foto" : post.kind === "video" ? "Video" : post.kind === "short" ? "Short" : "Beat";
  return <article className={`home-post home-post-${post.kind}`}>
    <header className="home-post-header">
      <img className="home-avatar" src={post.avatar} alt="" />
      <div className="home-post-author"><strong>{post.creator}</strong><span>{post.handle} · {post.time}</span></div>
      <span className={`home-kind home-kind-${post.kind}`}>{post.asset ? creatorType(post.asset.type) : kindLabel}</span>
      {post.demo && <span className="home-demo-mark">DEMO</span>}
      {post.handle.startsWith("@") && <button type="button" className={`home-follow ${followed ? "is-following" : ""}`} aria-pressed={followed} onClick={onFollow}>{followed ? <><Check size={13} /> Siguiendo</> : "Seguir"}</button>}
    </header>
    <p className="home-post-copy">{post.text}</p>
    {post.mediaUrl && post.kind === "video" && <div className="home-post-media"><video src={post.mediaUrl} controls preload="metadata" aria-label={`Video publicado por ${post.creator}`} /></div>}
    {post.mediaUrl && post.kind === "photo" && <div className="home-post-media"><img src={post.mediaUrl} alt={`Foto publicada por ${post.creator}`} /></div>}
    {post.image && <a className={`home-post-media ${post.kind === "short" ? "is-short" : ""}`} href={post.href} aria-label={post.kind === "short" ? `Abrir Short de ${post.creator}` : undefined}>
      <img src={post.image} alt={post.kind === "photo" ? `Foto del estudio de ${post.creator}` : ""} />
      {post.kind === "short" && <span className="home-media-play"><Play size={19} fill="currentColor" /></span>}
      {post.kind === "beat" && <span className="home-beat-title"><Music2 size={15} />{post.beat}</span>}
    </a>}
    {post.asset?.previewUrl && <button className="home-audio-preview" type="button" onClick={() => onPlay(post.asset!)}><Play size={16} fill="currentColor" /><span>Escuchar {post.asset.name}</span><span className="home-audio-bars" aria-hidden="true">▂ ▅ ▃ ▇ ▄ ▆ ▂ ▅</span></button>}
    <div className="home-post-tags">{post.tags.map(tag => <span key={tag}>#{tag}</span>)}</div>
    <div className="home-post-actions">
      <button type="button" className={liked ? "is-active" : ""} aria-pressed={liked} aria-label={liked ? "Quitar me gusta" : "Me gusta"} onClick={onLike}><Heart size={19} fill={liked ? "currentColor" : "none"} /><span>{post.likes + (liked ? 1 : 0)}</span></button>
      <span className="home-comment-count" aria-label={`${post.comments} comentarios`}><MessageCircle size={18} /><span>{post.comments}</span></span>
      {(post.demo || post.href) && <button type="button" aria-label="Compartir publicación" onClick={onShare}><Send size={18} /></button>}
      <button type="button" className={`home-save ${saved ? "is-active" : ""}`} aria-pressed={saved} aria-label={saved ? "Quitar de guardados" : "Guardar publicación"} onClick={onSave}><Bookmark size={18} fill={saved ? "currentColor" : "none"} /></button>
      {post.href && <a className="home-post-open" href={post.href}>{post.kind === "short" ? "Ver Short" : post.kind === "beat" ? "Explorar beats" : "Abrir"}</a>}
    </div>
  </article>;
}

export function Home({ uploads, onPlay, scope = "demo" }: { uploads: CatalogAsset[]; onPlay: (asset: AudioAsset) => void; scope?: string }) {
  const [filter, setFilter] = useState("Para ti");
  const [liked, setLiked] = useState(() => readIdSet("beatvault:home-likes", scope));
  const [saved, setSaved] = useState(() => readIdSet("beatvault:home-saves", scope));
  const [followed, setFollowed] = useState(() => readIdSet("beatvault:home-follows", scope));
  const [story, setStory] = useState<Story | null>(null);
  const [shareMessage, setShareMessage] = useState("");
  const [localPosts, setLocalPosts] = useState<LocalHomePost[]>([]);
  const [mediaUrls, setMediaUrls] = useState<Map<string, string>>(new Map());
  const [postStorageError, setPostStorageError] = useState(false);
  const storyDialog = useRef<HTMLDialogElement>(null);

  useEffect(() => { writeIdSet("beatvault:home-likes", scope, liked); }, [liked, scope]);
  useEffect(() => { writeIdSet("beatvault:home-saves", scope, saved); }, [saved, scope]);
  useEffect(() => { writeIdSet("beatvault:home-follows", scope, followed); }, [followed, scope]);
  useEffect(() => {
    let active = true;
    void readLocalHomePosts(scope).then(posts => { if (active) { setLocalPosts(posts); setPostStorageError(false); } }).catch(() => { if (active) setPostStorageError(true); });
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

  const posts = useMemo(() => {
    const createdPosts: FeedPost[] = localPosts.map(post => ({
      id: `local-${post.id}`, kind: post.kind, creator: "Tú", handle: "Tu publicación", time: new Date(post.createdAt).toLocaleString(), avatar: hard808Cover,
      text: post.text, tags: [], likes: 0, comments: 0, mediaUrl: mediaUrls.get(post.id),
    }));
    const ownPosts: FeedPost[] = uploads.filter(asset => asset.publicationStatus === "published" && creatorType(asset.type)).map(asset => ({
      id: `own-${asset.id}`, kind: "beat", creator: "Tu perfil", handle: "Tu publicación", time: "publicado", avatar: asset.cover || hard808Cover,
      text: asset.name, image: asset.cover || hard808Cover, tags: asset.tags.map(tag => tag.label), likes: 0, comments: 0,
      beat: asset.name, href: "#/beats", asset,
    }));
    return [...createdPosts, ...ownPosts, ...samplePosts];
  }, [uploads, localPosts, mediaUrls]);
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
    <header className="home-heading"><div><p className="eyebrow">BEATVAULT · HOME</p><h1>El sonido se mueve aquí.</h1><p>Ideas, sesiones y nuevos beats de la comunidad.</p></div><a className="button" href="#/upload"><CirclePlus size={17} /> Publicar audio</a></header>
    <section className="home-stories" aria-label="Estados de productores">
      <a className="home-story home-story-own" href="#/upload"><span><CirclePlus size={19} /></span><small>Tu estado</small></a>
      {stories.map(item => <button className="home-story" type="button" key={item.creator} onClick={() => setStory(item)}><span><img src={item.image} alt="" />{item.kind === "short" && <Video size={12} />}</span><small>{item.creator}</small></button>)}
      <a className="home-story home-story-more" href="#/shorts"><span><Video size={18} /></span><small>Ver Shorts</small></a>
    </section>
    <div className="home-layout">
      <section className="home-feed" aria-label="Feed de BeatVault">
        <HomeComposer scope={scope} onPublish={post => setLocalPosts(current => [post, ...current])} />
        {postStorageError && <p className="home-composer-error" role="status">El almacenamiento local de publicaciones no está disponible en este navegador.</p>}
        <div className="home-feed-toolbar"><div className="home-feed-tabs" role="group" aria-label="Filtrar publicaciones">{["Para ti", "Siguiendo", "Beats", "Fotos", "Videos", "Shorts", "Estados"].map(item => <button type="button" key={item} className={filter === item ? "active" : ""} aria-pressed={filter === item} onClick={() => setFilter(item)}>{item}</button>)}</div><span>{visiblePosts.length} publicaciones</span></div>
        {shareMessage && <p className="home-feedback" role="status"><Check size={14} />{shareMessage}</p>}
        {visiblePosts.length === 0 && <div className="home-empty"><h2>Aún no sigues a productores</h2><p>Explora el feed y sigue perfiles para verlos aquí.</p><button className="button ghost" type="button" onClick={() => setFilter("Para ti")}>Volver a Para ti</button></div>}
        {visiblePosts.map(post => <HomePost key={post.id} post={post} liked={liked.has(post.id)} saved={saved.has(post.id)} followed={followed.has(post.handle)} onFollow={() => setFollowed(current => toggleId(current, post.handle))} onLike={() => setLiked(current => toggleId(current, post.id))} onSave={() => setSaved(current => toggleId(current, post.id))} onPlay={onPlay} onShare={() => void share(post)} />)}
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
  </main>;
}
