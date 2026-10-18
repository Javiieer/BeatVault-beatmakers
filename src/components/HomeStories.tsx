import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, CirclePlus, Video, X } from "lucide-react";
import type { SocialPostView } from "../data/socialPostRepository";
import { defaultAvatarFocalPoint } from "../domains/profile";
import "../styles/home-stories.css";

const storyLifetimeMs = 24 * 60 * 60 * 1000;
const maxStoryCreators = 12;

type StoryGroup = { authorId: string; displayName: string; avatarUrl?: string; avatarFocalPoint?: SocialPostView['author']['avatarFocalPoint']; posts: SocialPostView[] };

function recentStoryGroups(posts: SocialPostView[], now: number): StoryGroup[] {
  const groups = new Map<string, StoryGroup>();
  for (const post of posts) {
    const createdAt = Date.parse(post.createdAt);
    if (post.visibility !== "published" || !Number.isFinite(createdAt) || createdAt > now || now - createdAt >= storyLifetimeMs) continue;
    const group = groups.get(post.author.id) || {
      authorId: post.author.id,
      displayName: post.author.displayName,
      avatarUrl: post.author.avatarUrl,
      avatarFocalPoint: post.author.avatarFocalPoint,
      posts: [],
    };
    group.posts.push(post);
    groups.set(post.author.id, group);
  }
  return [...groups.values()]
    .map(group => ({ ...group, posts: group.posts.sort((a, b) => a.createdAt.localeCompare(b.createdAt)) }))
    .sort((a, b) => b.posts.at(-1)!.createdAt.localeCompare(a.posts.at(-1)!.createdAt))
    .slice(0, maxStoryCreators);
}

export function HomeStories({ posts, onCreate }: { posts: SocialPostView[]; onCreate: () => void }) {
  const [now, setNow] = useState(0);
  const stories = useMemo(() => recentStoryGroups(posts, now), [posts, now]);
  const [activeAuthorId, setActiveAuthorId] = useState<string>();
  const [activeIndex, setActiveIndex] = useState(0);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const activeGroup = stories.find(group => group.authorId === activeAuthorId);
  const activePost = activeGroup?.posts[activeIndex];

  useEffect(() => {
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => {
    const dialog = dialogRef.current;
    if (activePost && dialog && !dialog.open) dialog.showModal();
    else if (!activePost && dialog?.open) dialog.close();
  }, [activePost]);

  const close = () => {
    if (dialogRef.current?.open) dialogRef.current.close();
    setActiveAuthorId(undefined);
  };
  const move = (direction: -1 | 1) => {
    if (!activeGroup) return;
    const next = activeIndex + direction;
    if (next >= 0 && next < activeGroup.posts.length) setActiveIndex(next);
    else {
      const groupIndex = stories.findIndex(group => group.authorId === activeGroup.authorId) + direction;
      const nextGroup = stories[groupIndex];
      if (!nextGroup) return;
      setActiveAuthorId(nextGroup.authorId);
      setActiveIndex(direction > 0 ? 0 : nextGroup.posts.length - 1);
    }
  };

  return <>
    <section className="home-stories" aria-label="Estados recientes">
      <button className="home-story home-story-own" type="button" onClick={onCreate}>
        <span><CirclePlus size={21} /><small>Crear estado</small></span>
      </button>
      {stories.map(group => {
        const latest = group.posts.at(-1)!;
        return <button className="home-story home-story-real" type="button" key={group.authorId} onClick={() => { setActiveAuthorId(group.authorId); setActiveIndex(0); }} aria-label={`Ver estado de ${group.displayName}`}>
          <span>
            {latest.media?.mimeType.startsWith("image/") ? <img src={latest.media.url} alt="" /> : <span className="home-story-text-preview">{latest.body}</span>}
            {latest.media?.mimeType.startsWith("video/") && <Video size={15} />}
            <small>{group.displayName}{group.posts.length > 1 ? ` · ${group.posts.length}` : ""}</small>
          </span>
        </button>;
      })}
      {stories.length === 0 && <p className="home-stories-empty">No hay estados recientes. Comparte algo desde Home.</p>}
    </section>

    <dialog ref={dialogRef} className="home-story-dialog" aria-label="Estados recientes" onClose={() => setActiveAuthorId(undefined)} onClick={event => { if (event.target === dialogRef.current) close(); }}>
      {activePost && activeGroup && <>
        <div className="home-story-dialog-content">
          {activePost.media?.mimeType.startsWith("video/")
            ? <video src={activePost.media.url} controls playsInline preload="metadata" aria-label={`Video de ${activeGroup.displayName}`} />
            : activePost.media
              ? <img src={activePost.media.url} alt={`Publicación de ${activeGroup.displayName}`} />
              : <p className="home-story-status-text">{activePost.body}</p>}
        </div>
        <div className="home-story-dialog-details">
          <button className="home-story-close" type="button" aria-label="Cerrar estados" onClick={close}><X size={18} /></button>
          <div className="home-story-progress" aria-label={`Estado ${activeIndex + 1} de ${activeGroup.posts.length}`}>
            {activeGroup.posts.map((post, index) => <span key={post.id} className={index <= activeIndex ? "is-viewed" : ""} />)}
          </div>
          <div className="home-story-author">
            {activeGroup.avatarUrl ? <img src={activeGroup.avatarUrl} alt="" style={{ objectPosition: `${activeGroup.avatarFocalPoint?.x ?? defaultAvatarFocalPoint.x}% ${activeGroup.avatarFocalPoint?.y ?? defaultAvatarFocalPoint.y}%` }} /> : <span aria-hidden="true">{activeGroup.displayName.slice(0, 1).toUpperCase()}</span>}
            <div><strong>{activeGroup.displayName}</strong><small>{new Date(activePost.createdAt).toLocaleString()}</small></div>
          </div>
          <p>{activePost.body}</p>
          <div className="home-story-navigation">
            <button type="button" className="icon-button" aria-label="Estado anterior" onClick={() => move(-1)} disabled={stories[0]?.authorId === activeGroup.authorId && activeIndex === 0}><ChevronLeft size={18} /></button>
            <span>{activePost.audience === "private" ? "Solo tú" : activePost.audience === "friends" ? "Amigos" : "Público"}</span>
            <button type="button" className="icon-button" aria-label="Estado siguiente" onClick={() => move(1)} disabled={stories.at(-1)?.authorId === activeGroup.authorId && activeIndex === activeGroup.posts.length - 1}><ChevronRight size={18} /></button>
          </div>
        </div>
      </>}
    </dialog>
  </>;
}
