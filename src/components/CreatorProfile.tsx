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
import { authClient, getCurrencyRates, isAuthUser, isNull } from '../api/client';
import { readUserSettings, saveUserSettings, type UserSettings } from '../data/userSettings';
import { Globe2, Bell, Shield, UserRound, Palette, Languages } from 'lucide-react';
import { toRgb } from '../app/theme';
import { tx } from '../i18n';
import { exchangeRate, type ExchangeRates } from '../domains/marketplace/currency';

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
  const [savedMessage, setSavedMessage] = useState('');
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
      if (result.ok) { onSaved(result.data); setSavedMessage('Perfil actualizado.'); }
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
          {savedMessage && <p role="status" className="settings-notice"><Check size={15} />{savedMessage}</p>}
          <div className="producer-save"><button type="button" className="button ghost" onClick={cancel}>Cancelar</button><button className="button" disabled={!draft.displayName.trim()}><Check size={16} />{busy ? 'Guardando...' : 'Guardar cambios'}</button></div>
        </fieldset>
      </form>
      <aside className="producer-settings-preview"><p className="eyebrow">Vista previa</p><img className="producer-preview-cover" src={profileCoverUrl(draft.coverId)} alt="Portada seleccionada" /><Avatar profile={{ ...draft, accountId: profile.accountId }} /><h2>{draft.displayName || 'Tu nombre'}</h2><p>{draft.bio || 'Sin biografia'}</p><dl className="producer-private-account"><dt>Correo de acceso</dt><dd>{user.email}</dd><dt>Permisos</dt><dd>{user.role === 'admin' ? 'Administrador' : user.role === 'community_manager' ? 'Community manager' : 'Creador'}</dd></dl></aside>
    </div>
  </div>;
}

