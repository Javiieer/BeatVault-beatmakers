import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, AtSign, Check, Disc3, ExternalLink, Grid2X2, Image as ImageIcon, List, LockKeyhole, MapPin, MessageSquareText, Music2, Pencil, Play, Share2, SlidersHorizontal, Upload, Video, X } from 'lucide-react';
import type { AuthUser } from '../api/client';
import type { AudioAsset } from '../types';
import type { CatalogAsset } from '../data/localCatalog';
import { CatalogRepository } from '../data/catalogRepository';
import { creatorType, uploadCovers, uploadStatusLabels } from '../data/creatorUploads';
import { emptyProfile, type CreatorProfile, type ProfileInput } from '../domains/profile';
import { readProfile, saveProfile } from '../data/profileRepository';
import { profileCovers, profileCoverUrl } from '../data/profileArtwork';
import { readLocalHomePosts, subscribeToLocalHomePosts, type LocalHomePost } from '../data/homePosts';
import '../styles/creator-profile.css';

const artwork = (id: string) => uploadCovers.find(cover => cover.id === id)?.url || uploadCovers[2].url;
function Avatar({ profile }: { profile: CreatorProfile }) {
  return <div className="producer-avatar">{profile.avatarId === 'initials'
    ? <span>{profile.displayName.trim().split(/\s+/).slice(0, 2).map(word => word[0]).join('').toUpperCase() || 'BV'}</span>
    : <img src={artwork(profile.avatarId)} alt="" />}</div>;
}
function ProfileEditor({ profile, user, onSaved }: { profile: CreatorProfile; user: AuthUser; onSaved: (profile: CreatorProfile) => void }) {
  const initial: ProfileInput = { displayName: profile.displayName, bio: profile.bio, location: profile.location, website: profile.website, instagram: profile.instagram, genres: profile.genres, coverId: profile.coverId, avatarId: profile.avatarId, publicProfile: profile.publicProfile };
  const [draft, setDraft] = useState<ProfileInput>(initial);
  const [genres, setGenres] = useState(initial.genres.join(', '));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const dirty = JSON.stringify(draft) !== JSON.stringify(initial);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);
  const cancel = () => { if (!dirty || window.confirm('Descartar los cambios del perfil?')) window.location.hash = '#/profile'; };
  const save = async (event: React.FormEvent) => {
    event.preventDefault(); if (busy) return;
    setBusy(true); setError('');
    try {
      const result = await saveProfile(draft);
      if (result.ok) { onSaved(result.data); window.location.hash = '#/profile'; }
      else setError(result.error.message);
    } finally { setBusy(false); }
  };
  return <div className="producer-settings">
    <header className="producer-settings-heading"><div><p className="eyebrow">Mi cuenta</p><h1>Editar perfil</h1></div><button className="button ghost" onClick={cancel} disabled={busy}><ArrowLeft size={16} />Volver al perfil</button></header>
    <div className="producer-settings-layout">
      <form onSubmit={event => void save(event)}>
        <fieldset disabled={busy} className="producer-fields">
          <section><h2>Identidad</h2><div className="producer-form-grid">
            <label>Nombre artistico<input required maxLength={60} value={draft.displayName} onChange={e => setDraft({ ...draft, displayName: e.target.value })} autoComplete="nickname" /></label>
            <label>Ubicacion<input maxLength={80} value={draft.location} onChange={e => setDraft({ ...draft, location: e.target.value })} autoComplete="off" /></label>
          </div><label>Biografia<textarea rows={4} maxLength={320} value={draft.bio} onChange={e => setDraft({ ...draft, bio: e.target.value })} /><small>{draft.bio.length}/320</small></label>
          <label>Generos<input value={genres} maxLength={220} placeholder="Trap, R&B, Lo-fi" onChange={e => { setGenres(e.target.value); setDraft({ ...draft, genres: e.target.value.split(',').map(g => g.trim()).filter(Boolean) }); }} /></label></section>
          <section><h2>Imagen del perfil</h2><fieldset className="producer-image-picker"><legend>Avatar</legend>
            <button type="button" className="producer-initials-option" aria-label="Avatar con iniciales" aria-pressed={draft.avatarId === 'initials'} onClick={() => setDraft({ ...draft, avatarId: 'initials' })}>Aa</button>
            {uploadCovers.map(cover => <button key={cover.id} type="button" aria-label={`Avatar ${cover.name}`} aria-pressed={draft.avatarId === cover.id} onClick={() => setDraft({ ...draft, avatarId: cover.id })}><img src={cover.url} alt="" /></button>)}
          </fieldset><fieldset className="producer-image-picker producer-cover-picker"><legend>Portada</legend>{profileCovers.map(cover => <button type="button" key={cover.id} aria-label={`Portada ${cover.name}`} aria-pressed={draft.coverId === cover.id} onClick={() => setDraft({ ...draft, coverId: cover.id })}><img src={cover.url} alt="" /></button>)}</fieldset></section>
          <section><h2>Enlaces</h2><div className="producer-form-grid"><label>Sitio web<input type="url" maxLength={200} placeholder="https://" value={draft.website} onChange={e => setDraft({ ...draft, website: e.target.value })} /></label><label>Instagram<input maxLength={31} placeholder="@usuario" value={draft.instagram} onChange={e => setDraft({ ...draft, instagram: e.target.value })} /></label></div></section>
          <section><h2>Visibilidad</h2><label className="producer-visibility"><input type="checkbox" checked={draft.publicProfile} onChange={e => setDraft({ ...draft, publicProfile: e.target.checked })} />Perfil publico</label></section>
          {error && <p role="alert" className="form-error">{error}</p>}
          <div className="producer-save"><button type="button" className="button ghost" onClick={cancel}>Cancelar</button><button className="button" disabled={!draft.displayName.trim()}><Check size={16} />{busy ? 'Guardando...' : 'Guardar cambios'}</button></div>
        </fieldset>
      </form>
      <aside className="producer-settings-preview"><p className="eyebrow">Vista previa</p><img className="producer-preview-cover" src={profileCoverUrl(draft.coverId)} alt="Portada seleccionada" /><Avatar profile={{ ...draft, accountId: profile.accountId }} /><h2>{draft.displayName || 'Tu nombre'}</h2><p>{draft.bio || 'Sin biografia'}</p><dl className="producer-private-account"><dt>Correo de acceso</dt><dd>{user.email}</dd><dt>Permisos</dt><dd>{user.role === 'admin' ? 'Administrador' : 'Creador'}</dd></dl></aside>
    </div>
  </div>;
}

