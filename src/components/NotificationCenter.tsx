import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Bell, Check, Disc3, Heart, MessageCircle, UserRoundPlus, X } from "lucide-react";
import { apiUrl } from "../api/client";
import { readChatConversations, type ChatConversationView } from "../data/chatRepository";
import { readFriendOverview } from "../data/friendRepository";
import { scopedKey } from "../data/storageScope";
import type { FriendOverview } from "../domains/friends";
import { defaultUserSettings, readUserSettings } from "../data/userSettings";
import { CatalogRepository } from "../data/catalogRepository";
import { readSocialNotifications } from "../data/socialRepository";
import { markNotificationRead, readNotifications, type PersistentNotification } from "../data/notificationRepository";
import type { SocialActivity } from "../domains/social";

function mergeNotifications(incoming: PersistentNotification[], current: PersistentNotification[]) {
  const seen = new Set<string>();
  const merged: PersistentNotification[] = [];
  for (const item of [...incoming, ...current]) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    merged.push(item);
  }
  return merged;
}

function appendNotifications(current: PersistentNotification[], incoming: PersistentNotification[]) {
  const knownIds = new Set(current.map(item => item.id));
  const appended: PersistentNotification[] = [];
  for (const item of incoming) {
    if (knownIds.has(item.id)) continue;
    knownIds.add(item.id);
    appended.push(item);
  }
  return [...current, ...appended];
}

function persistentNotificationView(item: PersistentNotification) {
  switch (item.type) {
    case "social_post_comment": return { icon: <MessageCircle size={17} />, iconClass: "notification-icon-message", tagClass: "notification-tag-message", tag: "Comentario", text: `${item.actor.displayName} comentó en una de tus publicaciones.`, href: `#/home?post=${encodeURIComponent(item.resource.id)}` };
    case "social_post_reaction": return { icon: <Heart size={17} fill="currentColor" />, iconClass: "notification-icon-reaction", tagClass: "notification-tag-reaction", tag: "Reacción", text: `${item.actor.displayName} reaccionó a una publicación tuya.`, href: `#/home?post=${encodeURIComponent(item.resource.id)}` };
    case "friend_request": return { icon: <UserRoundPlus size={17} />, iconClass: "notification-icon-request", tagClass: "notification-tag-request", tag: "Solicitud", text: `${item.actor.displayName} te envió una solicitud de amistad.`, href: "#/friends" };
    case "friend_request_accepted": return { icon: <UserRoundPlus size={17} />, iconClass: "notification-icon-request", tagClass: "notification-tag-request", tag: "Amistad", text: `${item.actor.displayName} aceptó tu solicitud de amistad.`, href: "#/friends" };
    default: return { icon: <Bell size={17} />, iconClass: "", tagClass: "", tag: "Actividad", text: "Tienes una nueva notificación.", href: "#/home" };
  }
}

function notificationEnabled(item: PersistentNotification, settings: Pick<typeof defaultUserSettings.notifications, "friendRequests" | "comments" | "reactions">) {
  if (item.type === "social_post_comment") return settings.comments;
  if (item.type === "social_post_reaction") return settings.reactions;
  if (item.type === "friend_request" || item.type === "friend_request_accepted") return settings.friendRequests;
  return true;
}

function notificationToast(item: PersistentNotification) {
  const view = persistentNotificationView(item);
  return view.text;
}

function readSeen(scope: string): string[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(scopedKey("beatvault:notifications-seen", scope)) || "[]");
    return Array.isArray(value) ? value.filter((id): id is string => typeof id === "string") : [];
  } catch { return []; }
}

function readReviewEvents(scope: string): Array<{ id: string; name: string; status: "published" | "rejected"; createdAt: string }> {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(scopedKey("beatvault:review-notifications", scope)) || "[]");
    return Array.isArray(value) ? value.filter((item): item is { id: string; name: string; status: "published" | "rejected"; createdAt: string } =>
      !!item && typeof item === "object" && typeof item.id === "string" && typeof item.name === "string" && (item.status === "published" || item.status === "rejected") && typeof item.createdAt === "string").slice(0, 30) : [];
  } catch { return []; }
}

