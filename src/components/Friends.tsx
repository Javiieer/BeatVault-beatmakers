import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Check, Clock3, Search, UserMinus, UserPlus, Users, X } from 'lucide-react';
import type { FriendDirectoryEntry, FriendOverview } from '../domains/friends';
import { acceptFriendRequest, readFriendOverview, removeFriend, removeFriendRequest, searchCreators, sendFriendRequest } from '../data/friendRepository';
import { uploadCovers } from '../data/creatorUploads';
import '../styles/friends.css';

type View = 'discover' | 'requests' | 'friends';
const initials = (name: string) => name.trim().split(/\s+/).slice(0, 2).map(word => word[0]).join('').toUpperCase() || 'BV';
function CreatorAvatar({ profile }: { profile: FriendDirectoryEntry }) {
  const image = profile.avatarId === 'initials' ? undefined : uploadCovers.find(cover => cover.id === profile.avatarId)?.url;
  return <span className="friends-avatar">{image ? <img src={image} alt="" /> : initials(profile.displayName)}</span>;
}

export function Friends({ userId }: { userId?: string }) {
  const [view, setView] = useState<View>('discover');
  const [query, setQuery] = useState('');
  const [creators, setCreators] = useState<FriendDirectoryEntry[]>([]);
  const [overview, setOverview] = useState<FriendOverview>({ friends: [], incoming: [], outgoing: [] });
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [offline, setOffline] = useState(false);

  const handleApiError = useCallback((message: string, code: string) => {
    setError(message);
    setOffline(code === 'NETWORK_ERROR' || code === 'TIMEOUT');
  }, []);

  const refresh = useCallback(async () => {
    const result = await readFriendOverview();
    if (!result.ok) { handleApiError(result.error.message, result.error.code); return false; }
    setOverview(result.data);
    setOffline(false);
    return true;
  }, [handleApiError]);
  const search = useCallback(async (term: string) => {
    const result = await searchCreators(term);
    if (!result.ok) { handleApiError(result.error.message, result.error.code); return; }
    setCreators(result.data);
    setOffline(false);
  }, [handleApiError]);

  const load = useCallback(async (isActive?: () => boolean) => {
    setLoading(true); setError('');
    const [friendsResult, creatorsResult] = await Promise.all([readFriendOverview(), searchCreators('')]);
    if (isActive && !isActive()) return;
    if (friendsResult.ok) setOverview(friendsResult.data); else handleApiError(friendsResult.error.message, friendsResult.error.code);
    if (creatorsResult.ok) { setCreators(creatorsResult.data); setOffline(false); }
    else handleApiError(creatorsResult.error.message, creatorsResult.error.code);
    setLoading(false);
  }, [handleApiError]);

  useEffect(() => {
    let cancelled = false;
    void load(() => !cancelled);
    return () => { cancelled = true; };
  }, [load, userId]);

  const submitSearch = async (event: FormEvent) => {
    event.preventDefault(); setError('');
    await search(query.trim());
  };
  const run = async (id: string, action: () => Promise<{ ok: boolean; error?: { message: string } }>, message: string) => {
    if (busyId) return;
    setBusyId(id); setError(''); setNotice('');
    const result = await action();
    if (!result.ok) setError(result.error?.message || 'No se pudo completar la acción.');
    else { await refresh(); await search(query.trim()); setNotice(message); }
    setBusyId('');
  };

  const relationshipStatus = (id: string) => {
    if (overview.friends.some(friend => friend.profile.accountId === id)) return 'friend';
    if (overview.outgoing.some(request => request.recipientId === id)) return 'outgoing';
    if (overview.incoming.some(request => request.requesterId === id)) return 'incoming';
    return 'none';
  };

  return <main className="friends-page">
    <header className="friends-heading"><div><p className="eyebrow">Comunidad de productores</p><h1>Amigos</h1><p>Encuentra creadores y conecta para compartir ideas y colaborar.</p></div><a className="button ghost" href="#/profile"><Users size={16} />Mi perfil</a></header>
    <div className="friends-tabs" role="tablist" aria-label="Secciones de amigos">
      {([['discover', 'Descubrir', creators.length], ['requests', 'Solicitudes', overview.incoming.length], ['friends', 'Mis amigos', overview.friends.length]] as const).map(([key, label, count]) => <button key={key} role="tab" aria-selected={view === key} onClick={() => setView(key)}>{label}<span>{count}</span></button>)}
    </div>
    {error && !offline && <p className="friends-alert" role="alert">{error}</p>}{notice && <p className="friends-notice" role="status">{notice}</p>}
    {loading ? <p className="friends-empty" role="status">Cargando comunidad...</p> : offline ? <section className="friends-unavailable" role="status"><Users size={27} /><div><h2>Conecta con BeatVault local</h2><p>{error || 'No se pudo cargar la comunidad.'} Comprueba que el servidor local esté iniciado.</p></div><button className="button ghost" onClick={() => void load()}>Reintentar</button></section> : view === 'discover' ? <section role="tabpanel" className="friends-content">
      <form className="friends-search" onSubmit={event => void submitSearch(event)}><Search size={18} /><input aria-label="Buscar creadores" value={query} onChange={event => setQuery(event.target.value)} maxLength={80} placeholder="Nombre, género o estilo" /><button className="button" type="submit">Buscar</button></form>
      <p className="friends-privacy">Solo aparecen perfiles con visibilidad pública activada. Las solicitudes se guardan en esta cuenta local.</p>
      <div className="creator-directory">{creators.length ? creators.map(profile => {
        const status = relationshipStatus(profile.accountId);
        const request = overview.incoming.find(item => item.requesterId === profile.accountId);
        return <article className="creator-card" key={profile.accountId}><CreatorAvatar profile={profile} /><div className="creator-card-copy"><a href={`#/profile?id=${encodeURIComponent(profile.accountId)}`}>{profile.displayName}</a><p>{profile.bio || 'Productor en BeatVault'}</p>{profile.genres.length > 0 && <span>{profile.genres.slice(0, 3).join(' · ')}</span>}</div>
          {status === 'none' ? <button className="button" disabled={Boolean(busyId)} onClick={() => void run(profile.accountId, () => sendFriendRequest(profile.accountId), 'Solicitud enviada.')}><UserPlus size={16} />Añadir</button> : status === 'outgoing' ? <button className="button ghost" disabled={Boolean(busyId)} onClick={() => { const item = overview.outgoing.find(entry => entry.recipientId === profile.accountId); if (item) void run(item.id, () => removeFriendRequest(item.id), 'Solicitud cancelada.'); }}><Clock3 size={16} />Pendiente</button> : status === 'incoming' && request ? <button className="button" disabled={Boolean(busyId)} onClick={() => void run(request.id, () => acceptFriendRequest(request.id), 'Ya son amigos.')}><Check size={16} />Aceptar</button> : <span className="friend-connected"><Check size={16} />Amigos</span>}
        </article>;
      }) : <div className="friends-empty"><Users size={28} /><h2>No encontramos creadores</h2><p>Prueba con otro nombre o género. Los perfiles deben estar configurados como públicos.</p></div>}</div>
    </section> : view === 'requests' ? <section role="tabpanel" className="friends-content">
      <h2>Solicitudes recibidas</h2>{overview.incoming.length ? <div className="creator-directory">{overview.incoming.map(request => <article className="creator-card" key={request.id}><CreatorAvatar profile={request.profile} /><div className="creator-card-copy"><a href={`#/profile?id=${encodeURIComponent(request.profile.accountId)}`}>{request.profile.displayName}</a><p>{request.profile.bio || 'Quiere conectar contigo.'}</p></div><div className="creator-card-actions"><button className="button" disabled={Boolean(busyId)} aria-label={`Aceptar solicitud de ${request.profile.displayName}`} onClick={() => void run(request.id, () => acceptFriendRequest(request.id), 'Solicitud aceptada.')}><Check size={16} />Aceptar</button><button className="icon-button" title="Rechazar solicitud" aria-label={`Rechazar solicitud de ${request.profile.displayName}`} disabled={Boolean(busyId)} onClick={() => void run(request.id, () => removeFriendRequest(request.id), 'Solicitud rechazada.')}><X size={18} /></button></div></article>)}</div> : <p className="friends-empty">No tienes solicitudes recibidas.</p>}
      <h2 className="friends-subheading">Solicitudes enviadas</h2>{overview.outgoing.length ? <div className="creator-directory">{overview.outgoing.map(request => <article className="creator-card" key={request.id}><CreatorAvatar profile={request.profile} /><div className="creator-card-copy"><a href={`#/profile?id=${encodeURIComponent(request.profile.accountId)}`}>{request.profile.displayName}</a><p>Esperando respuesta</p></div><button className="button ghost" disabled={Boolean(busyId)} onClick={() => void run(request.id, () => removeFriendRequest(request.id), 'Solicitud cancelada.')}><X size={16} />Cancelar</button></article>)}</div> : <p className="friends-empty compact">No tienes solicitudes enviadas.</p>}
    </section> : <section role="tabpanel" className="friends-content"><h2>Mis amigos</h2>{overview.friends.length ? <div className="creator-directory">{overview.friends.map(friend => <article className="creator-card" key={friend.id}><CreatorAvatar profile={friend.profile} /><div className="creator-card-copy"><a href={`#/profile?id=${encodeURIComponent(friend.profile.accountId)}`}>{friend.profile.displayName}</a><p>{friend.profile.bio || friend.profile.genres.join(' · ') || 'Creador de BeatVault'}</p></div><button className="icon-button" title="Eliminar amigo" aria-label={`Eliminar a ${friend.profile.displayName} de amigos`} disabled={Boolean(busyId)} onClick={() => void run(friend.id, () => removeFriend(friend.id), 'Conexión eliminada.')}><UserMinus size={18} /></button></article>)}</div> : <p className="friends-empty">Tu lista está vacía. Descubre creadores para empezar.</p>}</section>}
  </main>;
}
