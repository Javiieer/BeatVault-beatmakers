import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { ArrowLeft, Check, CheckCheck, MessageCircle, Search, Send, Users } from 'lucide-react';
import { apiUrl } from '../api/client';
import { readFriendOverview } from '../data/friendRepository';
import { markChatRead, readChatConversations, readChatMessages, readChatPresence, sendChatMessage, type ChatConversationView } from '../data/chatRepository';
import type { DirectMessage } from '../domains/chat';
import type { FriendDirectoryEntry } from '../domains/friends';
import { uploadCovers } from '../data/creatorUploads';
import '../styles/chat.css';

type Contact = { profile: FriendDirectoryEntry; conversation?: ChatConversationView };
const initials = (name: string) => name.trim().split(/\s+/).slice(0, 2).map(part => part[0]).join('').toUpperCase() || 'BV';
const avatarFor = (id: string) => uploadCovers.find(cover => cover.id === id)?.url;
const timeLabel = (value: string) => new Intl.DateTimeFormat('es-MX', { hour: '2-digit', minute: '2-digit' }).format(new Date(value));
const dayLabel = (value: string) => new Intl.DateTimeFormat('es-MX', { day: 'numeric', month: 'short' }).format(new Date(value));

function Avatar({ profile, className = '', online = false }: { profile: FriendDirectoryEntry; className?: string; online?: boolean }) {
  const image = avatarFor(profile.avatarId);
  return <span className={`chat-avatar ${className}`} title={`${profile.displayName}: ${online ? 'En línea' : 'Desconectado'}`}>{image ? <img src={image} alt="" /> : initials(profile.displayName)}<i className={online ? 'is-online' : 'is-offline'} /></span>;
}

