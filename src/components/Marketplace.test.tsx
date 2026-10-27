import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CatalogAsset } from '../data/localCatalog';
import { Marketplace } from './Marketplace';
import { createBeatCheckout, loadBeatOrders } from '../data/beatPurchases';
import { readFavoriteIds } from '../data/localFavorites';
vi.mock('../data/accountFavoriteRepository', async () => (await import('../test/favoriteRepositoryFixture')).favoriteRepositoryFixture);

vi.mock('../data/beatPurchases', () => ({
  loadBeatOrders: vi.fn(async () => ({ ok: true, data: [] })),
  createBeatCheckout: vi.fn(),
}));

beforeEach(() => {
  window.history.replaceState(null, '', '#/marketplace');
  localStorage.clear();
  vi.mocked(loadBeatOrders).mockReset().mockResolvedValue({ ok: true, data: [] });
  vi.mocked(createBeatCheckout).mockReset();
});

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
  it('keeps deep-link searches within the API field limit', async () => {
    window.history.replaceState(null, '', `#/marketplace?search=${'x'.repeat(200)}`);
    const search = vi.fn().mockResolvedValue({ assets: [], total: 0, source: 'api' });
    render(<Marketplace catalogAssets={[]} onPlay={vi.fn()} onSearch={search} />);
    expect(screen.getByRole('textbox', { name: 'Search audio, creator, or tag' })).toHaveAttribute('maxlength', '80');
    await waitFor(() => expect(search).toHaveBeenCalledWith(expect.objectContaining({ query: 'x'.repeat(80) })));
  });
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
    expect(screen.getByRole('navigation', { name: 'Marketplace sections' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'My library' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Night Session' })).toHaveAttribute('href', '#/beat-detail?id=Night%20Session');
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

  it('keeps account library and purchases behind authentication without requesting private data', () => {
    const { rerender } = render(<Marketplace catalogAssets={[]} onPlay={vi.fn()} initialTab="library" libraryContent={<p>Private library</p>} />);
    expect(screen.getByRole('heading', { name: 'Sign in to access your library' })).toBeInTheDocument();
    expect(screen.queryByText('Private library')).not.toBeInTheDocument();
    rerender(<Marketplace catalogAssets={[]} onPlay={vi.fn()} initialTab="purchases" />);
    expect(screen.getByRole('heading', { name: 'Sign in to access your purchases' })).toBeInTheDocument();
    expect(loadBeatOrders).not.toHaveBeenCalled();
  });

  it('switches unified sections, preserves checkout parameters and follows history tab changes', async () => {
    window.history.replaceState(null, '', '#/marketplace?checkout=success&order=order-1');
    const { rerender } = render(<Marketplace catalogAssets={[]} onPlay={vi.fn()} userId="owner" initialTab="explore" libraryContent={<p>Saved audio content</p>} />);
    fireEvent.click(screen.getByRole('button', { name: 'My library' }));
    expect(screen.getByText('Saved audio content')).toBeInTheDocument();
    expect(window.location.hash).toContain('checkout=success');
    expect(window.location.hash).toContain('tab=library');
    window.history.replaceState(null, '', '#/marketplace?checkout=success&order=order-1&tab=purchases');
    rerender(<Marketplace catalogAssets={[]} onPlay={vi.fn()} userId="owner" initialTab="purchases" />);
    expect(await screen.findByRole('heading', { name: 'No purchases yet' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'My purchases' })).toHaveAttribute('aria-current', 'page');
  });

  it('persists favorites only for the signed-in account and emits the library refresh event', async () => {
    const changed = vi.fn();
    window.addEventListener('beatvault:favorites-changed', changed);
    const { rerender } = render(<Marketplace catalogAssets={[asset('Saved beat')]} onPlay={vi.fn()} userId="owner-a" />);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Save Saved beat to my library' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: 'Save Saved beat to my library' }));
    expect(readFavoriteIds('owner-a')?.has('Saved beat')).toBe(true);
    expect(readFavoriteIds('owner-b')?.has('Saved beat')).not.toBe(true);
    await waitFor(() => expect(changed).toHaveBeenCalledTimes(1));
    rerender(<Marketplace catalogAssets={[asset('Saved beat')]} onPlay={vi.fn()} userId="owner-b" />);
    expect(screen.getByRole('button', { name: 'Save Saved beat to my library' })).toHaveAttribute('aria-pressed', 'false');
    window.removeEventListener('beatvault:favorites-changed', changed);
  });

  it('shows purchase errors and retries without treating an API failure as an empty purchase list', async () => {
    vi.mocked(loadBeatOrders).mockResolvedValueOnce({ ok: false, error: { code: 'NETWORK_ERROR', message: 'Purchases disconnected' } });
    render(<Marketplace catalogAssets={[]} onPlay={vi.fn()} userId="buyer" initialTab="purchases" />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Purchases disconnected');
    expect(screen.queryByRole('heading', { name: 'No purchases yet' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Retry purchases' }));
    expect(await screen.findByRole('heading', { name: 'No purchases yet' })).toBeInTheDocument();
  });

  it('never exposes download links for pending/refunded purchases or unsafe destinations', async () => {
    const order = { id: 'order-1', title: 'Purchased beat', offerId: 'offer-1', amountMinor: 1200, currency: 'usd' as const, status: 'paid' as const, createdAt: '2026-10-25T00:00:00Z' };
    vi.mocked(loadBeatOrders).mockResolvedValue({ ok: true, data: [
      { ...order, id: 'safe', title: 'Safe download', downloadUrl: '/api/orders/safe/download?format=mp3' },
      { ...order, id: 'unsafe', title: 'Unsafe download', downloadUrl: 'javascript:alert(1)' },
      { ...order, id: 'foreign', title: 'Foreign download', downloadUrl: 'https://attacker.test/api/orders/foreign/download' },
      { ...order, id: 'pending', title: 'Pending download', status: 'pending', downloadUrl: '/api/orders/pending/download' },
      { ...order, id: 'refunded', title: 'Refunded download', status: 'refunded', downloadUrl: '/api/orders/refunded/download' },
    ] });
    render(<Marketplace catalogAssets={[]} onPlay={vi.fn()} userId="buyer" initialTab="purchases" />);
    await screen.findByText('Safe download');
    const downloads = screen.getAllByRole('link', { name: 'Download' });
    expect(downloads).toHaveLength(1);
    expect(downloads[0]).toHaveAttribute('href', '/api/orders/safe/download?format=mp3');
  });

  it('catches rejected catalog requests and retries, without showing supplied private or fallback records', async () => {
    const onSearch = vi.fn().mockRejectedValueOnce(new Error('unavailable')).mockResolvedValueOnce({ assets: [asset('Published result'), asset('Draft result', { publicationStatus: 'draft' })], total: 1, source: 'api' });
    render(<Marketplace catalogAssets={[asset('Local private fallback', { publicationStatus: 'draft' })]} onPlay={vi.fn()} onSearch={onSearch} />);
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Retry catalog' }));
    expect(await screen.findByRole('heading', { name: 'Published result' })).toBeInTheDocument();
    expect(screen.queryByText('Draft result')).not.toBeInTheDocument();
    expect(screen.queryByText('Local private fallback')).not.toBeInTheDocument();
  });

  it('rejects a malicious checkout destination and keeps the user in the marketplace', async () => {
    vi.mocked(createBeatCheckout).mockResolvedValue({ ok: true, data: { orderId: 'order-1', url: 'https://checkout.stripe.com.attacker.test/payment' } });
    const offer = { id: 'offer-1', label: 'Basic', amountMinor: 1200, currency: 'USD' as const, deliverables: ['mp3'] };
    render(<Marketplace catalogAssets={[asset('Beat', { purchaseOffers: [offer] })]} onPlay={vi.fn()} userId="buyer" />);
    fireEvent.click(screen.getByRole('button', { name: 'Basic · $12.00' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not open a secure checkout');
    expect(window.location.hash).toBe('#/marketplace');
  });

  it('shows the purchased license snapshot and only format-matched protected files', async () => {
    vi.mocked(loadBeatOrders).mockResolvedValue({ ok: true, data: [{
      id: 'paid-order', title: 'Licensed beat', offerId: 'premium', amountMinor: 3500, currency: 'usd', status: 'paid', createdAt: '2026-10-25T00:00:00Z',
      offerLabel: 'Premium license', usageSummary: 'One commercial recording', termsVersion: 'v1', deliverables: ['mp3', 'wav'],
      downloads: [
        { format: 'mp3', url: '/api/orders/paid-order/download?format=mp3' },
        { format: 'wav', url: '/api/orders/paid-order/download?format=wav' },
        { format: 'wav', url: '/api/orders/another-order/download?format=wav' },
        { format: 'mp3', url: '/api/orders/paid-order/download?format=wav' },
      ],
    }] });
    render(<Marketplace catalogAssets={[]} onPlay={vi.fn()} userId="buyer" initialTab="purchases" />);
    expect(await screen.findByText('Premium license · MP3 + WAV')).toBeInTheDocument();
    expect(screen.getByText('One commercial recording')).toBeInTheDocument();
    expect(screen.getByText('License version: v1')).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: /Download/ })).toHaveLength(2);
    expect(screen.getByRole('link', { name: 'Download MP3' })).toHaveAttribute('href', '/api/orders/paid-order/download?format=mp3');
    expect(screen.getByRole('link', { name: 'Download WAV' })).toHaveAttribute('href', '/api/orders/paid-order/download?format=wav');
  });

  it('disables offers whose promised files or payment setup are unavailable', () => {
    const offers = [
      { id: 'stems', label: 'Stems', amountMinor: 3500, currency: 'USD' as const, deliverables: ['stems'], available: false, unavailableReason: 'STEMS_UNAVAILABLE' },
      { id: 'basic', label: 'Basic', amountMinor: 1200, currency: 'USD' as const, deliverables: ['mp3'], available: false, unavailableReason: 'PAYMENTS_NOT_CONFIGURED' },
    ];
    render(<Marketplace catalogAssets={[asset('Unavailable offers', { purchaseOffers: offers })]} onPlay={vi.fn()} userId="buyer" />);
    expect(screen.getByRole('button', { name: 'Stems · $35.00' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Basic · $12.00' })).toBeDisabled();
    expect(screen.getByText('Stems are not available for this offer.')).toBeInTheDocument();
    expect(screen.getByText('Test checkout is not configured.')).toBeInTheDocument();
    expect(createBeatCheckout).not.toHaveBeenCalled();
  });

  it('honors legacy beat filters and search parameters, and clears their URL state', () => {
    window.history.replaceState(null, '', '#/marketplace?tab=explore&type=beat&search=night');
    render(<Marketplace catalogAssets={[asset('Night beat'), asset('Night hit', { type: 'One-shot' })]} onPlay={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'beats' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByLabelText('Search audio, creator, or tag')).toHaveValue('night');
    expect(screen.queryByRole('heading', { name: 'Night hit' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'All' }));
    expect(screen.getByRole('heading', { name: 'Night hit' })).toBeInTheDocument();
    expect(window.location.hash).not.toContain('type=beat');
  });

  it('ignores an older catalog response after the search has changed', async () => {
    let resolveOld: ((value: { assets: CatalogAsset[]; total: number; source: 'api' }) => void) | undefined;
    const onSearch = vi.fn()
      .mockImplementationOnce(() => new Promise(resolve => { resolveOld = resolve; }))
      .mockResolvedValueOnce({ assets: [asset('New result')], total: 1, source: 'api' });
    render(<Marketplace catalogAssets={[]} onPlay={vi.fn()} onSearch={onSearch} />);
    await waitFor(() => expect(onSearch).toHaveBeenCalledTimes(1));
    fireEvent.change(screen.getByLabelText('Search audio, creator, or tag'), { target: { value: 'New' } });
    expect(await screen.findByRole('heading', { name: 'New result' })).toBeInTheDocument();
    resolveOld?.({ assets: [asset('Old result')], total: 1, source: 'api' });
    await waitFor(() => expect(screen.getByRole('heading', { name: 'New result' })).toBeInTheDocument());
    expect(screen.queryByRole('heading', { name: 'Old result' })).not.toBeInTheDocument();
  });

  it.each(['account change', 'logout', 'unmount'] as const)('ignores a pending checkout after %s', async boundary => {
    let finish: ((value: Awaited<ReturnType<typeof createBeatCheckout>>) => void) | undefined;
    vi.mocked(createBeatCheckout).mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const offer = { id: 'offer-1', label: 'Basic', amountMinor: 1200, currency: 'USD' as const, deliverables: ['mp3'] };
    const items = [asset('Beat', { purchaseOffers: [offer] })];
    const { rerender, unmount } = render(<Marketplace catalogAssets={items} onPlay={vi.fn()} userId="buyer-a" />);
    fireEvent.click(screen.getByRole('button', { name: 'Basic · $12.00' }));
    expect(screen.getByRole('button', { name: 'Opening checkout…' })).toBeDisabled();
    if (boundary === 'unmount') unmount();
    else rerender(<Marketplace catalogAssets={items} onPlay={vi.fn()} userId={boundary === 'logout' ? undefined : 'buyer-b'} />);
    // Observe URL parsing, which must never be reached for a stale successful response.
    // This avoids replacing jsdom's non-configurable location/navigation properties.
    const OriginalURL = URL;
    const parsedDestination = vi.fn();
    class ObservedURL extends OriginalURL {
      constructor(url: string | URL, base?: string | URL) { super(url, base); parsedDestination(String(url)); }
    }
    vi.stubGlobal('URL', ObservedURL);
    try {
      await act(async () => finish?.({ ok: true, data: { orderId: 'old-order', url: 'https://checkout.stripe.com/c/pay/old-session' } }));
      expect(parsedDestination).not.toHaveBeenCalled();
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
      if (boundary !== 'unmount') expect(screen.getByRole('button', { name: 'Basic · $12.00' })).toBeEnabled();
    } finally { vi.unstubAllGlobals(); }
  });

  it.each(['success', 'cancelled'])('opens purchases for a legacy checkout=%s link without a tab', async checkout => {
    window.history.replaceState(null, '', `#/marketplace?checkout=${checkout}&order=returned-order`);
    render(<Marketplace catalogAssets={[]} onPlay={vi.fn()} userId="buyer" initialTab="explore" />);
    expect(screen.getByRole('button', { name: 'My purchases' })).toHaveAttribute('aria-current', 'page');
    expect(await screen.findByRole('heading', { name: 'No purchases yet' })).toBeInTheDocument();
    expect(loadBeatOrders).toHaveBeenCalledTimes(1);
  });
});
