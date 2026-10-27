import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Upload } from './Upload';
import type { AssetRecord } from '../api/client';

beforeEach(() => {
  localStorage.clear();
  window.location.hash = '#/upload';
  vi.stubGlobal('URL', class extends URL {
    static createObjectURL = vi.fn(() => 'blob:preview');
    static revokeObjectURL = vi.fn();
  });
});
afterEach(() => vi.unstubAllGlobals());
function completeForm(files = [new File(['RIFF'], 'kick.wav', { type: 'audio/wav' })]) {
  fireEvent.change(document.querySelector('#upload-file')!, { target: { files } });
  fireEvent.change(screen.getByRole('combobox', { name: 'Tipo' }), { target: { value: 'One-shot' } });
  fireEvent.change(screen.getByLabelText('Tags'), { target: { value: 'drums, tight' } });
}
describe('creator upload submission', () => {
  it('does not submit the same file twice when it appears twice in one selection', async () => {
    const publish = vi.fn().mockResolvedValue(true);
    const file = new File(['audio'], 'same.wav', { type: 'audio/wav', lastModified: 100 });
    render(<Upload onPublish={publish} />);
    completeForm([file, file]);
    fireEvent.click(screen.getByRole('button', { name: 'Enviar a revision' }));
    await waitFor(() => expect(window.location.hash).toBe('#/studio'));
    expect(publish).toHaveBeenCalledOnce();
  });
  it('offers only Beats and One-shots, including restored unsupported drafts', () => {
    localStorage.setItem('beatvault:upload-draft', JSON.stringify({ title: 'Old loop', type: 'Loop', file: '', tags: [] }));
    render(<Upload onPublish={vi.fn()} />);
    expect(screen.getAllByRole('option').map(option => option.textContent)).toEqual(['Seleccionar tipo', 'Beat', 'One-shot']);
    expect(screen.getByRole('combobox', { name: 'Tipo' })).toHaveValue('');
    expect(screen.getByLabelText('Nombre')).toHaveValue('Old loop');
  });
  it('waits for catalog confirmation and keeps rejected writes visible', async () => {
    let finish!: (value: boolean) => void;
    const publish = vi.fn(() => new Promise<boolean>(resolve => { finish = resolve; }));
    render(<Upload onPublish={publish} />); completeForm();
    fireEvent.click(screen.getByRole('button', { name: 'Enviar a revision' }));
    await waitFor(() => expect(publish).toHaveBeenCalledOnce());
    expect(window.location.hash).toBe('#/upload');
    expect(screen.getByRole('button', { name: 'Enviando...' })).toBeDisabled();
    await act(async () => finish(false));
    expect(screen.getByRole('alert')).toHaveTextContent('no se guardo');
    expect(window.location.hash).toBe('#/upload');
  });
  it('retries only failed metadata and uploads every queue item once', async () => {
    const remote = vi.fn(async () => ({ ok: true as const, data: { id: 'remote' } as AssetRecord }));
    const publish = vi.fn().mockResolvedValueOnce(true).mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    render(<Upload onPublish={publish} onRemoteUpload={remote} />);
    completeForm([new File(['a'], 'kick.wav', { type: 'audio/wav' }), new File(['b'], 'snare.wav', { type: 'audio/wav' })]);
    fireEvent.click(screen.getByRole('button', { name: 'Enviar a revision' }));
    await screen.findByRole('alert');
    expect(remote).toHaveBeenCalledTimes(2);
    fireEvent.click(screen.getByRole('button', { name: 'Enviar a revision' }));
    await waitFor(() => expect(window.location.hash).toBe('#/studio'));
    expect(remote).toHaveBeenCalledTimes(2);
    expect(publish).toHaveBeenCalledTimes(3);
    expect(publish.mock.calls.map(call => call[0].name)).toEqual(['kick', 'snare', 'snare']);
  });
  it('validates and attaches custom square artwork to the published audio', async () => {
    vi.stubGlobal('createImageBitmap', vi.fn(async () => ({ width: 3000, height: 3000, close: vi.fn() })));
    const publish = vi.fn().mockResolvedValue('catalog-artwork');
    render(<Upload onPublish={publish} />);
    completeForm();
    const artwork = new File(['image'], 'cover.png', { type: 'image/png' });
    fireEvent.change(screen.getByLabelText('Subir JPG, PNG, WebP o AVIF'), { target: { files: [artwork] } });
    fireEvent.click(screen.getByRole('button', { name: 'Enviar a revision' }));
    await waitFor(() => expect(window.location.hash).toBe('#/studio'));
    expect(publish.mock.calls[0][2]).toBe(artwork);
  });
  it('appends dropped audio without losing the existing queue and submits per-file titles', async () => {
    const publish = vi.fn().mockResolvedValue(true);
    render(<Upload onPublish={publish} />);
    const first = new File(['RIFF'], 'first.wav', { type: '' });
    completeForm([first]);
    fireEvent.drop(document.querySelector('.dropzone')!, { dataTransfer: { files: [new File(['ID3'], 'second.mp3', { type: 'audio/mpeg' }), first] } });
    expect(screen.getByText('2 archivos seleccionados · añadir más')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Nombre para first.wav'), { target: { value: 'Kick custom' } });
    fireEvent.change(screen.getByLabelText('Nombre para second.mp3'), { target: { value: 'Snare custom' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enviar a revision' }));
    await waitFor(() => expect(window.location.hash).toBe('#/studio'));
    expect(publish.mock.calls.map(call => call[0].name)).toEqual(['Kick custom', 'Snare custom']);
  });
  it('accepts landscape WebP artwork with an explicit server-side center crop', async () => {
    vi.stubGlobal('createImageBitmap', vi.fn(async () => ({ width: 1200, height: 800, close: vi.fn() })));
    const publish = vi.fn().mockResolvedValue(true);
    render(<Upload onPublish={publish} />); completeForm();
    const artwork = new File(['webp'], 'landscape.webp', { type: 'image/webp' });
    fireEvent.change(screen.getByLabelText('Subir JPG, PNG, WebP o AVIF'), { target: { files: [artwork] } });
    expect(screen.getByText(/La portada se recorta al centro/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Enviar a revision' }));
    await waitFor(() => expect(publish).toHaveBeenCalledOnce());
    expect(publish.mock.calls[0][2]).toBe(artwork);
  });
});