function SettingsCenter({ profile, user, onProfileSaved }: { profile: CreatorProfile; user: AuthUser; onProfileSaved: (profile: CreatorProfile) => void }) {
  const sections = [
    ['profile', 'Perfil', UserRound], ['privacy', 'Privacidad', Shield], ['preferences', 'Preferencias', Palette],
    ['notifications', 'Notificaciones', Bell], ['account', 'Cuenta', Globe2], ['security', 'Seguridad', LockKeyhole],
  ] as const;
  const [section, setSection] = useState<(typeof sections)[number][0]>('profile');
  const [settings, setSettings] = useState<UserSettings>(() => readUserSettings(user.id));
  const [exchangeRates, setExchangeRates] = useState<ExchangeRates>();
  const [email, setEmail] = useState(user.email);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const updateSettings = (next: UserSettings) => {
    setSettings(next);
    setNotice(saveUserSettings(user.id, next) ? 'Preferencias guardadas en este dispositivo.' : 'El navegador no permitió guardar los cambios.');
  };
  useEffect(() => {
    document.documentElement.lang = settings.language;
    document.documentElement.classList.toggle('reduce-motion', settings.reducedMotion);
    return () => document.documentElement.classList.remove('reduce-motion');
  }, [settings.language, settings.reducedMotion]);
  useEffect(() => {
    let active = true;
    void getCurrencyRates().then(result => { if (active && result.ok) setExchangeRates(result.data); });
    return () => { active = false; };
  }, []);
  const changeEmail = async (event: React.FormEvent) => {
    event.preventDefault(); setBusy(true); setError(''); setNotice('');
    const result = await authClient.request('/api/auth/email-change', { method: 'POST', body: JSON.stringify({ email, currentPassword }) }, isAuthUser);
    setBusy(false);
    if (!result.ok) { setError(result.error.message); return; }
    setEmail(result.data.email); setCurrentPassword(''); setNotice('Correo actualizado localmente. Queda sin verificar; la confirmación por email debe habilitarse antes de producción.');
    window.dispatchEvent(new CustomEvent('beatvault:account-updated', { detail: result.data }));
  };
  const changePassword = async (event: React.FormEvent) => {
    event.preventDefault(); setBusy(true); setError(''); setNotice('');
    const result = await authClient.request('/api/auth/password-change', { method: 'POST', body: JSON.stringify({ currentPassword, password: newPassword }) }, isNull);
    setBusy(false);
    if (!result.ok) { setError(result.error.message); return; }
    setCurrentPassword(''); setNewPassword(''); setNotice('Contraseña actualizada. Las demás sesiones se cerraron; esta sesión sigue activa.');
  };
  const title = sections.find(item => item[0] === section)?.[1] || 'Ajustes';
  return <div className="producer-settings">
    <header className="producer-settings-heading"><div><p className="eyebrow">Cuenta y preferencias</p><h1>Ajustes</h1></div><a className="button ghost" href="#/profile"><ArrowLeft size={16} />Volver al perfil</a></header>
    <div className="settings-center-layout">
      <nav className="settings-nav" aria-label="Secciones de ajustes">{sections.map(([id, label, Icon]) => <button key={id} type="button" className={section === id ? 'active' : ''} aria-current={section === id ? 'page' : undefined} onClick={() => { setSection(id); setNotice(''); setError(''); }}><Icon size={17} />{label}</button>)}</nav>
      <section className="settings-panel" aria-labelledby="settings-section-title">
        <header><h2 id="settings-section-title">{title}</h2>{notice && <p role="status" className="settings-notice"><Check size={15} />{notice}</p>}{error && <p role="alert" className="form-error">{error}</p>}</header>
        {section === 'profile' && <ProfileEditor profile={profile} user={user} onSaved={onProfileSaved} />}
        {section === 'privacy' && <div className="settings-options"><p>Controla qué partes de tu cuenta pueden descubrir otros productores.</p><label className="settings-toggle"><span><strong>Perfil público</strong><small>Permite que aparezcas en el directorio y que otros vean tu perfil.</small></span><input type="checkbox" checked={profile.publicProfile} onChange={async event => { const updated = { displayName: profile.displayName, bio: profile.bio, location: profile.location, website: profile.website, instagram: profile.instagram, genres: profile.genres, coverId: profile.coverId, avatarId: profile.avatarId, publicProfile: event.target.checked }; const result = await saveProfile(updated); if (result.ok) { onProfileSaved(result.data); setNotice('Privacidad actualizada.'); } else setError(result.error.message); }} /></label><div className="settings-info"><Shield size={17} /><span>Tus publicaciones personales se guardan localmente en este dispositivo y no se muestran a otros usuarios.</span></div></div>}
        {section === 'preferences' && <div className="settings-options"><label className="settings-control"><span><Palette size={17} />Tema visual</span><select aria-label="Tema visual" value={settings.theme} onChange={event => updateSettings({ ...settings, theme: event.target.value as UserSettings['theme'] })}><option value="dark">Oscuro</option><option value="light">Claro</option><option value="custom">RGB personalizado</option></select></label>{settings.theme === 'custom' && <><fieldset className="custom-theme-colors"><legend className="sr-only">Colores del tema personalizado</legend>{([['background', 'Fondo'], ['card', 'Tarjetas'], ['button', 'Botones'], ['link', 'Enlaces']] as const).map(([key, label]) => <label key={key}><span>{label}</span><input aria-label={`Color ${label.toLocaleLowerCase()}`} type="color" value={settings.customTheme[key]} onChange={event => updateSettings({ ...settings, customTheme: { ...settings.customTheme, [key]: event.target.value } })} /><output>{toRgb(settings.customTheme[key])}</output></label>)}</fieldset><p className="settings-subtle">Elige cada color con el selector RGB. Los colores de texto y estados se ajustan automáticamente para conservar legibilidad.</p></>}<label className="settings-control"><span><Languages size={17} />{tx('settings.language')}</span><select aria-label={tx('settings.language')} value={settings.language} onChange={event => updateSettings({ ...settings, language: event.target.value as 'es' | 'en' })}><option value="es">Español</option><option value="en">English</option></select></label><p className="settings-subtle">{tx('settings.languageNote')}</p><label className="settings-control"><span><Globe2 size={17} />{tx('settings.currency')}</span><select aria-label={tx('settings.currency')} value={settings.currency} onChange={event => updateSettings({ ...settings, currency: event.target.value as UserSettings['currency'] })}><option value="USD">USD · {tx('settings.usd')}</option><option value="MXN">MXN · {tx('settings.mxn')}</option><option value="EUR">EUR · {tx('settings.eur')}</option></select></label><p className="settings-subtle">{tx('settings.currencyNote')}</p><p className="settings-subtle" role="status">{exchangeRates ? tx('settings.currencyRate', { rate: new Intl.NumberFormat(settings.language, { maximumFractionDigits: 4 }).format(exchangeRate('USD', settings.currency, exchangeRates)), currency: settings.currency, date: exchangeRates.date }) : tx('settings.currencyUnavailable')}</p><label className="settings-toggle"><span><strong>Reducir movimiento</strong><small>Reduce animaciones y transiciones de la interfaz.</small></span><input type="checkbox" checked={settings.reducedMotion} onChange={event => updateSettings({ ...settings, reducedMotion: event.target.checked })} /></label></div>}
        {section === 'notifications' && <div className="settings-options"><p>Elige qué avisos emergentes quieres recibir en esta cuenta.</p>{([['messages', 'Mensajes', 'Avisos de nuevos mensajes directos.'], ['friendRequests', 'Solicitudes de amistad', 'Avisos de nuevas solicitudes.'], ['comments', 'Comentarios', 'Cuando alguien comenta en uno de tus beats publicados.'], ['reactions', 'Reacciones', 'Cuando alguien reacciona a uno de tus beats publicados.'], ['reviews', 'Revisión de subidas', 'Avisos sobre el estado de tus beats y one-shots.']] as const).map(([key, label, description]) => <label className="settings-toggle" key={key}><span><strong>{label}</strong><small>{description}</small></span><input type="checkbox" checked={settings.notifications[key]} onChange={event => updateSettings({ ...settings, notifications: { ...settings.notifications, [key]: event.target.checked } })} /></label>)}<div className="settings-info"><Bell size={17} /><span>Los avisos sociales se generan para interacciones en tus beats publicados y respetan estas opciones.</span></div></div>}
        {section === 'account' && <div className="settings-options"><p className="settings-subtle">ID de cuenta: <code>{user.id}</code> · Rol: {user.role === 'admin' ? 'Administración' : user.role === 'community_manager' ? 'Community manager' : 'Creador'}</p><form className="settings-form" onSubmit={event => void changeEmail(event)}><h3>Correo de acceso</h3><label>Nuevo correo<input type="email" required maxLength={254} autoComplete="email" value={email} onChange={event => setEmail(event.target.value)} /></label><label>Confirma tu contraseña<input type="password" required autoComplete="current-password" value={currentPassword} onChange={event => setCurrentPassword(event.target.value)} /></label><button className="button" disabled={busy || email.trim().toLowerCase() === user.email.toLowerCase()}>Actualizar correo</button><small>En local se actualiza de inmediato. En producción se exigirá confirmación del nuevo correo.</small></form></div>}
        {section === 'security' && <div className="settings-options"><form className="settings-form" onSubmit={event => void changePassword(event)}><h3>Cambiar contraseña</h3><label>Contraseña actual<input type="password" required autoComplete="current-password" value={currentPassword} onChange={event => setCurrentPassword(event.target.value)} /></label><label>Nueva contraseña<input type="password" required minLength={12} maxLength={128} autoComplete="new-password" value={newPassword} onChange={event => setNewPassword(event.target.value)} /><small>Usa al menos 12 caracteres.</small></label><button className="button" disabled={busy || newPassword.length < 12}>Actualizar contraseña</button></form><div className="settings-info"><LockKeyhole size={17} /><span>Al cambiarla, las demás sesiones de tu cuenta se invalidan. Conservas esta sesión.</span></div><a href="#/forgot-password">¿Olvidaste tu contraseña?</a></div>}
      </section>
    </div>
  </div>;
}

