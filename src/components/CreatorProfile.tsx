import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { ArrowLeft, AtSign, Check, Disc3, ExternalLink, Flag, Grid2X2, Heart, Image as ImageIcon, List, LockKeyhole, MapPin, MessageCircle, MessageSquareText, Music2, Pencil, Play, RotateCcw, Send, Share2, ShoppingBag, SlidersHorizontal, Trash2, Upload, Video, X } from 'lucide-react';
import type { AuthUser } from '../api/client';
import type { AudioAsset } from '../types';
import type { CatalogAsset } from '../data/localCatalog';
import { CatalogRepository } from '../data/catalogRepository';
import { creatorType, uploadCovers, uploadStatusLabels } from '../data/creatorUploads';
import { defaultAvatarFocalPoint, defaultCoverFocalPoint, emptyProfile, type CreatorProfile, type ProfileImageFocalPoint, type ProfileImageKind, type ProfileInput } from '../domains/profile';
import { readProfile, saveProfile, uploadProfileImage } from '../data/profileRepository';
import { profileCovers, profileCoverUrl } from '../data/profileArtwork';
import { readLocalHomePosts, subscribeToLocalHomePosts } from '../data/homePosts';
import '../styles/creator-profile.css';
import { authClient, getCurrencyRates, isAuthUser, isNull } from '../api/client';
import { readUserSettings, saveUserSettings, type UserSettings } from '../data/userSettings';
import { Globe2, Bell, Shield, UserRound, Palette, Languages } from 'lucide-react';
import { toRgb } from '../app/theme';
import { tx } from '../i18n';
import { exchangeRate, type ExchangeRates } from '../domains/marketplace/currency';
import { createBeatCheckout } from '../data/beatPurchases';
import { createSocialPostComment, deleteSocialPost, readProfileSocialPosts, readSocialPostInteractions, reportSocialPost, toggleSocialPostReaction, type SocialPostInteraction, type SocialPostReportReason } from '../data/socialPostRepository';

const artwork = (id: string) => uploadCovers.find(cover => cover.id === id)?.url || uploadCovers[2].url;
type CreatorPost = { id: string; kind: 'status' | 'photo' | 'video'; text: string; createdAt: string; mediaUrl?: string; mediaName?: string; localOnly?: boolean; audience?: string; visibility?: string; socialPostId?: string };
function Avatar({ profile }: { profile: CreatorProfile }) {
  const src = profile.avatarId === 'custom' ? profile.avatarUrl : profile.avatarId === 'initials' ? undefined : artwork(profile.avatarId);
  const focalPoint = profile.avatarFocalPoint || defaultAvatarFocalPoint;
  return <div className="producer-avatar">{src ? <img src={src} alt="" style={{ objectPosition: `${focalPoint.x}% ${focalPoint.y}%` }} /> : <span>{profile.displayName.trim().split(/\s+/).slice(0, 2).map(word => word[0]).join('').toUpperCase() || 'BV'}</span>}</div>;
}