export function Chat({ userId, initialPeerId }: { userId?: string; initialPeerId?: string }) {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(initialPeerId || null);
  const [messages, setMessages] = useState<DirectMessage[]>([]);
  const [query, setQuery] = useState('');
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [connection, setConnection] = useState<'connecting' | 'connected' | 'offline'>('connecting');
  const [onlineIds, setOnlineIds] = useState<Set<string>>(() => new Set());
  const [liveNotice, setLiveNotice] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const contactsRef = useRef(contacts);
  const selectedIdRef = useRef(selectedId);
  useEffect(() => { contactsRef.current = contacts; }, [contacts]);
  useEffect(() => { selectedIdRef.current = selectedId; }, [selectedId]);
  const selected = contacts.find(contact => contact.profile.accountId === selectedId);

  useEffect(() => { if (initialPeerId) setSelectedId(initialPeerId); }, [initialPeerId]);

  const loadInbox = useCallback(async () => {
    const [friends, conversations, presence] = await Promise.all([readFriendOverview(), readChatConversations(), readChatPresence()]);
    if (!friends.ok) { setError(friends.error.message); return; }
    if (!conversations.ok) { setError(conversations.error.message); return; }
    const byPeer = new Map(conversations.data.map(conversation => [conversation.peerId, conversation]));
    const items = friends.data.friends.map(friend => ({ profile: friend.profile, conversation: byPeer.get(friend.profile.accountId) }));
    items.sort((a, b) => {
      const aTime = a.conversation?.lastMessage.createdAt || '';
      const bTime = b.conversation?.lastMessage.createdAt || '';
      return bTime.localeCompare(aTime) || a.profile.displayName.localeCompare(b.profile.displayName);
    });
    setContacts(items);
    setOnlineIds(new Set(presence.ok ? presence.data.onlineIds : []));
    setError('');
  }, []);

  const loadThread = useCallback(async (peerId: string, isCurrent: () => boolean = () => true) => {
    const result = await readChatMessages(peerId);
    if (!result.ok) { if (isCurrent()) setError(result.error.message); return false; }
    const receipt = await markChatRead(peerId);
    if (!isCurrent()) return false;
    setMessages(result.data.map(message => receipt.ok && message.senderId === peerId && !message.readAt ? { ...message, readAt: receipt.data.readAt } : message));
    if (!receipt.ok) setError(receipt.error.message);
    return receipt.ok;
  }, []);

  useEffect(() => {
    let active = true;
    setLoading(true);
    void loadInbox().finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [loadInbox, userId]);

  useEffect(() => {
    if (!userId) return;
    const stream = new EventSource(apiUrl('/api/chat/events'), { withCredentials: true });
    stream.onopen = () => {
      setConnection('connected');
      void loadInbox();
      const peerId = selectedIdRef.current;
      if (peerId) void loadThread(peerId);
    };
    stream.onerror = () => setConnection('offline');
    stream.onmessage = event => {
      let payload: unknown;
      try { payload = JSON.parse(event.data); } catch { return; }
      if (!payload || typeof payload !== 'object') return;
      const value = payload as { type?: unknown; peerId?: unknown; online?: unknown };
      if (value.type === 'presence' && typeof value.peerId === 'string' && typeof value.online === 'boolean') {
        setOnlineIds(current => {
          const next = new Set(current);
          if (value.online) next.add(value.peerId as string); else next.delete(value.peerId as string);
          return next;
        });
        return;
      }
      if ((value.type !== 'message' && value.type !== 'read') || typeof value.peerId !== 'string') return;
      void loadInbox();
      if (value.peerId === selectedIdRef.current) { void loadThread(value.peerId); void loadInbox(); }
      if (value.type === 'message' && value.peerId !== selectedIdRef.current) {
        const contact = contactsRef.current.find(item => item.profile.accountId === value.peerId);
        setLiveNotice(`Nuevo mensaje de ${contact?.profile.displayName || 'un amigo'}`);
        window.setTimeout(() => setLiveNotice(''), 3000);
      }
    };
    return () => stream.close();
  }, [loadInbox, loadThread, userId]);

  useEffect(() => {
    if (!selectedId) { setMessages([]); return; }
    let active = true;
    setMessages([]);
    void loadThread(selectedId, () => active).then(loaded => { if (active && loaded) { setError(''); void loadInbox(); } });
    return () => { active = false; };
  }, [loadInbox, loadThread, selectedId]);

  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' }); }, [messages, selectedId]);

  const visibleContacts = useMemo(() => contacts.filter(contact => `${contact.profile.displayName} ${contact.profile.genres.join(' ')}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())), [contacts, query]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const body = draft.trim();
    if (!selectedId || !body || sending) return;
    setSending(true);
    const result = await sendChatMessage(selectedId, body);
    if (result.ok) {
      setMessages(current => current.some(message => message.id === result.data.id) ? current : [...current, result.data]);
      setDraft('');
      void loadInbox();
    } else setError(result.error.message);
    setSending(false);
  };

  if (!userId) return <main className="chat-page"><section className="chat-auth-required"><MessageCircle size={28} /><h1>Inicia sesión para chatear</h1><p>Los mensajes privados están disponibles para tu cuenta.</p><a className="button" href="#/home">Ir al inicio</a></section></main>;

  return <main className="chat-page">
    <header className="chat-page-heading"><div><p className="eyebrow">BEATVAULT · MENSAJES</p><h1>Chat</h1><p>Continúa la conversación con tus amigos productores.</p></div><span className={`chat-connection is-${connection}`}><i />{connection === 'connected' ? 'En línea' : connection === 'offline' ? 'Reconectando' : 'Conectando'}</span></header>
    <section className={`chat-inbox${selectedId ? ' has-selection' : ''}`} aria-label="Mensajes directos">
      <aside className="chat-list-panel">
        <div className="chat-list-heading"><div><h2>Chats</h2><span>{contacts.length} {contacts.length === 1 ? 'amigo' : 'amigos'}</span></div><a href="#/friends" aria-label="Buscar amigos" title="Buscar amigos"><Users size={18} /></a></div>
        <label className="chat-search"><Search size={16} /><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Buscar en chats" aria-label="Buscar conversaciones" /></label>
        {error && <div className="chat-error" role="alert"><span>{error}</span><button type="button" onClick={() => void loadInbox()}>Reintentar</button></div>}
        <nav className="chat-contact-list" aria-label="Conversaciones">
          {loading ? <p className="chat-list-state">Cargando conversaciones...</p> : visibleContacts.length ? visibleContacts.map(contact => {
            const last = contact.conversation?.lastMessage;
            const isMine = last?.senderId === userId;
            return <button type="button" key={contact.profile.accountId} className={`chat-contact${selectedId === contact.profile.accountId ? ' selected' : ''}`} onClick={() => setSelectedId(contact.profile.accountId)} aria-current={selectedId === contact.profile.accountId ? 'true' : undefined}>
              <Avatar profile={contact.profile} online={onlineIds.has(contact.profile.accountId)} />
              <span className="chat-contact-copy"><strong>{contact.profile.displayName}</strong><small>{last ? `${isMine ? 'Tú: ' : ''}${last.body}` : 'Inicia una conversación'}</small></span>
              <span className="chat-contact-meta">{last && <time>{dayLabel(last.createdAt)}</time>}{Boolean(contact.conversation?.unreadCount) && <i>{contact.conversation!.unreadCount > 9 ? '9+' : contact.conversation!.unreadCount}</i>}</span>
            </button>;
          }) : <div className="chat-list-state"><Users size={25} /><strong>{contacts.length ? 'Sin resultados' : 'Aún no tienes chats'}</strong><span>{contacts.length ? 'Prueba con otro nombre.' : 'Añade amigos para comenzar a conversar.'}</span>{!contacts.length && <a className="button ghost" href="#/friends">Ver amigos</a>}</div>}
        </nav>
      </aside>
      <section className="chat-thread" aria-label={selected ? `Conversación con ${selected.profile.displayName}` : 'Conversación'}>
        {!selected ? <div className="chat-empty-thread"><span><MessageCircle size={27} /></span><h2>Tu espacio para colaborar</h2><p>Elige un amigo y conversen sobre ideas, beats y proyectos.</p></div> : <>
          <header className="chat-thread-header"><button type="button" className="chat-back" aria-label="Volver a conversaciones" onClick={() => setSelectedId(null)}><ArrowLeft size={19} /></button><Avatar profile={selected.profile} online={onlineIds.has(selected.profile.accountId)} /><span><strong>{selected.profile.displayName}</strong><small>{onlineIds.has(selected.profile.accountId) ? 'En línea' : selected.profile.genres.join(' · ') || 'Desconectado'}</small></span><a href={`#/profile?id=${encodeURIComponent(selected.profile.accountId)}`} className="chat-profile-link">Ver perfil</a></header>
          <div className="chat-message-list" ref={scrollRef} aria-live="polite">
            {!messages.length ? <p className="chat-start-hint">Saluda a {selected.profile.displayName} y empieza la conversación.</p> : messages.map(message => {
              const mine = message.senderId === userId;
              return <div className={`chat-message-row${mine ? ' mine' : ''}`} key={message.id}><div className="chat-bubble"><p>{message.body}</p><small><time dateTime={message.createdAt}>{timeLabel(message.createdAt)}</time>{mine && (message.readAt ? <CheckCheck size={14} aria-label="Leído" /> : <Check size={14} aria-label="Enviado" />)}</small></div></div>;
            })}
          </div>
          {liveNotice && <p className="chat-live-notice" role="status">{liveNotice}</p>}
          <form className="chat-compose" onSubmit={submit}><label className="sr-only" htmlFor="chat-message">Escribe un mensaje</label><textarea id="chat-message" value={draft} onChange={event => setDraft(event.target.value)} maxLength={2000} rows={1} placeholder={`Escribe a ${selected.profile.displayName}...`} onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); } }} /><button type="submit" aria-label="Enviar mensaje" disabled={!draft.trim() || sending}>{sending ? <span className="chat-send-spinner" /> : <Send size={18} />}</button></form>
        </>}
      </section>
    </section>
  </main>;
}
