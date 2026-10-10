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
});