function ImageCropEditor({ kind, src, focalPoint, disabled, onChange }: { kind: ProfileImageKind; src: string; focalPoint: ProfileImageFocalPoint; disabled: boolean; onChange: (point: ProfileImageFocalPoint) => void }) {
  const previewStyle = { objectPosition: `${focalPoint.x}% ${focalPoint.y}%` };
  return <fieldset className={`profile-crop-editor profile-crop-editor-${kind}`} disabled={disabled}>
    <legend>Encuadre de {kind === 'avatar' ? 'foto de perfil' : 'portada'}</legend>
    <div className="profile-crop-previews">
      {kind === 'avatar' ? <figure><div className="profile-crop-avatar"><img src={src} alt="Vista previa del avatar" style={previewStyle} /></div><figcaption>Avatar</figcaption></figure> : <>
        <figure className="profile-crop-desktop"><div><img src={src} alt="Vista previa de portada en escritorio" style={previewStyle} /></div><figcaption>Escritorio</figcaption></figure>
        <figure className="profile-crop-mobile"><div><img src={src} alt="Vista previa de portada en móvil" style={previewStyle} /></div><figcaption>Móvil</figcaption></figure>
      </>}
    </div>
    <div className="profile-crop-controls">
      {(['x', 'y'] as const).map(axis => <label key={axis}><span>{axis === 'x' ? 'Encuadre horizontal' : 'Encuadre vertical'}</span><input type="range" min="0" max="100" step="1" value={focalPoint[axis]} aria-label={`${axis === 'x' ? 'Encuadre horizontal' : 'Encuadre vertical'} ${kind === 'avatar' ? 'del avatar' : 'de la portada'}`} onChange={event => onChange({ ...focalPoint, [axis]: Number(event.currentTarget.value) })} /><output>{focalPoint[axis]}%</output></label>)}
      <button type="button" className="profile-crop-reset" title="Centrar encuadre" aria-label="Centrar encuadre" onClick={() => onChange(kind === 'avatar' ? defaultAvatarFocalPoint : defaultCoverFocalPoint)}><RotateCcw size={16} /></button>
    </div>
    <small>El recorte se adapta automáticamente al espacio y conserva el punto elegido en móvil y escritorio.</small>
  </fieldset>;
}
function ProfilePostInteractions({ postId }: { postId: string }) {
  const [interaction, setInteraction] = useState<SocialPostInteraction>({ comments: [], reactionCount: 0, reactedByMe: false });
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    void readSocialPostInteractions(postId).then(result => {
      if (!active) return;
      if (result.ok) setInteraction(result.data);
      else setError(result.error.message);
    });
    return () => { active = false; };
  }, [postId]);
  const react = async () => {
    setBusy(true); setError('');
    const result = await toggleSocialPostReaction(postId);
    if (result.ok) setInteraction(current => ({ ...current, reactedByMe: result.data.reacted, reactionCount: result.data.reactionCount }));
    else setError(result.error.message);
    setBusy(false);
  };
  const comment = async (event: FormEvent) => {
    event.preventDefault();
    const body = text.trim();
    if (!body || busy) return;
    setBusy(true); setError('');
    const result = await createSocialPostComment(postId, body);
    if (result.ok) { setInteraction(result.data); setText(''); }
    else setError(result.error.message);
    setBusy(false);
  };
  return <section className="producer-post-social" aria-label="Interacciones de la publicación">
    <div className="producer-post-social-actions"><button type="button" className={interaction.reactedByMe ? 'is-active' : ''} aria-pressed={interaction.reactedByMe} disabled={busy} onClick={() => void react()}><Heart size={16} fill={interaction.reactedByMe ? 'currentColor' : 'none'} />Me gusta · {interaction.reactionCount}</button><span><MessageCircle size={16} />{interaction.comments.length} comentarios</span></div>
    {interaction.comments.slice(-3).map(item => <p className="producer-post-social-comment" key={item.id}><strong>{item.authorName}</strong><span>{item.body}</span></p>)}
    <form onSubmit={event => void comment(event)}><label className="sr-only" htmlFor={`profile-comment-${postId}`}>Escribe un comentario</label><input id={`profile-comment-${postId}`} maxLength={500} value={text} onChange={event => setText(event.target.value)} placeholder="Escribe un comentario..." /><button type="submit" aria-label="Publicar comentario" disabled={busy || !text.trim()}><Send size={15} /></button></form>
    {error && <p className="producer-post-social-error" role="alert">{error}</p>}
  </section>;
}
function ProfileEditor({ profile, onSaved }: { profile: CreatorProfile; onSaved: (profile: CreatorProfile) => void }) {
  const initial: ProfileInput = useMemo(() => ({ displayName: profile.displayName, bio: profile.bio, location: profile.location, website: profile.website, instagram: profile.instagram, genres: profile.genres, coverId: profile.coverId, avatarId: profile.avatarId, avatarFocalPoint: profile.avatarFocalPoint || defaultAvatarFocalPoint, coverFocalPoint: profile.coverFocalPoint || defaultCoverFocalPoint, publicProfile: profile.publicProfile }), [profile]);
  const [draft, setDraft] = useState<ProfileInput>(initial);
  const [genres, setGenres] = useState(initial.genres.join(', '));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [savedMessage, setSavedMessage] = useState('');
  const [avatarFile, setAvatarFile] = useState<File>();
  const [coverFile, setCoverFile] = useState<File>();
  const [avatarPreview, setAvatarPreview] = useState('');
  const [coverPreview, setCoverPreview] = useState('');
  const [imageBusy, setImageBusy] = useState<'' | 'avatar' | 'cover'>('');
  const dirty = JSON.stringify(draft) !== JSON.stringify(initial);
  const hasUnsavedChanges = dirty || Boolean(avatarFile || coverFile);
  const profileChecklist = [
    { label: 'Foto de perfil', complete: draft.avatarId !== 'initials' },
    { label: 'Biografía', complete: Boolean(draft.bio.trim()) },
    { label: 'Géneros', complete: draft.genres.length > 0 },
    { label: 'Ubicación', complete: Boolean(draft.location.trim()) },
    { label: 'Enlace externo', complete: Boolean(draft.website.trim() || draft.instagram.trim()) },
  ];
  const completedProfileItems = profileChecklist.filter(item => item.complete).length;
  useEffect(() => {
    setDraft(initial);
    setGenres(initial.genres.join(', '));
  }, [initial]);
  useEffect(() => { if (dirty) setSavedMessage(''); }, [dirty]);
  useEffect(() => () => { if (avatarPreview) URL.revokeObjectURL(avatarPreview); if (coverPreview) URL.revokeObjectURL(coverPreview); }, [avatarPreview, coverPreview]);
  useEffect(() => {
    if (!hasUnsavedChanges) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [hasUnsavedChanges]);
  const cancel = () => { if (!hasUnsavedChanges || window.confirm('Descartar los cambios del perfil?')) window.location.hash = '#/profile'; };
  const save = async (event: React.FormEvent) => {
    event.preventDefault(); if (busy) return;
    setBusy(true); setError('');
    try {
      const result = await saveProfile(draft);
      if (result.ok) { onSaved(result.data); setSavedMessage('Perfil actualizado.'); }
      else setError(result.error.message);
    } finally { setBusy(false); }
  };
  const chooseImage = (kind: 'avatar' | 'cover', file?: File) => {
    if (!file) return;
    if (!['image/jpeg', 'image/png'].includes(file.type) || file.size > 8 * 1024 * 1024) { setError('Elige un archivo JPG o PNG de hasta 8 MB.'); return; }
    setError(''); setSavedMessage('');
    const preview = URL.createObjectURL(file);
    if (kind === 'avatar') { if (avatarPreview) URL.revokeObjectURL(avatarPreview); setAvatarFile(file); setAvatarPreview(preview); }
    else { if (coverPreview) URL.revokeObjectURL(coverPreview); setCoverFile(file); setCoverPreview(preview); }
  };
  const uploadImage = async (kind: 'avatar' | 'cover') => {
    const file = kind === 'avatar' ? avatarFile : coverFile;
    if (!file || imageBusy) return;
    setImageBusy(kind); setError(''); setSavedMessage('');
    const focalPoint = kind === 'avatar' ? draft.avatarFocalPoint || defaultAvatarFocalPoint : draft.coverFocalPoint || defaultCoverFocalPoint;
    const result = await uploadProfileImage(kind, file, focalPoint);
    setImageBusy('');
    if (!result.ok) { setError(result.error.message); return; }
    onSaved(result.data);
    setDraft(current => ({ ...current, ...(kind === 'avatar' ? { avatarId: 'custom' as const, avatarFocalPoint: focalPoint } : { coverId: 'custom' as const, coverFocalPoint: focalPoint }) }));
    if (kind === 'avatar') { setAvatarFile(undefined); setAvatarPreview(''); }
    else { setCoverFile(undefined); setCoverPreview(''); }
    setSavedMessage(kind === 'avatar' ? 'Foto de perfil guardada.' : 'Portada guardada.');
  };
  const avatarCropSrc = avatarPreview || (draft.avatarId === 'custom' ? profile.avatarUrl : undefined);
  const coverCropSrc = coverPreview || (draft.coverId === 'custom' ? profile.coverUrl : undefined);
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
            <button type="button" className="producer-initials-option" aria-label="Avatar con iniciales" aria-pressed={draft.avatarId === 'initials'} onClick={() => { setAvatarFile(undefined); setAvatarPreview(''); setDraft({ ...draft, avatarId: 'initials', avatarFocalPoint: defaultAvatarFocalPoint }); }}>Aa</button>
            {uploadCovers.map(cover => <button key={cover.id} type="button" aria-label={`Avatar ${cover.name}`} aria-pressed={draft.avatarId === cover.id} onClick={() => { setAvatarFile(undefined); setAvatarPreview(''); setDraft({ ...draft, avatarId: cover.id, avatarFocalPoint: defaultAvatarFocalPoint }); }}><img src={cover.url} alt="" /></button>)}
          </fieldset><div className="profile-image-upload"><label>Subir foto de perfil<input aria-label="Subir foto de perfil" type="file" accept="image/jpeg,image/png" onChange={event => chooseImage('avatar', event.currentTarget.files?.[0])} /><small>JPG o PNG, minimo 256 x 256 px, maximo 8 MB.</small></label><button type="button" className="button ghost" disabled={!avatarFile || Boolean(imageBusy)} onClick={() => void uploadImage('avatar')}><Upload size={15} />{imageBusy === 'avatar' ? 'Procesando...' : 'Guardar foto'}</button></div>
          {avatarCropSrc && <ImageCropEditor kind="avatar" src={avatarCropSrc} focalPoint={draft.avatarFocalPoint || defaultAvatarFocalPoint} disabled={Boolean(imageBusy)} onChange={avatarFocalPoint => setDraft(current => ({ ...current, avatarFocalPoint }))} />}
          <fieldset className="producer-image-picker producer-cover-picker"><legend>Portada</legend>{profileCovers.map(cover => <button type="button" key={cover.id} aria-label={`Portada ${cover.name}`} aria-pressed={draft.coverId === cover.id} onClick={() => { setCoverFile(undefined); setCoverPreview(''); setDraft({ ...draft, coverId: cover.id, coverFocalPoint: defaultCoverFocalPoint }); }}><img src={cover.url} alt="" /></button>)}</fieldset>
          <div className="profile-image-upload"><label>Subir portada personalizada<input aria-label="Subir portada personalizada" type="file" accept="image/jpeg,image/png" onChange={event => chooseImage('cover', event.currentTarget.files?.[0])} /><small>JPG o PNG, minimo 256 x 256 px, maximo 8 MB. Se adapta al espacio de portada.</small></label><button type="button" className="button ghost" disabled={!coverFile || Boolean(imageBusy)} onClick={() => void uploadImage('cover')}><Upload size={15} />{imageBusy === 'cover' ? 'Procesando...' : 'Guardar portada'}</button></div>
          {coverCropSrc && <ImageCropEditor kind="cover" src={coverCropSrc} focalPoint={draft.coverFocalPoint || defaultCoverFocalPoint} disabled={Boolean(imageBusy)} onChange={coverFocalPoint => setDraft(current => ({ ...current, coverFocalPoint }))} />}</section>
          <section><h2>Enlaces</h2><div className="producer-form-grid"><label>Sitio web<input type="url" maxLength={200} placeholder="https://" value={draft.website} onChange={e => setDraft({ ...draft, website: e.target.value })} /></label><label>Instagram<input maxLength={31} placeholder="@usuario" value={draft.instagram} onChange={e => setDraft({ ...draft, instagram: e.target.value })} /></label></div></section>
          <section><h2>Visibilidad</h2><label className="producer-visibility"><input type="checkbox" checked={draft.publicProfile} onChange={e => setDraft({ ...draft, publicProfile: e.target.checked })} />Perfil publico</label></section>
          {error && <p role="alert" className="form-error">{error}</p>}
          {savedMessage && <p role="status" aria-live="polite" className="settings-notice"><Check size={15} />{savedMessage}</p>}
          <div className="producer-save"><button type="button" className="button ghost" onClick={cancel}>Cancelar</button><button className="button" disabled={!draft.displayName.trim() || !dirty}><Check size={16} />{busy ? 'Guardando...' : 'Guardar cambios'}</button></div>
        </fieldset>
      </form>
      <aside className="producer-settings-preview" aria-label="Vista previa del perfil">
        <div className="producer-preview-heading"><p className="eyebrow">Vista previa en vivo</p><span className={`producer-preview-visibility ${draft.publicProfile ? 'is-public' : 'is-private'}`}>{draft.publicProfile ? <Globe2 size={14} /> : <LockKeyhole size={14} />}{draft.publicProfile ? 'Público' : 'Privado'}</span></div>
        <div className="producer-preview-card">
          <img className="producer-preview-cover" src={coverPreview || (draft.coverId === 'custom' ? profile.coverUrl || profileCoverUrl(profile.coverId as 'lo-fi') : profileCoverUrl(draft.coverId))} alt="" style={{ objectPosition: `${(draft.coverFocalPoint || defaultCoverFocalPoint).x}% ${(draft.coverFocalPoint || defaultCoverFocalPoint).y}%` }} />
          <div className="producer-preview-body">
            <div className="producer-preview-identity"><Avatar profile={{ ...draft, accountId: profile.accountId, avatarUrl: avatarPreview || (draft.avatarId === 'custom' ? profile.avatarUrl : undefined) }} /><div><h2>{draft.displayName || 'Tu nombre'}</h2>{draft.location && <span><MapPin size={13} />{draft.location}</span>}</div></div>
            <p className="producer-preview-bio">{draft.bio || 'Tu biografía aparecerá aquí.'}</p>
            {draft.genres.length > 0 && <div className="producer-preview-genres" aria-label="Géneros del perfil">{draft.genres.map(genre => <span key={genre}>{genre}</span>)}</div>}
            {(draft.website || draft.instagram) && <div className="producer-preview-links">{draft.website && <span><ExternalLink size={13} />{draft.website}</span>}{draft.instagram && <span><AtSign size={13} />{draft.instagram.replace(/^@/, '')}</span>}</div>}
          </div>
        </div>
        <section className="profile-completion" aria-label="Completitud del perfil">
          <div className="profile-completion-heading"><strong>Datos del perfil</strong><span className="profile-completion-count">{completedProfileItems}/{profileChecklist.length}</span></div>
          <progress max={profileChecklist.length} value={completedProfileItems} aria-label={`${completedProfileItems} de ${profileChecklist.length} datos del perfil completos`} />
          <ul>{profileChecklist.map(item => <li key={item.label} className={item.complete ? 'is-complete' : ''}><span aria-hidden="true">{item.complete ? <Check size={13} /> : '•'}</span>{item.label}</li>)}</ul>
        </section>
      </aside>
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
        {section === 'profile' && <ProfileEditor profile={profile} onSaved={onProfileSaved} />}
        {section === 'privacy' && <div className="settings-options"><p>Controla qué partes de tu cuenta pueden descubrir otros productores.</p><label className="settings-toggle"><span><strong>Perfil público</strong><small>Permite que aparezcas en el directorio y que otros vean tu perfil.</small></span><input type="checkbox" checked={profile.publicProfile} onChange={async event => { const updated = { displayName: profile.displayName, bio: profile.bio, location: profile.location, website: profile.website, instagram: profile.instagram, genres: profile.genres, coverId: profile.coverId, avatarId: profile.avatarId, avatarFocalPoint: profile.avatarFocalPoint, coverFocalPoint: profile.coverFocalPoint, publicProfile: event.target.checked }; const result = await saveProfile(updated); if (result.ok) { onProfileSaved(result.data); setNotice('Privacidad actualizada.'); } else setError(result.error.message); }} /></label><div className="settings-info"><Shield size={17} /><span>Tus publicaciones personales se guardan localmente en este dispositivo y no se muestran a otros usuarios.</span></div></div>}
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
  const [saleBeats, setSaleBeats] = useState<CatalogAsset[]>([]);
  const [saleLoading, setSaleLoading] = useState(false);
  const [saleError, setSaleError] = useState('');
  const [activeOffer, setActiveOffer] = useState<string>();
  const [purchaseError, setPurchaseError] = useState('');
  const checkoutKeys = useRef(new Map<string, string>());
  const [publicView, setPublicView] = useState(Boolean(targetId));
  const [tab, setTab] = useState(user && (!targetId || targetId === user.id) ? 'posts' : 'projects');
  const [profilePosts, setProfilePosts] = useState<CreatorPost[]>([]);
  const [postsLoading, setPostsLoading] = useState(false);
  const [postsPageBusy, setPostsPageBusy] = useState(false);
  const [postsCursor, setPostsCursor] = useState<string>();
  const [postsError, setPostsError] = useState('');
  const [postsNotice, setPostsNotice] = useState('');
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
    if (!profile?.publicProfile) { setSaleBeats([]); setSaleError(''); setSaleLoading(false); return; }
    let cancelled = false;
    setSaleLoading(true);
    void new CatalogRepository(undefined, 'public').marketplacePage({ type: 'beat', creatorId: profile.accountId, limit: 48 }).then(result => {
      if (cancelled) return;
      setSaleBeats(result.assets.filter(asset => asset.ownerId === profile.accountId && asset.publicationStatus === 'published' && Boolean(asset.purchaseOffers?.length)));
      setSaleError(result.error || '');
    }).finally(() => { if (!cancelled) setSaleLoading(false); });
    return () => { cancelled = true; };
  }, [profile?.accountId, profile?.publicProfile]);
  useEffect(() => {
    if (!profile) { setProfilePosts([]); return; }
    let cancelled = false;
    const loadPosts = async () => {
      setPostsLoading(true); setPostsError('');
      const remoteResult = await readProfileSocialPosts(profile.accountId);
      if (cancelled) return;
      if (!remoteResult.ok) { setPostsError(remoteResult.error.message); setProfilePosts([]); }
      setPostsCursor(remoteResult.ok ? remoteResult.data.nextCursor : undefined);
      const remote: CreatorPost[] = remoteResult.ok ? remoteResult.data.posts.map(post => ({ id: post.id, socialPostId: post.id, kind: post.kind, text: post.body, createdAt: post.createdAt, mediaUrl: post.media?.url, audience: post.audience, visibility: post.visibility })) : [];
      let local: CreatorPost[] = [];
      if (user?.id === profile.accountId) {
        try {
          const posts = await readLocalHomePosts(profile.accountId);
          if (cancelled) return;
          postUrls.current.forEach(url => URL.revokeObjectURL(url)); postUrls.current = [];
          local = posts.map(post => {
            const base = { id: `local-${post.id}`, kind: post.kind, text: post.text, createdAt: post.createdAt, mediaName: post.mediaName, localOnly: true } as const;
            if (!post.media) return base;
            const mediaUrl = URL.createObjectURL(post.media); postUrls.current.push(mediaUrl);
            return { ...base, mediaUrl };
          });
        } catch { setPostsError(current => current || 'No se pudieron cargar las publicaciones guardadas en este equipo.'); }
      }
      setProfilePosts([...remote, ...local].sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
      setPostsLoading(false);
    };
    void loadPosts();
    const unsubscribe = user?.id === profile.accountId ? subscribeToLocalHomePosts(profile.accountId, () => void loadPosts()) : () => undefined;
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
  const isPrivateFriend = !isOwner && !profile.publicProfile;
  const activeTab = isPrivateFriend ? 'posts' : tab;
  const showPrivate = isOwner && !publicView;
  const displayedPosts = isOwner && publicView
    ? profilePosts.filter(post => !post.localOnly && post.audience === 'public' && post.visibility === 'published')
    : profilePosts;
  const projects = (uploads || remoteUploads).filter(asset => asset.ownerId === profile.accountId && creatorType(asset.type) && (showPrivate ? asset.publicationStatus !== 'archived' : asset.publicationStatus === 'published'));
  const filtered = projects.filter(asset => type === 'all' || creatorType(asset.type) === type);
  const share = async () => {
    try { await navigator.clipboard.writeText(`${window.location.origin}${window.location.pathname}#/profile?id=${encodeURIComponent(profile.accountId)}`); setShareMessage('Enlace copiado'); }
    catch { setShareMessage('No se pudo copiar el enlace'); }
  };
  const buyOffer = async (contentId: string, offerId: string) => {
    const key = `${contentId}:${offerId}`;
    const idempotencyKey = checkoutKeys.current.get(key) || window.crypto.randomUUID();
    checkoutKeys.current.set(key, idempotencyKey);
    setActiveOffer(key); setPurchaseError('');
    const result = await createBeatCheckout(contentId, offerId, idempotencyKey);
    if (result.ok) { checkoutKeys.current.delete(key); window.location.assign(result.data.url); }
    else {
      if (result.error.code !== 'NETWORK_ERROR' && result.error.code !== 'TIMEOUT') checkoutKeys.current.delete(key);
      setPurchaseError(result.error.message);
    }
    setActiveOffer(undefined);
  };
  const loadMoreProfilePosts = async () => {
    if (!profile || !postsCursor || postsPageBusy) return;
    setPostsPageBusy(true);
    const result = await readProfileSocialPosts(profile.accountId, 30, postsCursor);
    if (result.ok) {
      const additional: CreatorPost[] = result.data.posts.map(post => ({ id: post.id, socialPostId: post.id, kind: post.kind, text: post.body, createdAt: post.createdAt, mediaUrl: post.media?.url, audience: post.audience, visibility: post.visibility }));
      setProfilePosts(current => {
        const merged = new Map(current.map(post => [post.id, post]));
        additional.forEach(post => merged.set(post.id, post));
        return [...merged.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      });
      setPostsCursor(result.data.nextCursor);
    } else setPostsError(result.error.message);
    setPostsPageBusy(false);
  };
  return <div className="producer-profile">
    <div className="producer-banner"><img src={profile.coverId === 'custom' ? profile.coverUrl || profileCovers[2].url : profileCoverUrl(profile.coverId)} alt="Portada del perfil" style={{ objectPosition: `${(profile.coverFocalPoint || defaultCoverFocalPoint).x}% ${(profile.coverFocalPoint || defaultCoverFocalPoint).y}%` }} />{isOwner && <a className="producer-cover-edit" href="#/settings" title="Editar portada" aria-label="Editar portada"><Pencil size={18} /></a>}</div>
    <section className="producer-identity-band">
      <Avatar profile={profile} />
      <div className="producer-name"><p className="eyebrow">BeatVault Creator</p><h1>{profile.displayName}</h1>{profile.packageBadges?.length ? <div className="package-badges" aria-label="Paquetes adquiridos">{profile.packageBadges.map(packageId => <span key={packageId} className={`package-badge ${packageId}`} title={`Paquete ${packageId} adquirido`}>{packageId === 'creator' ? 'Creator' : 'Studio'}</span>)}</div> : null}<div className="producer-meta">{profile.location && <span><MapPin size={14} />{profile.location}</span>}{isOwner && !profile.publicProfile && <span><LockKeyhole size={14} />Perfil privado</span>}</div></div>
      <div className="producer-profile-actions">{isOwner && <><a className="button ghost" href="#/settings"><Pencil size={16} />Editar perfil</a><button className="button ghost" aria-pressed={publicView} onClick={() => { setPublicView(value => !value); setSelected(undefined); }}>{publicView ? 'Mi vista' : 'Vista publica'}</button></>}{profile.publicProfile && <button className="button ghost" onClick={() => void share()}><Share2 size={16} />Compartir</button>}</div>
    </section>
    <div className="producer-summary"><div><p className="producer-bio">{profile.bio || 'Sin biografia'}</p><div className="producer-genres">{profile.genres.map(genre => <span key={genre}>{genre}</span>)}</div></div>{!isPrivateFriend && <div className="producer-count"><strong>{uploadsLoading ? '…' : projects.length}</strong><span>proyectos</span></div>}</div>
    {shareMessage && <p role="status">{shareMessage}</p>}{error && <p role="alert" className="form-error">{error}</p>}
    <div className="producer-tabs" role="tablist" aria-label="Contenido del perfil">{(isPrivateFriend ? [['posts', 'Publicaciones']] : [...(isOwner || profile.publicProfile ? [['posts', 'Publicaciones']] : []), ['projects', 'Proyectos'], ['sale', 'En venta'], ['about', 'Acerca de']]).map(([value, name]) => <button id={`profile-tab-${value}`} role="tab" key={value} aria-selected={activeTab === value} aria-controls={`profile-panel-${value}`} onClick={() => setTab(value)}>{value === 'posts' ? <MessageSquareText size={17} /> : value === 'projects' ? <Disc3 size={17} /> : value === 'sale' ? <ShoppingBag size={17} /> : <Music2 size={17} />}{name}</button>)}</div>
    {activeTab === 'about' ? <section id="profile-panel-about" role="tabpanel" aria-labelledby="profile-tab-about" className="producer-about"><h2>Acerca de {profile.displayName}</h2><p>{profile.bio || 'Sin biografia'}</p>{profile.location && <p><MapPin size={16} />{profile.location}</p>}<div className="producer-links">{profile.website && <a href={profile.website} target="_blank" rel="noopener noreferrer"><ExternalLink size={16} />Sitio web</a>}{profile.instagram && <a href={`https://www.instagram.com/${encodeURIComponent(profile.instagram)}/`} target="_blank" rel="noopener noreferrer"><AtSign size={16} />@{profile.instagram}</a>}</div></section> : activeTab === 'sale' ? <section id="profile-panel-sale" role="tabpanel" aria-labelledby="profile-tab-sale" className="producer-sale">
      {purchaseError && <p className="form-error" role="alert">{purchaseError}</p>}
      {saleError && <p className="form-error" role="alert">No se pudieron cargar las ofertas aprobadas. {saleError}</p>}
      {saleLoading ? <div className="producer-message" role="status">Cargando beats en venta...</div> : saleBeats.length ? <div className="producer-sale-grid">{saleBeats.map(beat => <article className="producer-sale-card" key={beat.id}>
        <img src={beat.cover || artwork('808')} alt={`Artwork de ${beat.name}`} loading="lazy" decoding="async" />
        <div className="producer-sale-copy"><h2>{beat.name}</h2><p>{beat.tags.map(tag => `#${tag.label}`).join(' ')}</p>
          {beat.purchaseOffers?.map(offer => <div className="producer-sale-option" key={offer.id}>
            <button className="button producer-sale-offer" type="button" disabled={Boolean(activeOffer)} onClick={() => void buyOffer(beat.id, offer.id)}><ShoppingBag size={15} />{activeOffer === `${beat.id}:${offer.id}` ? 'Abriendo pago...' : `${offer.label} · ${new Intl.NumberFormat('es-MX', { style: 'currency', currency: offer.currency }).format(offer.amountMinor / 100)}`}</button>
            <p className="producer-sale-terms"><strong>{offer.deliverables.map(item => item.toUpperCase()).join(' + ')}</strong> · {offer.usageSummary}</p>
          </div>)}
        </div>
      </article>)}</div> : <div className="producer-message"><ShoppingBag size={27} /><h2>{isOwner ? 'Aún no tienes beats aprobados en venta' : 'Este creador aún no tiene beats en venta'}</h2>{isOwner && <p>Solo aparecerán beats publicados con oferta aprobada y pagos habilitados.</p>}</div>}
    </section> : activeTab === 'posts' && (isOwner || profile.publicProfile || isPrivateFriend) ? <section id="profile-panel-posts" role="tabpanel" aria-labelledby="profile-tab-posts" className="producer-posts">
        <div className="producer-posts-heading"><h2>{isOwner ? 'Tus publicaciones' : `Publicaciones de ${profile.displayName}`}</h2>{isOwner && <a className="button ghost" href="#/home">Crear publicacion</a>}</div>
        {postsNotice && <p className="settings-notice" role="status">{postsNotice}</p>}{postsError && <p className="form-error" role="alert">{postsError}</p>}
        {postsLoading ? <div className="producer-message" role="status">Cargando publicaciones…</div> : null}
        {!postsLoading && displayedPosts.length ? displayedPosts.map(post => <article className="producer-post" key={post.id}>
          <div className="producer-post-meta"><span>{post.kind === 'photo' ? <ImageIcon size={15} /> : post.kind === 'video' ? <Video size={15} /> : <MessageSquareText size={15} />}{post.kind === 'photo' ? 'Foto' : post.kind === 'video' ? 'Video' : 'Estado'}{post.localOnly && <em className="producer-local-post-label">Solo este equipo</em>}{post.audience && <em>{post.audience === 'private' ? 'Solo yo' : post.audience === 'friends' ? 'Amigos' : 'Público'}</em>}{post.visibility === 'pending-review' && <em className="producer-pending-post-label">Pendiente de revisión</em>}</span><time dateTime={post.createdAt}>{new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(post.createdAt))}</time></div>
          {post.text && <p className="producer-post-text">{post.text}</p>}
          {post.mediaUrl && (post.kind === 'video' ? <video controls preload="metadata" src={post.mediaUrl} aria-label={post.mediaName || 'Video publicado'} /> : <img src={post.mediaUrl} alt={post.mediaName || 'Imagen publicada'} />)}
          {user && post.socialPostId && <ProfilePostInteractions postId={post.socialPostId} />}
          <div className="producer-post-controls">{isOwner && post.socialPostId && <button type="button" className="button ghost" onClick={async () => { if (!window.confirm('¿Eliminar esta publicación? Esta acción no se puede deshacer.')) return; const result = await deleteSocialPost(post.socialPostId!); if (result.ok) setProfilePosts(current => current.filter(item => item.socialPostId !== post.socialPostId)); else setPostsError(result.error.message); }}><Trash2 size={15} />Eliminar</button>}{!isOwner && post.socialPostId && <button type="button" className="button ghost" onClick={async () => { const details = window.prompt('Describe brevemente por qué reportas esta publicación (opcional).'); if (details === null) return; const value = window.prompt('Motivo: spam, harassment, copyright, nudity, violence u other', 'other') || 'other'; const reasons: SocialPostReportReason[] = ['spam', 'harassment', 'copyright', 'nudity', 'violence', 'other']; const reason = reasons.includes(value as SocialPostReportReason) ? value as SocialPostReportReason : 'other'; const result = await reportSocialPost(post.socialPostId!, reason, details); setPostsNotice(result.ok ? 'Reporte enviado al equipo de moderación.' : 'No se pudo enviar el reporte: ' + result.error.message); }}><Flag size={15} />Reportar</button>}</div>
        </article>) : !postsLoading ? <div className="producer-message"><MessageSquareText size={26} /><h2>{isOwner ? 'Aun no tienes publicaciones' : 'Aún no hay publicaciones públicas'}</h2>{isOwner && <><p>Las publicaciones locales se conservan en este equipo y no se transfieren automáticamente.</p><a className="button" href="#/home">Ir a Inicio</a></>}</div> : null}
        {postsCursor && <button type="button" className="button ghost producer-posts-more" disabled={postsPageBusy} onClick={() => void loadMoreProfilePosts()}>{postsPageBusy ? 'Cargando…' : 'Cargar más publicaciones'}</button>}
    </section> :
      <section id="profile-panel-projects" role="tabpanel" aria-labelledby="profile-tab-projects">
        <div className="producer-project-toolbar"><div className="filter-chips" aria-label="Tipo de proyecto">{['all', 'Beat', 'One-shot'].map(value => <button key={value} className={type === value ? 'active' : ''} aria-pressed={type === value} onClick={() => setType(value)}>{value === 'all' ? 'Todos' : value === 'Beat' ? 'Beats' : 'One-shots'}</button>)}</div><div className="producer-layout-controls"><button aria-label="Vista cuadricula" title="Cuadricula" aria-pressed={layout === 'grid'} onClick={() => setLayout('grid')}><Grid2X2 size={18} /></button><button aria-label="Vista lista" title="Lista" aria-pressed={layout === 'list'} onClick={() => setLayout('list')}><List size={18} /></button>{showPrivate && <a href="#/studio" aria-label="Gestionar mis subidas" title="Gestionar mis subidas"><SlidersHorizontal size={18} /></a>}</div></div>
        {uploadsLoading ? <div className="producer-message" role="status">Cargando proyectos...</div> : filtered.length ? <div className={`producer-projects ${layout}`}>{filtered.map(asset => <article key={asset.id} className="producer-project">
          <button className="producer-project-art" onClick={() => setSelected(asset)} aria-label={`Ver proyecto ${asset.name}`}><img src={asset.cover || artwork('808')} alt="" loading="lazy" decoding="async" /></button>
          <div className="producer-project-copy"><span className="eyebrow">{creatorType(asset.type)}</span><h2><button onClick={() => setSelected(asset)}>{asset.name}</button></h2><p>{asset.tags.map(tag => `#${tag.label}`).join(' ')}</p>{showPrivate && <span className={`publication-pill ${asset.publicationStatus}`}>{uploadStatusLabels[asset.publicationStatus]}</span>}</div>
          {showPrivate && <button className="producer-project-play" aria-label={`Escuchar ${asset.name}`} title={asset.previewUrl ? 'Escuchar' : 'Audio no disponible'} disabled={!asset.previewUrl} onClick={() => onPlay(asset)}><Play size={18} /></button>}
        </article>)}</div> : <div className="producer-message"><Music2 size={28} /><h2>{showPrivate ? 'Tu siguiente proyecto empieza aqui' : 'Sin proyectos publicados'}</h2>{showPrivate && <a className="button" href="#/upload"><Upload size={16} />Subir audio</a>}</div>}
      </section>}
    {selected && <dialog ref={dialog} className="producer-project-dialog" aria-labelledby="producer-detail-title" onCancel={() => setSelected(undefined)} onClose={() => setSelected(undefined)}><button className="producer-dialog-close" aria-label="Cerrar proyecto" onClick={() => setSelected(undefined)}><X size={20} /></button><img src={selected.cover || artwork('808')} alt="" /><div><span className="eyebrow">{creatorType(selected.type)}</span><h2 id="producer-detail-title">{selected.name}</h2><p>{selected.tags.map(tag => `#${tag.label}`).join(' ')}</p>{showPrivate && <><p>{selected.metadata.format} · {selected.metadata.size}</p><button className="button" disabled={!selected.previewUrl} onClick={() => onPlay(selected)}><Play size={16} />Escuchar</button><a className="button ghost" href="#/studio">Gestionar subida</a></>}</div></dialog>}
  </div>;
}
