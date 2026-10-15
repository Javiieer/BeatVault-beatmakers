import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { CatalogAsset } from '../data/localCatalog';
import { Marketplace } from './Marketplace';

const asset = (id: string, values: Partial<CatalogAsset> = {}): CatalogAsset => ({
  id,
  name: id,
  type: 'Beat',
  metadata: { duration: '2:10', size: '4 MB', format: 'WAV' },
  tags: [],
  color: '#35d0ba',
  favorite: false,
  waveform: [],
  publicationStatus: 'published',
  ...values,
});

describe('Marketplace', () => {
  it('shows only published beats and one-shots and links to creator profiles', () => {
    const items = [
      asset('Night Session', { ownerId: 'producer-1', creatorName: 'Milo North', tags: [{ label: 'trap' }], previewUrl: '/preview/night' }),
      asset('Glass Hit', { type: 'One-shot', tags: [{ label: 'organic' }] }),
      asset('Private draft', { publicationStatus: 'draft' }),
      asset('Unsupported pack', { type: 'Sound Pack' }),
    ];
    render(<Marketplace catalogAssets={items} onPlay={vi.fn()} />);

    expect(screen.getByRole('heading', { name: 'Night Session' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Glass Hit' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Private draft' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Unsupported pack' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Milo North' })).toHaveAttribute('href', '#/store?id=producer-1');
    expect(screen.getByText('Purchases are not active yet')).toBeInTheDocument();
  });

  it('filters by kind, tag and creator/name query and plays the selected preview', () => {
    const onPlay = vi.fn();
    const beat = asset('Night Session', { ownerId: 'producer-1', creatorName: 'Milo North', tags: [{ label: 'trap' }], previewUrl: '/preview/night' });
    const oneShot = asset('Glass Hit', { type: 'One-shot', tags: [{ label: 'organic' }], previewUrl: '/preview/glass' });
    render(<Marketplace catalogAssets={[beat, oneShot]} onPlay={onPlay} />);

    fireEvent.click(screen.getByRole('button', { name: 'one-shots' }));
    expect(screen.queryByRole('heading', { name: 'Night Session' })).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Glass Hit' })).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Style'), { target: { value: 'organic' } });
    fireEvent.change(screen.getByLabelText('Search audio, creator, or tag'), { target: { value: 'glass' } });
    fireEvent.click(screen.getByRole('button', { name: 'Listen to preview for Glass Hit' }));
    expect(onPlay).toHaveBeenCalledWith(oneShot);
  });

  it('offers filter reset when a search has no matches', () => {
    render(<Marketplace catalogAssets={[asset('Night Session')]} onPlay={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('Search audio, creator, or tag'), { target: { value: 'unmatched' } });
    expect(screen.getByRole('heading', { name: 'No matches found' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
    expect(screen.getByRole('heading', { name: 'Night Session' })).toBeInTheDocument();
  });

  it('shows only API-backed public offers for a private seller without exposing profile data', async () => {
    const publicOffer = asset('public-beat', {
      ownerId: 'private-seller',
      creatorName: 'BeatVault creator',
      purchaseOffers: [{ id: 'offer-1', label: 'Basic', amountMinor: 1200, currency: 'USD', deliverables: ['mp3'] }],
    });
    const noOffer = asset('not-for-sale', { ownerId: 'private-seller', creatorName: 'BeatVault creator' });
    const unapproved = asset('pending-beat', {
      ownerId: 'private-seller',
      publicationStatus: 'pending-review',
      purchaseOffers: [{ id: 'offer-2', label: 'Basic', amountMinor: 1200, currency: 'USD', deliverables: ['mp3'] }],
    });
    const onSearch = vi.fn(async () => ({ assets: [publicOffer, noOffer, unapproved], total: 3, source: 'api' as const }));
    render(<Marketplace
      creatorId="private-seller"
      catalogAssets={[asset('local-private-draft', { name: 'Social-only draft', ownerId: 'private-seller' })]}
      onPlay={vi.fn()}
      onSearch={onSearch}
    />);

    await waitFor(() => expect(onSearch).toHaveBeenCalledWith(expect.objectContaining({ creatorId: 'private-seller', limit: 24 })));
    expect(await screen.findByRole('heading', { name: 'BeatVault creator' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'public-beat' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'not-for-sale' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'pending-beat' })).not.toBeInTheDocument();
    expect(screen.queryByText('Social-only draft')).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'BeatVault creator' })).not.toHaveAttribute('href', expect.stringContaining('/profile'));
    expect(screen.queryByText('Purchases are not active yet')).not.toBeInTheDocument();
  });

  it('keeps creator filtering when requesting the next public store page', async () => {
    const first = asset('first', { ownerId: 'seller-2', purchaseOffers: [{ id: 'offer-1', label: 'Basic', amountMinor: 1200, currency: 'USD', deliverables: ['mp3'] }] });
    const second = asset('second', { ownerId: 'seller-2', purchaseOffers: [{ id: 'offer-2', label: 'Basic', amountMinor: 1200, currency: 'USD', deliverables: ['mp3'] }] });
    const onSearch = vi.fn()
      .mockResolvedValueOnce({ assets: [first], total: 2, nextCursor: 'first', source: 'api' as const })
      .mockResolvedValueOnce({ assets: [second], total: 2, source: 'api' as const });
    render(<Marketplace creatorId="seller-2" catalogAssets={[]} onPlay={vi.fn()} onSearch={onSearch} />);

    await screen.findByRole('heading', { name: 'first' });
    fireEvent.click(screen.getByRole('button', { name: 'Load more' }));
    await screen.findByRole('heading', { name: 'second' });
    expect(onSearch).toHaveBeenNthCalledWith(2, expect.objectContaining({ creatorId: 'seller-2', cursor: 'first' }));
  });
});