export function NotificationCenter({ userId }: { userId?: string }) {
  const scope = userId || "demo";
  const catalogRepository = useMemo(() => new CatalogRepository(undefined, scope), [scope]);
  const [open, setOpen] = useState(false);
  const [overview, setOverview] = useState<FriendOverview>();
  const [conversations, setConversations] = useState<ChatConversationView[]>([]);
  const [seen, setSeen] = useState(() => readSeen(scope));
  const [toast, setToast] = useState("");
  const [settingsRevision, setSettingsRevision] = useState(0);
  const [settings, setSettings] = useState(() => userId ? readUserSettings(userId).notifications : defaultUserSettings.notifications);
  const [loading, setLoading] = useState(Boolean(userId));
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<"all" | "social" | "beats">("all");
  const [reviewEvents, setReviewEvents] = useState(() => readReviewEvents(scope));
  const [socialEvents, setSocialEvents] = useState<SocialActivity[]>([]);
  const [persistentEvents, setPersistentEvents] = useState<PersistentNotification[]>([]);
  const [persistentUnreadCount, setPersistentUnreadCount] = useState(0);
  const [persistentCursor, setPersistentCursor] = useState<string>();
  const [persistentLoading, setPersistentLoading] = useState(Boolean(userId));
  const [loadingMore, setLoadingMore] = useState(false);
  const [persistentError, setPersistentError] = useState("");
  const [reviewScope, setReviewScope] = useState(scope);
  const knownRequestIds = useRef(new Set<string>());
  const knownMessageIds = useRef(new Set<string>());
  const hasLoadedRequests = useRef(false);
  const hasLoadedMessages = useRef(false);
  const knownReviewStatuses = useRef(new Map<string, string>());
  const hasLoadedReviews = useRef(false);
  const knownSocialIds = useRef(new Set<string>());
  const hasLoadedSocial = useRef(false);
  const knownPersistentIds = useRef(new Set<string>());
  const hasLoadedPersistent = useRef(false);
  const markingPersistentIds = useRef(new Set<string>());

  const markPersistentRead = useCallback(async (items: PersistentNotification[]) => {
    if (!userId) return;
    const unreadItems = items.filter(item => !item.readAt && !markingPersistentIds.current.has(item.id));
    const results = await Promise.all(unreadItems.map(async item => {
      markingPersistentIds.current.add(item.id);
      try {
        const result = await markNotificationRead(item.id);
        if (!result.ok) return undefined;
        const data = result.data;
        const readAt = data && typeof data === "object" && "readAt" in data && typeof data.readAt === "string" ? data.readAt : new Date().toISOString();
        return { id: item.id, readAt };
      } catch { return undefined; }
      finally { markingPersistentIds.current.delete(item.id); }
    }));
    const marked = results.filter((item): item is { id: string; readAt: string } => Boolean(item));
    if (!marked.length) return;
    const readAtById = new Map(marked.map(item => [item.id, item.readAt]));
    setPersistentEvents(current => current.map(item => readAtById.has(item.id) ? { ...item, readAt: readAtById.get(item.id)! } : item));
    setPersistentUnreadCount(current => Math.max(0, current - marked.length));
  }, [userId]);

  useEffect(() => {
    const refreshSettings = (event: Event) => {
      const detail = (event as CustomEvent<{ userId?: string }>).detail;
      if (detail?.userId === userId) setSettingsRevision(value => value + 1);
    };
    window.addEventListener('beatvault:settings-changed', refreshSettings);
    return () => window.removeEventListener('beatvault:settings-changed', refreshSettings);
  }, [userId]);

  useEffect(() => {
    const next = userId ? readUserSettings(userId).notifications : defaultUserSettings.notifications;
    setSettings(current => current.messages === next.messages && current.friendRequests === next.friendRequests && current.comments === next.comments && current.reactions === next.reactions && current.reviews === next.reviews ? current : next);
  }, [userId, settingsRevision]);

  useEffect(() => {
    let live = true;
    if (!userId) {
      setOverview(undefined); setConversations([]); setError(""); setLoading(false);
      setPersistentEvents([]); setPersistentUnreadCount(0); setPersistentCursor(undefined); setPersistentError(""); setPersistentLoading(false);
      return () => { live = false; };
    }
    setLoading(true);
    setPersistentLoading(true);
    setPersistentEvents([]);
    setPersistentUnreadCount(0);
    setPersistentCursor(undefined);
    setPersistentError("");
    knownRequestIds.current = new Set();
    knownMessageIds.current = new Set();
    hasLoadedRequests.current = false;
    hasLoadedMessages.current = false;
    hasLoadedReviews.current = false;
    hasLoadedSocial.current = false;
    knownSocialIds.current = new Set();
    hasLoadedPersistent.current = false;
    knownPersistentIds.current = new Set();
    knownReviewStatuses.current.clear();
    let persistentRequestInFlight = false;
    const refreshPersistent = async () => {
      if (persistentRequestInFlight) return;
      persistentRequestInFlight = true;
      try {
        const result = await readNotifications({ limit: 25 });
        if (!live) return;
        setPersistentLoading(false);
        if (!result.ok) { setPersistentError(result.error.message); return; }
        setPersistentError("");
        setPersistentUnreadCount(result.data.unreadCount);
        setPersistentCursor(result.data.nextCursor);
        setPersistentEvents(current => mergeNotifications(result.data.items, current));
        if (hasLoadedPersistent.current) {
          const fresh = result.data.items.find(item => !knownPersistentIds.current.has(item.id) && notificationEnabled(item, settings));
          if (fresh) setToast(notificationToast(fresh));
        }
        for (const item of result.data.items) knownPersistentIds.current.add(item.id);
        hasLoadedPersistent.current = true;
      } catch {
        if (live) setPersistentError("No se pudo conectar con la bandeja de notificaciones.");
      } finally {
        persistentRequestInFlight = false;
        if (live) setPersistentLoading(false);
      }
    };
    const refresh = async () => {
      if (!userId) return;
      const [result, messages, catalog, social] = await Promise.all([readFriendOverview(), readChatConversations(), catalogRepository.list(), readSocialNotifications()]);
      if (!live) return;
      setLoading(false);
      if (!result.ok && !messages.ok) { setError(result.error.message); return; }
      setError("");
      const incoming = result.ok ? result.data.incoming : [];
      if (hasLoadedRequests.current && settings.friendRequests) {
        const newRequest = incoming.find(item => !knownRequestIds.current.has(item.id));
        if (newRequest) setToast(`${newRequest.profile.displayName} te envio una solicitud de amistad`);
      }
      if (result.ok) {
        knownRequestIds.current = new Set(incoming.map(item => item.id));
        hasLoadedRequests.current = true;
        setOverview(result.data);
      }
      if (messages.ok) {
        const unread = messages.data.filter(item => item.unreadCount > 0 && item.lastMessage.senderId !== userId);
        if (hasLoadedMessages.current && settings.messages) {
          const fresh = unread.find(item => !knownMessageIds.current.has(item.lastMessage.id));
          if (fresh) setToast(`Nuevo mensaje de ${fresh.profile.displayName}`);
        }
        knownMessageIds.current = new Set(messages.data.map(item => item.lastMessage.id));
        hasLoadedMessages.current = true;
        setConversations(messages.data);
      }
      if (social.ok) {
        const enabledEvents = social.data.filter(item => item.type === 'comment' ? settings.comments : settings.reactions);
        if (hasLoadedSocial.current) {
          const fresh = enabledEvents.find(item => !knownSocialIds.current.has(item.id));
          if (fresh) setToast(fresh.type === 'comment' ? `${fresh.actorName} comentó en "${fresh.contentTitle}".` : `${fresh.actorName} reaccionó a "${fresh.contentTitle}".`);
        }
        knownSocialIds.current = new Set(social.data.map(item => item.id));
        hasLoadedSocial.current = true;
        setSocialEvents(social.data);
      }
      const ownCatalog = catalog.assets.filter(asset => asset.ownerId === userId);
      const reviewStatuses = new Map(ownCatalog.map(asset => [asset.id, asset.publicationStatus]));
      if (hasLoadedReviews.current && settings.reviews) {
        const updated = ownCatalog.filter(asset => {
          const before = knownReviewStatuses.current.get(asset.id);
          return before === 'pending-review' && (asset.publicationStatus === 'published' || asset.publicationStatus === 'rejected');
        });
        if (updated.length) {
          const createdAt = new Date().toISOString();
          setReviewEvents(current => [...updated.map(asset => ({ id: `review:${asset.id}:${asset.publicationStatus}:${createdAt}`, name: asset.name, status: asset.publicationStatus as "published" | "rejected", createdAt })), ...current].slice(0, 30));
          const asset = updated[0];
          setToast(asset.publicationStatus === 'published' ? `Tu subida "${asset.name}" fue aprobada.` : `Tu subida "${asset.name}" necesita cambios.`);
        }
      }
      knownReviewStatuses.current = reviewStatuses;
      hasLoadedReviews.current = true;
    };
    void refresh();
    void refreshPersistent();
    const timer = window.setInterval(() => void refresh(), 30000);
    const stream = new EventSource(apiUrl('/api/chat/events'), { withCredentials: true });
    stream.onopen = () => { void refresh(); void refreshPersistent(); };
    stream.onmessage = event => {
      let payload: unknown;
      try { payload = JSON.parse(event.data); } catch { return; }
      if (!payload || typeof payload !== "object") return;
      const type = (payload as { type?: unknown }).type;
      if (type === "message" || type === "activity") void refresh();
      if (type === "notification") void refreshPersistent();
    };
    stream.addEventListener("notification", () => void refreshPersistent());
    return () => { live = false; window.clearInterval(timer); stream.close(); };
  }, [userId, catalogRepository, settings, settingsRevision]);

  useEffect(() => { try { localStorage.setItem(scopedKey("beatvault:notifications-seen", scope), JSON.stringify(seen)); } catch { /* Notifications remain usable without storage. */ } }, [scope, seen]);
  useEffect(() => {
    if (reviewScope !== scope) return;
    try { localStorage.setItem(scopedKey("beatvault:review-notifications", scope), JSON.stringify(reviewEvents)); } catch { /* Keep notifications available for this session. */ }
  }, [scope, reviewEvents, reviewScope]);
  useEffect(() => { setSeen(readSeen(scope)); setReviewEvents(readReviewEvents(scope)); setReviewScope(scope); }, [scope]);
  useEffect(() => { if (!toast) return; const timer = window.setTimeout(() => setToast(""), 5000); return () => window.clearTimeout(timer); }, [toast]);

  const incoming = settings.friendRequests ? overview?.incoming || [] : [];
  const visiblePersistentEvents = persistentEvents.filter(item => notificationEnabled(item, settings));
  const persistentFriendshipIds = new Set(visiblePersistentEvents.filter(item => item.type === "friend_request").map(item => item.resource.id));
  const visibleIncoming = incoming.filter(item => !persistentFriendshipIds.has(item.id));
  const unreadRequests = visibleIncoming.filter(item => !seen.includes(item.id)).length;
  const unreadConversations = settings.messages ? conversations.filter(item => item.unreadCount > 0 && item.lastMessage.senderId !== userId).length : 0;
  const visibleReviews = settings.reviews ? reviewEvents : [];
  const visibleSocialEvents = socialEvents.filter(item => item.type === 'comment' ? settings.comments : settings.reactions);
  const allPersistentTypesEnabled = settings.friendRequests && settings.comments && settings.reactions;
  const unreadPersistent = allPersistentTypesEnabled ? persistentUnreadCount : visiblePersistentEvents.filter(item => !item.readAt).length;
  const unread = unreadRequests + unreadConversations + visibleReviews.filter(item => !seen.includes(item.id)).length + visibleSocialEvents.filter(item => !seen.includes(item.id)).length + unreadPersistent;
  const socialCount = visibleIncoming.length + conversations.filter(item => item.unreadCount > 0 && item.lastMessage.senderId !== userId).length + visibleSocialEvents.length + visiblePersistentEvents.length;
  const allCount = socialCount + visibleReviews.length;
  const noNotifications = allCount === 0;
  const isVisible = (category: "social" | "beats") => filter === "all" || filter === category;
  const loadMoreNotifications = async () => {
    if (!userId || !persistentCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const result = await readNotifications({ limit: 25, cursor: persistentCursor });
      if (result.ok) {
        setPersistentEvents(current => appendNotifications(current, result.data.items));
        setPersistentCursor(result.data.nextCursor);
        setPersistentUnreadCount(result.data.unreadCount);
        setPersistentError("");
        for (const item of result.data.items) knownPersistentIds.current.add(item.id);
      } else setPersistentError(result.error.message);
    } catch { setPersistentError("No se pudo cargar más actividad."); }
    finally { setLoadingMore(false); }
  };

  useEffect(() => { if (open) void markPersistentRead(visiblePersistentEvents); }, [open, visiblePersistentEvents, markPersistentRead]);
  return <div className="notification-center">
      <button type="button" className="icon-button notification-trigger" aria-label={`Notificaciones${unread ? `, ${unread} sin leer` : ""}`} aria-expanded={open} onClick={() => { const next = !open; setOpen(next); if (next) { setSeen(current => [...new Set([...current, ...visibleIncoming.map(item => item.id), ...visibleReviews.map(item => item.id), ...visibleSocialEvents.map(item => item.id)])]); void markPersistentRead(visiblePersistentEvents); } }}>
      <Bell size={18} strokeWidth={1.8} aria-hidden="true" /><span className="notification-trigger-label">Notificaciones</span>{unread > 0 && <span className="notification-badge">{unread > 9 ? "9+" : unread}</span>}
    </button>
    {open && <section className="notification-panel" aria-label="Notificaciones" aria-busy={loading}>
      <header><h2>Notificaciones</h2><button className="icon-button" type="button" aria-label="Cerrar notificaciones" onClick={() => setOpen(false)}><X size={17} /></button></header>
      {userId && <nav className="notification-filters" aria-label="Filtrar notificaciones">{([ ["all", "Todo", allCount], ["social", "Social", socialCount], ["beats", "Beats", visibleReviews.length] ] as const).map(([key, label, count]) => <button type="button" key={key} className={filter === key ? "active" : ""} aria-pressed={filter === key} onClick={() => setFilter(key)}>{label}<span>{count}</span></button>)}</nav>}
      <div className="notification-list">
      {!userId && <div className="notification-empty-state"><Bell size={22} /><strong>Notificaciones de BeatVault</strong><p>Inicia sesión para recibir mensajes y solicitudes.</p></div>}
      {userId && loading && <p className="notification-empty" role="status">Cargando notificaciones…</p>}
      {userId && !loading && error && <div className="notification-empty-state"><Bell size={22} /><strong>No se pudieron cargar</strong><p>Revisa tu conexión e inténtalo de nuevo.</p><button type="button" className="notification-retry" onClick={() => setSettingsRevision(value => value + 1)}>Reintentar</button></div>}
      {userId && !loading && !error && !noNotifications && filter === "beats" && visibleReviews.length === 0 && <div className="notification-empty-state"><Disc3 size={22} /><strong>Sin novedades de beats</strong><p>Las revisiones de tus subidas aparecerán aquí.</p></div>}
      {userId && !loading && !error && !noNotifications && filter === "social" && socialCount === 0 && <div className="notification-empty-state"><MessageCircle size={22} /><strong>Sin actividad social</strong><p>Los mensajes y solicitudes aparecerán aquí.</p></div>}
      {userId && !loading && !error && noNotifications && <div className="notification-empty-state"><Check size={22} /><strong>Estás al día</strong><p>Cuando haya actividad nueva, aparecerá en esta bandeja.</p></div>}
      {!loading && isVisible("social") && visibleIncoming.map(item => <a href="#/friends" className="notification-item" key={item.id} onClick={() => setOpen(false)}>
        <span className="notification-icon notification-icon-request"><UserRoundPlus size={17} /></span><span><strong>{item.profile.displayName}</strong><small>Te envió una solicitud de amistad</small><em className="notification-tag notification-tag-request">Solicitud</em></span>{!seen.includes(item.id) && <i aria-label="No leída" />}
      </a>)}
      {!loading && isVisible("social") && settings.messages && conversations.filter(item => item.unreadCount > 0 && item.lastMessage.senderId !== userId).map(item => <a href={`#/chat?peer=${encodeURIComponent(item.peerId)}`} className="notification-item" key={item.lastMessage.id} onClick={() => setOpen(false)}>
        <span className="notification-icon notification-icon-message"><MessageCircle size={17} /></span><span><strong>{item.profile.displayName}</strong><small>{item.lastMessage.body}</small><em className="notification-tag notification-tag-message">Mensaje · {item.unreadCount}</em></span><i aria-label={`${item.unreadCount} mensajes sin leer`} />
      </a>)}
      {!loading && isVisible("social") && visibleSocialEvents.map(item => <a href={`#/home?post=${encodeURIComponent(item.contentId)}`} className="notification-item" key={item.id} onClick={() => setOpen(false)}>
        <span className={`notification-icon ${item.type === "comment" ? "notification-icon-message" : "notification-icon-reaction"}`}>{item.type === "comment" ? <MessageCircle size={17} /> : <Heart size={17} fill="currentColor" />}</span><span><strong>{item.actorName}</strong><small>{item.type === "comment" ? `Comentó: “${item.body || ""}” en ${item.contentTitle}` : `Reaccionó a ${item.contentTitle}`}</small><em className={`notification-tag ${item.type === "comment" ? "notification-tag-message" : "notification-tag-reaction"}`}>{item.type === "comment" ? "Comentario" : "Reacción"}</em></span>{!seen.includes(item.id) && <i aria-label="No leída" />}
      </a>)}
      {!persistentLoading && isVisible("social") && visiblePersistentEvents.map(item => {
        const view = persistentNotificationView(item);
        return <a href={view.href} className="notification-item" key={`persistent:${item.id}`} onClick={() => { void markPersistentRead([item]); setOpen(false); }}>
          <span className={`notification-icon ${view.iconClass}`}>{view.icon}</span><span><strong>{item.actor.displayName}</strong><small>{view.text}</small><em className={`notification-tag ${view.tagClass}`}>{view.tag}</em></span>{!item.readAt && <i aria-label="No leída" />}
        </a>;
      })}
      {!loading && isVisible("beats") && visibleReviews.map(item => <a href="#/upload" className="notification-item" key={item.id} onClick={() => setOpen(false)}>
        <span className={`notification-icon ${item.status === "published" ? "notification-icon-approved" : "notification-icon-review"}`}><Disc3 size={17} /></span><span><strong>{item.name}</strong><small>{item.status === "published" ? "Tu beat fue aprobado y ya está publicado." : "Tu subida requiere ajustes antes de publicarse."}</small><em className={`notification-tag ${item.status === "published" ? "notification-tag-approved" : "notification-tag-review"}`}>{item.status === "published" ? "Aprobado" : "Requiere cambios"}</em></span>{!seen.includes(item.id) && <i aria-label="No leída" />}
      </a>)}
      {userId && persistentLoading && <p className="notification-empty" role="status">Cargando actividad nueva…</p>}
      {userId && !persistentLoading && persistentError && <div className="notification-empty-state" role="status"><strong>No se pudieron cargar las notificaciones nuevas</strong><p>Las solicitudes, mensajes y revisiones anteriores siguen disponibles.</p><button type="button" className="notification-retry" onClick={() => setSettingsRevision(value => value + 1)}>Reintentar</button></div>}
      {userId && !persistentLoading && !persistentError && isVisible("social") && persistentCursor && <button className="notification-load-more" type="button" disabled={loadingMore} onClick={() => void loadMoreNotifications()}>{loadingMore ? "Cargando…" : "Cargar más"}</button>}
      </div>
      {userId && <a className="notification-all" href="#/friends" onClick={() => setOpen(false)}>Ver amigos y solicitudes</a>}
    </section>}
    {toast && !open && <div className={`notification-toast ${toast.startsWith('Nuevo mensaje') ? "notification-toast-message" : toast.includes('comentó') ? "notification-toast-message" : toast.includes('reaccionó') ? "notification-toast-reaction" : toast.startsWith('Tu subida') ? "notification-toast-review" : "notification-toast-request"}`} role="status"><span className="notification-icon">{toast.startsWith('Nuevo mensaje') || toast.includes('comentó') ? <MessageCircle size={17} /> : toast.includes('reaccionó') ? <Heart size={17} /> : toast.startsWith('Tu subida') ? <Disc3 size={17} /> : <UserRoundPlus size={17} />}</span><span>{toast}</span><button type="button" aria-label="Cerrar notificación" onClick={() => setToast("")}><X size={15} /></button></div>}
  </div>;
}
