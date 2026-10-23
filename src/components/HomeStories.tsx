import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, CirclePlus, Trash2, Video, X } from 'lucide-react'
import type { SocialStoryView } from '../data/socialStoryRepository'
import { defaultAvatarFocalPoint } from '../domains/profile'
import '../styles/home-stories.css'

const maxStoryCreators = 12
type StoryGroup = { authorId: string; displayName: string; avatarUrl?: string; avatarFocalPoint?: SocialStoryView['author']['avatarFocalPoint']; stories: SocialStoryView[] }

function activeStoryGroups(stories: SocialStoryView[], now: number): StoryGroup[] {
  const groups = new Map<string, StoryGroup>()
  for (const story of stories) {
    const createdAt = Date.parse(story.createdAt)
    const expiresAt = Date.parse(story.expiresAt)
    if (!Number.isFinite(createdAt) || !Number.isFinite(expiresAt) || createdAt > now || expiresAt <= now) continue
    const group = groups.get(story.author.id) || {
      authorId: story.author.id,
      displayName: story.author.displayName,
      avatarUrl: story.author.avatarUrl,
      avatarFocalPoint: story.author.avatarFocalPoint,
      stories: [],
    }
    group.stories.push(story)
    groups.set(story.author.id, group)
  }
  return [...groups.values()]
    .map(group => ({ ...group, stories: group.stories.sort((a, b) => a.createdAt.localeCompare(b.createdAt)) }))
    .sort((a, b) => b.stories.at(-1)!.createdAt.localeCompare(a.stories.at(-1)!.createdAt))
    .slice(0, maxStoryCreators)
}

