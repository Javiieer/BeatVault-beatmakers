import { useEffect, useRef, useState } from "react";
import { Bell, UserRoundPlus, X } from "lucide-react";
import { readFriendOverview } from "../data/friendRepository";
import { scopedKey } from "../data/storageScope";
import type { FriendOverview } from "../domains/friends";

function readSeen(scope: string): string[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(scopedKey("beatvault:notifications-seen", scope)) || "[]");
    return Array.isArray(value) ? value.filter((id): id is string => typeof id === "string") : [];
  } catch { return []; }
}

export function NotificationCenter({ userId }: { userId?: string }) {
  const scope = userId || "demo";
  const [open, setOpen] = useState(false);
  const [overview, setOverview] = useState<FriendOverview>();
  const [seen, setSeen] = useState(() => readSeen(scope));
  const [toast, setToast] = useState("");
  const [error, setError] = useState("");
  const knownRequestIds = useRef(new Set<string>());

  useEffect(() => {
    let live = true;
    knownRequestIds.current = new Set();
    const refresh = async () => {
      if (!userId) return;
      const result = await readFriendOverview();
      if (!live) return;
      if (!result.ok) { setError(result.error.message); return; }
      setError("");
      const incoming = result.data.incoming;
      if (knownRequestIds.current.size) {
        const newRequest = incoming.find(item => !knownRequestIds.current.has(item.id));
        if (newRequest) setToast(`${newRequest.profile.displayName} te envio una solicitud de amistad`);
      }
      knownRequestIds.current = new Set(incoming.map(item => item.id));
      setOverview(result.data);
    };
    void refresh();
    const timer = window.setInterval(() => void refresh(), 30000);
    return () => { live = false; window.clearInterval(timer); };
  }, [userId]);

  useEffect(() => { try { localStorage.setItem(scopedKey("beatvault:notifications-seen", scope), JSON.stringify(seen)); } catch { /* Notifications remain usable without storage. */ } }, [scope, seen]);
  useEffect(() => { if (!toast) return; const timer = window.setTimeout(() => setToast(""), 5000); return () => window.clearTimeout(timer); }, [toast]);

  const incoming = overview?.incoming || [];
  const unread = incoming.filter(item => !seen.includes(item.id)).length;
  return <div className="notification-center">
    <button type="button" className="icon-button notification-trigger" aria-label={`Notifications${unread ? `, ${unread} unread` : ""}`} aria-expanded={open} onClick={() => { setOpen(value => !value); if (!open) setSeen(incoming.map(item => item.id)); }}>
      <Bell size={18} strokeWidth={1.8} aria-hidden="true" />{unread > 0 && <span className="notification-badge">{unread > 9 ? "9+" : unread}</span>}
    </button>
    {open && <section className="notification-panel" aria-label="Notificaciones">
      <header><h2>Notificaciones</h2><button className="icon-button" type="button" aria-label="Cerrar notificaciones" onClick={() => setOpen(false)}><X size={17} /></button></header>
      {!userId && <p className="notification-empty">Inicia sesion para recibir solicitudes de amistad.</p>}
      {userId && error && <p className="notification-empty">No se pudieron cargar las notificaciones ahora.</p>}
      {userId && !error && incoming.length === 0 && <p className="notification-empty">Estas al dia. No tienes solicitudes nuevas.</p>}
      {incoming.map(item => <a href="#/friends" className="notification-item" key={item.id} onClick={() => setOpen(false)}>
        <span className="notification-icon"><UserRoundPlus size={17} /></span><span><strong>{item.profile.displayName}</strong><small>Te envio una solicitud de amistad</small></span>{!seen.includes(item.id) && <i aria-label="No leida" />}
      </a>)}
      <a className="notification-all" href="#/friends" onClick={() => setOpen(false)}>Ver solicitudes y amigos</a>
    </section>}
    {toast && <div className="notification-toast" role="status"><span className="notification-icon"><UserRoundPlus size={17} /></span><span>{toast}</span><button type="button" aria-label="Cerrar notificacion" onClick={() => setToast("")}><X size={15} /></button></div>}
  </div>;
}
