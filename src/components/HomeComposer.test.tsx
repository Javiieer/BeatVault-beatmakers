import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { HomeComposer } from './HomeComposer';

const { createSocialPost, saveLocalHomePost } = vi.hoisted(() => ({ createSocialPost: vi.fn(), saveLocalHomePost: vi.fn() }));
vi.mock('../data/socialPostRepository', () => ({ createSocialPost }));
vi.mock('../data/homePosts', () => ({ saveLocalHomePost }));

beforeEach(() => { vi.clearAllMocks(); });

describe('HomeComposer persistence boundary', () => {
  it('sends authenticated status posts only through the social API with private audience by default', async () => {
    const post = { id: 'remote-1', author: { id: 'account-1', displayName: 'Creator' }, kind: 'status', body: 'Test status', audience: 'private', visibility: 'published', createdAt: new Date().toISOString() };
    createSocialPost.mockResolvedValue({ ok: true, data: post });
    const onPublish = vi.fn();
    render(<HomeComposer scope="account-1" onPublish={onPublish} />);
    fireEvent.change(screen.getByLabelText('¿Qué estás creando hoy?'), { target: { value: 'Test status' } });
    fireEvent.click(screen.getByRole('button', { name: 'Publicar' }));
    await waitFor(() => expect(createSocialPost).toHaveBeenCalledWith({ kind: 'status', body: 'Test status', audience: 'private' }));
    expect(saveLocalHomePost).not.toHaveBeenCalled();
    expect(onPublish).toHaveBeenCalledWith(post);
  });

  it('keeps demo posts local and labels the composer as device-only', async () => {
    const post = { id: 'local-1', scope: 'demo', kind: 'status', text: 'Local demo', createdAt: new Date().toISOString() };
    saveLocalHomePost.mockResolvedValue(post);
    const onPublish = vi.fn();
    render(<HomeComposer scope="demo" onPublish={onPublish} />);
    expect(screen.getByText(/solo en este equipo/i)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('¿Qué estás creando hoy?'), { target: { value: 'Local demo' } });
    fireEvent.click(screen.getByRole('button', { name: 'Publicar' }));
    await waitFor(() => expect(saveLocalHomePost).toHaveBeenCalledWith(expect.objectContaining({ scope: 'demo', text: 'Local demo' })));
    expect(createSocialPost).not.toHaveBeenCalled();
    expect(onPublish).toHaveBeenCalledWith(post);
  });

  it('does not silently store authenticated posts locally when the API rejects them', async () => {
    createSocialPost.mockResolvedValue({ ok: false, error: { code: 'UNAUTHORIZED', message: 'Inicia sesión.' } });
    render(<HomeComposer scope="account-1" onPublish={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('¿Qué estás creando hoy?'), { target: { value: 'Must stay authenticated' } });
    fireEvent.click(screen.getByRole('button', { name: 'Publicar' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Inicia sesión.');
    expect(saveLocalHomePost).not.toHaveBeenCalled();
  });
});