export function HomeStories({ stories, viewerId, onCreate, onDelete, loading = false, error = '', onRetry }: { stories: SocialStoryView[]; viewerId: string; onCreate: () => void; onDelete: (story: SocialStoryView) => Promise<boolean>; loading?: boolean; error?: string; onRetry?: () => void }) {
  const [now, setNow] = useState(0)
  const groups = useMemo(() => activeStoryGroups(stories, now), [stories, now])
  const [activeAuthorId, setActiveAuthorId] = useState<string>()
  const [activeIndex, setActiveIndex] = useState(0)
  const [deleteBusy, setDeleteBusy] = useState(false)
  const dialogRef = useRef<HTMLDialogElement>(null)
  const activeGroup = groups.find(group => group.authorId === activeAuthorId)
  const activeStory = activeGroup?.stories[activeIndex]

  useEffect(() => {
    setNow(Date.now())
    const timer = window.setInterval(() => setNow(Date.now()), 60_000)
    return () => window.clearInterval(timer)
  }, [])
  useEffect(() => { setNow(Date.now()) }, [stories])
  useEffect(() => {
    const dialog = dialogRef.current
    if (activeStory && dialog && !dialog.open) dialog.showModal()
    else if (!activeStory && dialog?.open) dialog.close()
  }, [activeStory])

  const close = () => {
    if (dialogRef.current?.open) dialogRef.current.close()
    setActiveAuthorId(undefined)
  }
  const move = (direction: -1 | 1) => {
    if (!activeGroup) return
    const next = activeIndex + direction
    if (next >= 0 && next < activeGroup.stories.length) setActiveIndex(next)
    else {
      const groupIndex = groups.findIndex(group => group.authorId === activeGroup.authorId) + direction
      const nextGroup = groups[groupIndex]
      if (!nextGroup) return
      setActiveAuthorId(nextGroup.authorId)
      setActiveIndex(direction > 0 ? 0 : nextGroup.stories.length - 1)
    }
  }
  const deleteActive = async () => {
    if (!activeStory || deleteBusy || !window.confirm('¿Eliminar esta historia ahora?')) return
    setDeleteBusy(true)
    try { if (await onDelete(activeStory)) close() }
    finally { setDeleteBusy(false) }
  }

  return <>
    <section className="home-stories" aria-label="Historias recientes">
      <button className="home-story home-story-own" type="button" onClick={onCreate}>
        <span><CirclePlus size={21} /><small>Crear historia</small></span>
      </button>
      {groups.map(group => {
        const latest = group.stories.at(-1)!
        return <button className="home-story home-story-real" type="button" key={group.authorId} onClick={() => { setActiveAuthorId(group.authorId); setActiveIndex(0) }} aria-label={`Ver historia de ${group.displayName}`}>
          <span>
            {latest.media?.mimeType.startsWith('image/') ? <img src={latest.media.url} alt="" /> : <span className="home-story-text-preview">{latest.body}</span>}
            {latest.media?.mimeType.startsWith('video/') && <Video size={15} />}
            <small>{group.displayName}{group.stories.length > 1 ? ` · ${group.stories.length}` : ''}</small>
          </span>
        </button>
      })}
      {loading && <p className="home-stories-empty" role="status">Cargando historias…</p>}
      {error && <div className="home-stories-error" role="alert"><span>{error}</span>{onRetry && <button type="button" onClick={onRetry}>Reintentar</button>}</div>}
      {!loading && !error && groups.length === 0 && <p className="home-stories-empty">Aún no hay historias activas.</p>}
    </section>

    <dialog ref={dialogRef} className="home-story-dialog" aria-label="Historias" onClose={() => setActiveAuthorId(undefined)} onClick={event => { if (event.target === dialogRef.current) close() }}>
      {activeStory && activeGroup && <>
        <div className="home-story-dialog-content">
          {activeStory.media?.mimeType.startsWith('video/')
            ? <video src={activeStory.media.url} controls playsInline preload="metadata" aria-label={`Historia en video de ${activeGroup.displayName}`} />
            : activeStory.media
              ? <img src={activeStory.media.url} alt={`Historia de ${activeGroup.displayName}`} />
              : <p className="home-story-status-text">{activeStory.body}</p>}
        </div>
        <div className="home-story-dialog-details">
          <button className="home-story-close" type="button" aria-label="Cerrar historias" onClick={close}><X size={18} /></button>
          <div className="home-story-progress" aria-label={`Historia ${activeIndex + 1} de ${activeGroup.stories.length}`}>
            {activeGroup.stories.map((item, index) => <span key={item.id} className={index <= activeIndex ? 'is-viewed' : ''} />)}
          </div>
          <div className="home-story-author">
            {activeGroup.avatarUrl ? <img src={activeGroup.avatarUrl} alt="" style={{ objectPosition: `${activeGroup.avatarFocalPoint?.x ?? defaultAvatarFocalPoint.x}% ${activeGroup.avatarFocalPoint?.y ?? defaultAvatarFocalPoint.y}%` }} /> : <span aria-hidden="true">{activeGroup.displayName.slice(0, 1).toUpperCase()}</span>}
            <div><strong>{activeGroup.displayName}</strong><small>Expira {new Date(activeStory.expiresAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</small></div>
          </div>
          {activeStory.body && activeStory.kind !== 'status' && <p>{activeStory.body}</p>}
          <div className="home-story-navigation">
            <button type="button" className="icon-button" aria-label="Historia anterior" onClick={() => move(-1)} disabled={groups[0]?.authorId === activeGroup.authorId && activeIndex === 0}><ChevronLeft size={18} /></button>
            <span>{activeStory.audience === 'private' ? 'Solo tú' : activeStory.audience === 'friends' ? 'Amigos' : 'Público'}</span>
            {activeStory.author.id === viewerId && <button type="button" className="icon-button" aria-label="Eliminar historia" disabled={deleteBusy} onClick={() => void deleteActive()}><Trash2 size={16} /></button>}
            <button type="button" className="icon-button" aria-label="Historia siguiente" onClick={() => move(1)} disabled={groups.at(-1)?.authorId === activeGroup.authorId && activeIndex === activeGroup.stories.length - 1}><ChevronRight size={18} /></button>
          </div>
        </div>
      </>}
    </dialog>
  </>
}
