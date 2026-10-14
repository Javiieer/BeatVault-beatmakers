import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ProfileMenu } from './ProfileMenu';
import type { AuthUser } from '../api/client';

const user: AuthUser = { id: 'test', email: 'creator@example.test', role: 'creator', verificationState: 'unverified' };
const open = () => fireEvent.click(screen.getByRole('button', { name: 'Menu de perfil' }));
describe('profile menu', () => {
  it('opens without logging out and hides administrator actions for creators', () => {
    const logout = vi.fn().mockResolvedValue(undefined);
    render(<ProfileMenu user={user} onLogout={logout} />);
    open();
    expect(logout).not.toHaveBeenCalled();
    expect(screen.getByText('Creador')).toBeVisible();
    expect(screen.queryByRole('menuitem', { name: 'Panel de administracion' })).toBeNull();
    expect(screen.getByRole('menuitem', { name: 'Ver mi perfil' })).toHaveFocus();
  });
  it('shows administrator access, supports arrows and returns focus on Escape', () => {
    render(<ProfileMenu user={{ ...user, role: 'admin' }} onLogout={vi.fn()} />);
    const trigger = screen.getByRole('button', { name: 'Menu de perfil' });
    fireEvent.keyDown(trigger, { key: 'ArrowDown' });
    const upload = screen.getByRole('menuitem', { name: 'Editar perfil' });
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowDown' });
    expect(upload).toHaveFocus();
    expect(screen.getByRole('menuitem', { name: 'Panel de administracion' })).toHaveAttribute('href', '#/admin');
    fireEvent.keyDown(upload, { key: 'Escape' });
    expect(screen.queryByRole('menu')).toBeNull();
    expect(trigger).toHaveFocus();
  });
  it('shows community review without administrator controls', () => {
    render(<ProfileMenu user={{ ...user, role: 'community_manager' }} onLogout={vi.fn()} />);
    open();
    expect(screen.getByText('Community manager')).toBeVisible();
    expect(screen.getByRole('menuitem', { name: 'Marketplace review' })).toHaveAttribute('href', '#/community-review');
    expect(screen.queryByRole('menuitem', { name: 'Panel de administracion' })).toBeNull();
  });
  it('closes on outside interaction', () => {
    render(<ProfileMenu user={user} onLogout={vi.fn()} />);
    open(); fireEvent.pointerDown(document.body);
    expect(screen.queryByRole('menu')).toBeNull();
  });
  it('reports a failed logout instead of pretending the session ended', async () => {
    const logout = vi.fn().mockRejectedValue(new Error('offline'));
    render(<ProfileMenu user={user} onLogout={logout} />);
    open(); fireEvent.click(screen.getByRole('menuitem', { name: 'Cerrar sesion' }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('No se pudo cerrar la sesion'));
    expect(screen.getByRole('menuitem', { name: 'Cerrar sesion' })).toHaveAttribute('aria-disabled', 'false');
    expect(logout).toHaveBeenCalledTimes(1);
  });
  it('does not expose account-only actions in demo mode', () => {
    render(<ProfileMenu onLogout={vi.fn()} />); open();
    expect(screen.getByText('Sin cuenta conectada')).toBeVisible();
    expect(screen.queryByRole('menuitem', { name: 'Cerrar sesion' })).toBeNull();
  });
});
