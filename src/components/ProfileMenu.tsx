import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Disc3, LogOut, Settings, ShieldCheck, Upload, UserRound } from 'lucide-react';
import type { AuthUser } from '../api/client';
import '../styles/profile-menu.css';

export function ProfileMenu({ user, onLogout }: { user?: AuthUser; onLogout: () => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [placement, setPlacement] = useState({ top: 76, right: 16 });
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const id = useId();
  const items = () => Array.from(menu.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') || []);
  useEffect(() => {
    if (!open) return;
    const placeMenu = () => {
      const rect = trigger.current?.getBoundingClientRect();
      if (rect) setPlacement({ top: rect.bottom + 8, right: Math.max(8, window.innerWidth - rect.right) });
    };
    placeMenu();
    menu.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && !root.current?.contains(event.target) && !menu.current?.contains(event.target)) setOpen(false);
    };
    const navigate = () => setOpen(false);
    document.addEventListener('pointerdown', outside);
    window.addEventListener('resize', placeMenu);
    window.addEventListener('scroll', placeMenu, true);
    window.addEventListener('hashchange', navigate);
    return () => { document.removeEventListener('pointerdown', outside); window.removeEventListener('resize', placeMenu); window.removeEventListener('scroll', placeMenu, true); window.removeEventListener('hashchange', navigate); };
  }, [open]);
  const keyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!open) return;
    if (event.key === 'Escape') { event.preventDefault(); setOpen(false); trigger.current?.focus(); }
    const links = items();
    const current = links.indexOf(document.activeElement as HTMLElement);
    let next: number | undefined;
    if (event.key === 'ArrowDown') next = (current + 1) % links.length;
    if (event.key === 'ArrowUp') next = (current - 1 + links.length) % links.length;
    if (event.key === 'Home') next = 0;
    if (event.key === 'End') next = links.length - 1;
    if (next !== undefined) { event.preventDefault(); links[next]?.focus(); }
  };
  const logout = async () => {
    if (busy) return;
    setBusy(true); setError('');
    try { await onLogout(); }
    catch { setError('No se pudo cerrar la sesion. Intenta de nuevo.'); }
    finally { setBusy(false); }
  };
  const close = () => { setOpen(false); trigger.current?.focus(); };
  return <div className={`profile-menu${open ? ' is-open' : ''}`} ref={root} onKeyDown={keyDown}
    onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget) && !menu.current?.contains(event.relatedTarget as Node)) setOpen(false); }}>
    <button ref={trigger} type="button" className="profile-trigger" aria-label="Menu de perfil"
      aria-haspopup="menu" aria-expanded={open} aria-controls={id}
      onClick={() => setOpen(value => !value)}
      onKeyDown={event => { if (!open && event.key === 'ArrowDown') { event.preventDefault(); setOpen(true); } }}>
      <span className="avatar" aria-hidden="true">{user ? user.email.slice(0, 2).toUpperCase() : <UserRound size={16} />}</span>
      <span className="profile-trigger-email">{user?.email || 'Demo local'}</span>
      <ChevronDown size={14} aria-hidden="true" />
    </button>
    {open && createPortal(<>
      <button type="button" className="profile-menu-backdrop" aria-label="Cerrar menú de perfil" tabIndex={-1} onClick={() => setOpen(false)} />
      <div ref={menu} className="profile-popover" style={{ top: placement.top, right: placement.right, maxHeight: `calc(100dvh - ${placement.top}px - 16px)` }}>
      <div className="profile-identity">
        <strong>{user?.email || 'Demo local'}</strong>
        <span>{user?.role === 'admin' ? 'Administrador' : user?.role === 'community_manager' ? 'Community manager' : user ? 'Creador' : 'Sin cuenta conectada'}</span>
      </div>
      <div id={id} role="menu" aria-label="Opciones de perfil">
        <a role="menuitem" href="#/profile" onClick={close}><UserRound size={17} />Ver mi perfil</a>
        <a role="menuitem" href="#/settings" onClick={close}><Settings size={17} />Editar perfil</a>
        <a role="menuitem" href="#/studio" onClick={close}><Disc3 size={17} />Mis subidas</a>
        <a role="menuitem" href="#/upload" onClick={close}><Upload size={17} />Subir audio</a>
        {user?.role === 'admin' && <a role="menuitem" href="#/admin" onClick={close}><ShieldCheck size={17} />Panel de administracion</a>}
        {(user?.role === 'admin' || user?.role === 'community_manager') && <a role="menuitem" href="#/community-review" onClick={close}><ShieldCheck size={17} />Marketplace review</a>}
        {user && <button role="menuitem" type="button" className="profile-logout" aria-disabled={busy} onClick={() => void logout()}><LogOut size={17} />{busy ? 'Cerrando sesion...' : 'Cerrar sesion'}</button>}
      </div>
      {error && <p className="profile-error" role="alert">{error}</p>}
      </div>
    </>, document.body)}
  </div>;
}
