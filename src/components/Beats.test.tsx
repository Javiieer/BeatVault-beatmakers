import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { BeatDetail } from './Beats';
import type { CatalogAsset } from '../data/localCatalog';

const published: CatalogAsset = { id: 'published-beat', name: '<img src=x onerror=alert(1)>', type: 'Beat', ownerId: 'seller', creatorName: 'Seller', metadata: { duration: '--', size: '--', format: 'WAV' }, color: '#000', favorite: false, waveform: [], tags: [{ label: '<script>test</script>' }], publicationStatus: 'published', previewUrl: '/api/catalog/published-beat/preview' };

describe('published beat detail', () => {
  it('loads by catalog id, escapes user fields and plays only the public preview', async () => {
    window.location.hash = '#/beat-detail?id=published-beat';
    const load = vi.fn().mockResolvedValue({ asset: published });
    const play = vi.fn();
    const view = render(<BeatDetail onLoad={load} onPlay={play} />);
    expect(await screen.findByRole('heading', { name: published.name })).toBeInTheDocument();
    expect(load).toHaveBeenCalledWith('published-beat');
    expect(view.container.querySelector('script')).toBeNull();
    expect(view.container.querySelector('img')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: `Play preview of ${published.name}` }));
    expect(play).toHaveBeenCalledWith(published);
    expect(screen.queryByRole('link', { name: /download/i })).not.toBeInTheDocument();
  });

  it('shows a retryable API error and never substitutes a demo project', async () => {
    window.location.hash = '#/beat-detail?id=private-or-missing';
    const load = vi.fn().mockResolvedValueOnce({ error: 'Offline' }).mockResolvedValueOnce({ notFound: true });
    render(<BeatDetail onLoad={load} onPlay={vi.fn()} />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Offline');
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByRole('heading', { name: 'Beat not found' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to Marketplace' })).toHaveAttribute('href', '#/marketplace');
  });
});