export function CreatorProfilePage({ user, uploads, onPlay, editing = false, targetId }: {
  user?: AuthUser; uploads?: CatalogAsset[]; onPlay: (asset: AudioAsset) => void; editing?: boolean; targetId?: string;
}) {
  const [profile, setProfile] = useState<CreatorProfile>();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [remoteUploads, setRemoteUploads] = useState<CatalogAsset[]>([]);
  const [publicView, setPublicView] = useState(Boolean(targetId));
  const [tab, setTab] = useState(user && (!targetId || targetId === user.id) ? 'posts' : 'projects');
  const [profilePosts, setProfilePosts] = useState<Array<LocalHomePost & { mediaUrl?: string }>>([]);
  const postUrls = useRef<string[]>([]);
  const [type, setType] = useState('all');
  const [layout, setLayout] = useState('grid');
  const [selected, setSelected] = useState<CatalogAsset>();
  const [shareMessage, setShareMessage] = useState('');
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (!user && !targetId) { setProfile(emptyProfile('demo')); setLoading(false); return; }
      const result = await readProfile(targetId);
      if (cancelled) return;
      if (result.ok) setProfile(result.data); else setError(result.error.message);
      setLoading(false);
    };
    void load();
    return () => { cancelled = true; };
  }, [user, targetId]);
  useEffect(() => {
    if (uploads) return;
    let cancelled = false;
    void new CatalogRepository(undefined, 'public').list().then(result => {
      if (cancelled) return;
      if (result.error) setError(result.error); else setRemoteUploads(result.assets);
    });
    return () => { cancelled = true; };
  }, [uploads]);
  useEffect(() => {
    if (!profile || user?.id !== profile.accountId) return;
    let cancelled = false;
    const loadPosts = async () => {
      try {
        const posts = await readLocalHomePosts(profile.accountId);
        if (cancelled) return;
        postUrls.current.forEach(url => URL.revokeObjectURL(url));
        postUrls.current = [];
        setProfilePosts(posts.map(post => {
          if (!post.media) return post;
          const mediaUrl = URL.createObjectURL(post.media);
          postUrls.current.push(mediaUrl);
          return { ...post, mediaUrl };
        }));
      } catch {
        if (!cancelled) setError('No se pudieron cargar tus publicaciones locales.');
      }
    };
    void loadPosts();
    const unsubscribe = subscribeToLocalHomePosts(profile.accountId, () => void loadPosts());
    return () => {
      cancelled = true;
      unsubscribe();
      postUrls.current.forEach(url => URL.revokeObjectURL(url));
      postUrls.current = [];
    };
  }, [profile, user?.id]);
  const selectedOpen = Boolean(selected);
  useEffect(() => { if (selectedOpen) dialog.current?.showModal(); }, [selectedOpen]);
  if (loading) return <section className="producer-message" role="status">Cargando perfil...</section>;
  if (!profile) return <section className="producer-message"><h1>Perfil no disponible</h1><p role="alert">{error}</p></section>;
  if (editing) return user ? <ProfileEditor profile={profile} user={user} onSaved={setProfile} /> : <section className="producer-message"><h1>Configuracion de perfil</h1><p>Inicia sesion para editar tu perfil.</p></section>;
  const isOwner = user?.id === profile.accountId;
  const showPrivate = isOwner && !publicView;
  const projects = (uploads || remoteUploads).filter(asset => asset.ownerId === profile.accountId && creatorType(asset.type) && (showPrivate ? asset.publicationStatus !== 'archived' : asset.publicationStatus === 'published'));
  const filtered = projects.filter(asset => type === 'all' || creatorType(asset.type) === type);
  const share = async () => {
    try { await navigator.clipboard.writeText(`${window.location.origin}${window.location.pathname}#/profile?id=${encodeURIComponent(profile.accountId)}`); setShareMessage('Enlace copiado'); }
    catch { setShareMessage('No se pudo copiar el enlace'); }
  };
  return <div className="producer-profile">
    <div className="producer-banner"><img src={profileCoverUrl(profile.coverId)} alt="Portada del perfil" />{isOwner && <a className="producer-cover-edit" href="#/settings" title="Editar portada" aria-label="Editar portada"><Pencil size={18} /></a>}</div>
    <section className="producer-identity-band">
      <Avatar profile={profile} />
      <div className="producer-name"><p className="eyebrow">BeatVault Creator</p><h1>{profile.displayName}</h1><div className="producer-meta">{profile.location && <span><MapPin size={14} />{profile.location}</span>}{isOwner && !profile.publicProfile && <span><LockKeyhole size={14} />Perfil privado</span>}</div></div>
      <div className="producer-profile-actions">{isOwner && <><a className="button ghost" href="#/settings"><Pencil size={16} />Editar perfil</a><button className="button ghost" aria-pressed={publicView} onClick={() => { setPublicView(value => !value); setSelected(undefined); }}>{publicView ? 'Mi vista' : 'Vista publica'}</button></>}{profile.publicProfile && <button className="button ghost" onClick={() => void share()}><Share2 size={16} />Compartir</button>}</div>
    </section>
    <div className="producer-summary"><div><p className="producer-bio">{profile.bio || 'Sin biografia'}</p><div className="producer-genres">{profile.genres.map(genre => <span key={genre}>{genre}</span>)}</div></div><div className="producer-count"><strong>{projects.length}</strong><span>proyectos</span></div></div>
    {shareMessage && <p role="status">{shareMessage}</p>}{error && <p role="alert" className="form-error">{error}</p>}
    <div className="producer-tabs" role="tablist" aria-label="Contenido del perfil">{[...(isOwner ? [['posts', 'Publicaciones']] : []), ['projects', 'Proyectos'], ['about', 'Acerca de']].map(([value, name]) => <button id={`profile-tab-${value}`} role="tab" key={value} aria-selected={tab === value} aria-controls={`profile-panel-${value}`} onClick={() => setTab(value)}>{value === 'posts' ? <MessageSquareText size={17} /> : value === 'projects' ? <Disc3 size={17} /> : <Music2 size={17} />}{name}</button>)}</div>
    {tab === 'about' ? <section id="profile-panel-about" role="tabpanel" aria-labelledby="profile-tab-about" className="producer-about"><h2>Acerca de {profile.displayName}</h2><p>{profile.bio || 'Sin biografia'}</p>{profile.location && <p><MapPin size={16} />{profile.location}</p>}<div className="producer-links">{profile.website && <a href={profile.website} target="_blank" rel="noopener noreferrer"><ExternalLink size={16} />Sitio web</a>}{profile.instagram && <a href={`https://www.instagram.com/${encodeURIComponent(profile.instagram)}/`} target="_blank" rel="noopener noreferrer"><AtSign size={16} />@{profile.instagram}</a>}</div></section> : tab === 'posts' && isOwner ? <section id="profile-panel-posts" role="tabpanel" aria-labelledby="profile-tab-posts" className="producer-posts">
      {publicView ? <div className="producer-message"><LockKeyhole size={25} /><h2>Publicaciones solo en este dispositivo</h2><p>Aun no se publican en perfiles visibles para otros usuarios.</p></div> : <>
        <div className="producer-posts-heading"><h2>Tus publicaciones</h2><a className="button ghost" href="#/home">Crear publicacion</a></div>
        {profilePosts.length ? profilePosts.map(post => <article className="producer-post" key={post.id}>
          <div className="producer-post-meta"><span>{post.kind === 'photo' ? <ImageIcon size={15} /> : post.kind === 'video' ? <Video size={15} /> : <MessageSquareText size={15} />}{post.kind === 'photo' ? 'Foto' : post.kind === 'video' ? 'Video' : 'Estado'}</span><time dateTime={post.createdAt}>{new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(post.createdAt))}</time></div>
          {post.text && <p className="producer-post-text">{post.text}</p>}
          {post.mediaUrl && (post.kind === 'video' ? <video controls preload="metadata" src={post.mediaUrl} aria-label={post.mediaName || 'Video publicado'} /> : <img src={post.mediaUrl} alt={post.mediaName || 'Imagen publicada'} />)}
        </article>) : <div className="producer-message"><MessageSquareText size={26} /><h2>Aun no tienes publicaciones</h2><p>Lo que compartas en Inicio aparecera aqui.</p><a className="button" href="#/home">Ir a Inicio</a></div>}
      </>}
    </section> :
      <section id="profile-panel-projects" role="tabpanel" aria-labelledby="profile-tab-projects">
        <div className="producer-project-toolbar"><div className="filter-chips" aria-label="Tipo de proyecto">{['all', 'Beat', 'One-shot'].map(value => <button key={value} className={type === value ? 'active' : ''} aria-pressed={type === value} onClick={() => setType(value)}>{value === 'all' ? 'Todos' : value === 'Beat' ? 'Beats' : 'One-shots'}</button>)}</div><div className="producer-layout-controls"><button aria-label="Vista cuadricula" title="Cuadricula" aria-pressed={layout === 'grid'} onClick={() => setLayout('grid')}><Grid2X2 size={18} /></button><button aria-label="Vista lista" title="Lista" aria-pressed={layout === 'list'} onClick={() => setLayout('list')}><List size={18} /></button>{showPrivate && <a href="#/studio" aria-label="Gestionar mis subidas" title="Gestionar mis subidas"><SlidersHorizontal size={18} /></a>}</div></div>
        {filtered.length ? <div className={`producer-projects ${layout}`}>{filtered.map(asset => <article key={asset.id} className="producer-project">
          <button className="producer-project-art" onClick={() => setSelected(asset)} aria-label={`Ver proyecto ${asset.name}`}><img src={asset.cover || artwork('808')} alt="" /></button>
          <div className="producer-project-copy"><span className="eyebrow">{creatorType(asset.type)}</span><h2><button onClick={() => setSelected(asset)}>{asset.name}</button></h2><p>{asset.tags.map(tag => `#${tag.label}`).join(' ')}</p>{showPrivate && <span className={`publication-pill ${asset.publicationStatus}`}>{uploadStatusLabels[asset.publicationStatus]}</span>}</div>
          {showPrivate && <button className="producer-project-play" aria-label={`Escuchar ${asset.name}`} title={asset.previewUrl ? 'Escuchar' : 'Audio no disponible'} disabled={!asset.previewUrl} onClick={() => onPlay(asset)}><Play size={18} /></button>}
        </article>)}</div> : <div className="producer-message"><Music2 size={28} /><h2>{showPrivate ? 'Tu siguiente proyecto empieza aqui' : 'Sin proyectos publicados'}</h2>{showPrivate && <a className="button" href="#/upload"><Upload size={16} />Subir audio</a>}</div>}
      </section>}
    {selected && <dialog ref={dialog} className="producer-project-dialog" aria-labelledby="producer-detail-title" onCancel={() => setSelected(undefined)} onClose={() => setSelected(undefined)}><button className="producer-dialog-close" aria-label="Cerrar proyecto" onClick={() => setSelected(undefined)}><X size={20} /></button><img src={selected.cover || artwork('808')} alt="" /><div><span className="eyebrow">{creatorType(selected.type)}</span><h2 id="producer-detail-title">{selected.name}</h2><p>{selected.tags.map(tag => `#${tag.label}`).join(' ')}</p>{showPrivate && <><p>{selected.metadata.format} · {selected.metadata.size}</p><button className="button" disabled={!selected.previewUrl} onClick={() => onPlay(selected)}><Play size={16} />Escuchar</button><a className="button ghost" href="#/studio">Gestionar subida</a></>}</div></dialog>}
  </div>;
}
