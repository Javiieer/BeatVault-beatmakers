import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HomeComposer } from './HomeComposer';

const { createSocialPost, saveLocalHomePost } = vi.hoisted(() => ({ createSocialPost: vi.fn(), saveLocalHomePost: vi.fn() }));
vi.mock('../data/socialPostRepository', () => ({ createSocialPost }));
vi.mock('../data/homePosts', () => ({ saveLocalHomePost }));

beforeEach(() => { vi.clearAllMocks(); });
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('HomeComposer persistence boundary', () => {
  it('shows privacy choices in a compact icon menu and synchronizes the selected audience', () => {
    const { container } = render(<HomeComposer scope="account-1" onPublish={vi.fn()} />);
    const privacy = screen.getByRole('button', { name: 'Privacidad de la publicación: Solo yo' });
    const icon = container.querySelector('.home-audience-icon');
    expect(icon).toHaveAttribute('data-audience', 'private');
    expect(container.querySelector('.home-audience-menu')).toBeNull();
    fireEvent.click(privacy);
    expect(screen.getByRole('group', { name: 'Privacidad de la publicación' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Solo yo' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'Amigos' }));
    expect(icon).toHaveAttribute('data-audience', 'friends');
    expect(container.querySelector('.home-audience-menu')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Privacidad de la publicación: Amigos' }));
    fireEvent.click(screen.getByRole('button', { name: 'Público' }));
    expect(icon).toHaveAttribute('data-audience', 'public');
  });

  it('closes the privacy menu on Escape', () => {
    render(<HomeComposer scope="account-1" onPublish={vi.fn()} />);
    const privacy = screen.getByRole('button', { name: 'Privacidad de la publicación: Solo yo' });
    fireEvent.click(privacy);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('group', { name: 'Privacidad de la publicación' })).not.toBeInTheDocument();
    expect(privacy).toHaveFocus();
  });

  it('publishes with the audience selected from the privacy menu', async () => {
    createSocialPost.mockResolvedValue({ ok: true, data: { id: 'friends-post' } });
    render(<HomeComposer scope="account-1" onPublish={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('¿Qué estás creando hoy?'), { target: { value: 'Friends-only draft' } });
    fireEvent.click(screen.getByRole('button', { name: 'Privacidad de la publicación: Solo yo' }));
    fireEvent.click(screen.getByRole('button', { name: 'Amigos' }));
    fireEvent.click(screen.getByRole('button', { name: 'Publicar' }));
    await waitFor(() => expect(createSocialPost).toHaveBeenCalledWith({ kind: 'status', body: 'Friends-only draft', audience: 'friends' }));
  });

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

  it('clears a selected photo before opening the video picker when switching modes', () => {
    const frames: FrameRequestCallback[] = [];
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation(callback => {
      frames.push(callback);
      return frames.length;
    });
    vi.stubGlobal('URL', class extends URL {
      static createObjectURL = vi.fn(() => 'blob:preview');
      static revokeObjectURL = vi.fn();
    });

    const { container } = render(<HomeComposer scope="account-1" onPublish={vi.fn()} />);
    const fileInput = container.querySelector<HTMLInputElement>('input[type="file"]')!;
    let previewWasClearedWhenVideoPickerOpened = false;
    vi.spyOn(fileInput, 'click').mockImplementation(() => {
      if (fileInput.accept === 'video/mp4') {
        previewWasClearedWhenVideoPickerOpened = container.querySelector('.home-composer-preview') === null;
      }
    });

    fireEvent.click(screen.getByRole('button', { name: /Foto/ }));
    frames.shift()?.(0);
    fireEvent.change(fileInput, { target: { files: [new File(['image'], 'cover.png', { type: 'image/png' })] } });
    expect(container.querySelector('.home-composer-preview')).not.toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /Video/ }));
    frames.shift()?.(0);

    expect(previewWasClearedWhenVideoPickerOpened).toBe(true);
    expect(fileInput.accept).toBe('video/mp4');
    expect(screen.getByRole('button', { name: 'Publicar' })).toBeDisabled();
    expect(createSocialPost).not.toHaveBeenCalled();
  });
});