export function CreatorProfilePage({ user, uploads, uploadsLoading = false, onPlay, editing = false, targetId }: {
  user?: AuthUser; uploads?: CatalogAsset[]; uploadsLoading?: boolean; onPlay: (asset: AudioAsset) => void; editing?: boolean; targetId?: string;
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
  if (editing) return user ? <SettingsCenter profile={profile} user={user} onProfileSaved={setProfile} /> : <section className="producer-message"><h1>Configuracion de perfil</h1><p>Inicia sesion para editar tu perfil.</p></section>;
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
      <div className="producer-name"><p className="eyebrow">BeatVault Creator</p><h1>{profile.displayName}</h1>{profile.packageBadges?.length ? <div className="package-badges" aria-label="Paquetes adquiridos">{profile.packageBadges.map(packageId => <span key={packageId} className={`package-badge ${packageId}`} title={`Paquete ${packageId} adquirido`}>{packageId === 'creator' ? 'Creator' : 'Studio'}</span>)}</div> : null}<div className="producer-meta">{profile.location && <span><MapPin size={14} />{profile.location}</span>}{isOwner && !profile.publicProfile && <span><LockKeyhole size={14} />Perfil privado</span>}</div></div>
      <div className="producer-profile-actions">{isOwner && <><a className="button ghost" href="#/settings"><Pencil size={16} />Editar perfil</a><button className="button ghost" aria-pressed={publicView} onClick={() => { setPublicView(value => !value); setSelected(undefined); }}>{publicView ? 'Mi vista' : 'Vista publica'}</button></>}{profile.publicProfile && <button className="button ghost" onClick={() => void share()}><Share2 size={16} />Compartir</button>}</div>
    </section>
    <div className="producer-summary"><div><p className="producer-bio">{profile.bio || 'Sin biografia'}</p><div className="producer-genres">{profile.genres.map(genre => <span key={genre}>{genre}</span>)}</div></div><div className="producer-count"><strong>{uploadsLoading ? '…' : projects.length}</strong><span>proyectos</span></div></div>
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
        {uploadsLoading ? <div className="producer-message" role="status">Cargando proyectos...</div> : filtered.length ? <div className={`producer-projects ${layout}`}>{filtered.map(asset => <article key={asset.id} className="producer-project">
          <button className="producer-project-art" onClick={() => setSelected(asset)} aria-label={`Ver proyecto ${asset.name}`}><img src={asset.cover || artwork('808')} alt="" /></button>
          <div className="producer-project-copy"><span className="eyebrow">{creatorType(asset.type)}</span><h2><button onClick={() => setSelected(asset)}>{asset.name}</button></h2><p>{asset.tags.map(tag => `#${tag.label}`).join(' ')}</p>{showPrivate && <span className={`publication-pill ${asset.publicationStatus}`}>{uploadStatusLabels[asset.publicationStatus]}</span>}</div>
          {showPrivate && <button className="producer-project-play" aria-label={`Escuchar ${asset.name}`} title={asset.previewUrl ? 'Escuchar' : 'Audio no disponible'} disabled={!asset.previewUrl} onClick={() => onPlay(asset)}><Play size={18} /></button>}
        </article>)}</div> : <div className="producer-message"><Music2 size={28} /><h2>{showPrivate ? 'Tu siguiente proyecto empieza aqui' : 'Sin proyectos publicados'}</h2>{showPrivate && <a className="button" href="#/upload"><Upload size={16} />Subir audio</a>}</div>}
      </section>}
    {selected && <dialog ref={dialog} className="producer-project-dialog" aria-labelledby="producer-detail-title" onCancel={() => setSelected(undefined)} onClose={() => setSelected(undefined)}><button className="producer-dialog-close" aria-label="Cerrar proyecto" onClick={() => setSelected(undefined)}><X size={20} /></button><img src={selected.cover || artwork('808')} alt="" /><div><span className="eyebrow">{creatorType(selected.type)}</span><h2 id="producer-detail-title">{selected.name}</h2><p>{selected.tags.map(tag => `#${tag.label}`).join(' ')}</p>{showPrivate && <><p>{selected.metadata.format} · {selected.metadata.size}</p><button className="button" disabled={!selected.previewUrl} onClick={() => onPlay(selected)}><Play size={16} />Escuchar</button><a className="button ghost" href="#/studio">Gestionar subida</a></>}</div></dialog>}
  </div>;
}
