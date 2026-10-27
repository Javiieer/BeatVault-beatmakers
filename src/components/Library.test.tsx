import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Library } from './Library';
import type { CatalogAsset } from '../data/localCatalog';
import { readFavoriteIds, writeFavoriteIds } from '../data/localFavorites';
vi.mock('../data/accountFavoriteRepository', async () => (await import('../test/favoriteRepositoryFixture')).favoriteRepositoryFixture);

const { loadOrders } = vi.hoisted(() => ({ loadOrders: vi.fn() }));
vi.mock('../data/beatPurchases', () => ({ loadBeatOrders: loadOrders }));
const asset = (id: string, patch: Partial<CatalogAsset> = {}): CatalogAsset => ({ id, name: id, type: 'Beat', publicationStatus: 'published', metadata: { format: 'WAV', size: '1 MB', duration: '--' }, tags: [], color: '#fff', favorite: false, waveform: [], ...patch });
const props = { catalogAssets: [] as CatalogAsset[], sessionPreviews: new Map<string, string>(), catalogSource: 'api' as const, embedded: true, userId: 'user-a', onLoadSavedAsset: vi.fn(async () => ({ notFound: true })) };
beforeEach(() => { localStorage.clear(); vi.clearAllMocks(); loadOrders.mockResolvedValue({ ok: true, data: [] }); window.location.hash = '#/marketplace?tab=library'; });

describe('personal Marketplace library', () => {
  it('resolves saved public audio independently of a failed main catalog without trusting its cache', async () => {
    writeFavoriteIds(new Set(['saved-id']), 'user-a');
    const loader = vi.fn(async () => ({ asset: asset('saved-id', { name: 'Verified public saved audio' }) }));
    render(<Library {...props} catalogSource="fallback" catalogError="Catalog timed out" catalogAssets={[asset('saved-id', { name: 'Unverified browser cache' })]} onLoadSavedAsset={loader} />);
    expect(screen.queryByText('Unverified browser cache')).not.toBeInTheDocument();
    expect(await screen.findByRole('link', { name: 'Verified public saved audio' })).toBeInTheDocument();
    expect(loader).toHaveBeenCalledWith('saved-id');
  });
  it('requires sign-in and never requests private orders for guests', () => {
    render(<Library {...props} userId={undefined} />);
    expect(screen.getByRole('heading', { name: 'Sign in to open your library' })).toBeInTheDocument();
    expect(loadOrders).not.toHaveBeenCalled();
  });

  it('keeps legacy favorites separate and shows only saved public account items without edit or original download', async () => {
    writeFavoriteIds(new Set(['legacy']));
    writeFavoriteIds(new Set(['saved', 'draft']), 'user-a');
    const onPlay = vi.fn();
    render(<Library {...props} catalogAssets={[asset('saved', { previewUrl: 'javascript:alert(1)', downloadUrl: '/private-original' }), asset('legacy'), asset('draft', { publicationStatus: 'draft' }), asset('unsaved')]} onPlay={onPlay} />);
    await screen.findByRole('link', { name: 'saved' });
    expect(screen.queryByRole('link', { name: 'legacy' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'draft' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'unsaved' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /download/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /edit|archive|delete/i })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Play preview for saved' }));
    expect(onPlay).toHaveBeenCalledWith(expect.objectContaining({ previewUrl: '/api/catalog/saved/preview', downloadUrl: undefined }));
    fireEvent.click(screen.getByRole('button', { name: 'Remove saved from saved audio' }));
    expect(readFavoriteIds('user-a')).toEqual(new Set(['draft']));
    expect(readFavoriteIds()).toEqual(new Set(['legacy']));
  });

  it('does not show cached catalog items when offline and provides order retry without stale entitlements', async () => {
    writeFavoriteIds(new Set(['saved']), 'user-a');
    loadOrders.mockResolvedValueOnce({ ok: false, error: { code: 'NETWORK_ERROR', message: 'Orders offline' } });
    render(<Library {...props} catalogAssets={[asset('saved')]} catalogSource="fallback" catalogError="Offline" />);
    expect(screen.queryByRole('link', { name: 'saved' })).not.toBeInTheDocument();
    expect(await screen.findByText('Orders offline')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Retry acquired audio' }));
    await waitFor(() => expect(loadOrders).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.queryByText('Orders offline')).not.toBeInTheDocument());
  });

  it('clears the previous account collection during an account switch and ignores late requests', async () => {
    let resolveFirst: (value: unknown) => void = () => undefined;
    loadOrders.mockImplementationOnce(() => new Promise(resolve => { resolveFirst = resolve; }));
    writeFavoriteIds(new Set(['only-a']), 'user-a');
    writeFavoriteIds(new Set(['only-b']), 'user-b');
    const view = render(<Library {...props} catalogAssets={[asset('only-a'), asset('only-b')]} />);
    expect(await screen.findByRole('link', { name: 'only-a' })).toBeInTheDocument();
    view.rerender(<Library {...props} userId="user-b" catalogAssets={[asset('only-a'), asset('only-b')]} />);
    expect(screen.queryByRole('link', { name: 'only-a' })).not.toBeInTheDocument();
    await screen.findByRole('link', { name: 'only-b' });
    resolveFirst({ ok: true, data: [{ id: 'order-a', title: 'Private purchase A', offerId: 'wav', status: 'paid' }] });
    await waitFor(() => expect(screen.queryByText('Private purchase A')).not.toBeInTheDocument());
  });

  it('renders unsafe titles as text and excludes refunded purchases and external download links', async () => {
    loadOrders.mockResolvedValue({ ok: true, data: [
      { id: 'safe-order', title: '<img src=x onerror=alert(1)>', offerId: 'wav', status: 'paid', downloadUrl: '/api/orders/safe-order/download' },
      { id: 'unsafe-order', title: 'External download', offerId: 'wav', status: 'paid', downloadUrl: 'javascript:alert(1)' },
      { id: 'refunded-order', title: 'Refunded purchase', offerId: 'wav', status: 'refunded', downloadUrl: '/api/orders/refunded-order/download' },
    ] });
    const { container } = render(<Library {...props} />);
    expect(await screen.findByText('<img src=x onerror=alert(1)>')).toBeInTheDocument();
    expect(container.querySelector('img')).toBeNull();
    expect(screen.queryByText('Refunded purchase')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Download <img src=x onerror=alert(1)>' })).toHaveAttribute('href', '/api/orders/safe-order/download');
    expect(screen.queryByRole('link', { name: 'Download External download' })).not.toBeInTheDocument();
  });

  it('lists every purchased format and rejects tampered format selectors', async () => {
    loadOrders.mockResolvedValue({ ok: true, data: [{
      id: 'multi-order', title: 'Two formats', offerId: 'premium', offerLabel: 'Premium license', status: 'paid',
      downloads: [
        { format: 'mp3', url: '/api/orders/multi-order/download?format=mp3' },
        { format: 'wav', url: '/api/orders/multi-order/download?format=wav' },
        { format: 'wav', url: '/api/orders/multi-order/download?format=mp3&redirect=https://example.com' },
      ],
    }] });
    render(<Library {...props} />);
    expect(await screen.findByRole('link', { name: 'Download Two formats (MP3)' })).toHaveAttribute('href', '/api/orders/multi-order/download?format=mp3');
    expect(screen.getByRole('link', { name: 'Download Two formats (WAV)' })).toHaveAttribute('href', '/api/orders/multi-order/download?format=wav');
    expect(screen.getAllByRole('link', { name: /Download Two formats/ })).toHaveLength(2);
  });

  it('resolves saved audio missing from the catalog page through the public detail loader', async () => {
    writeFavoriteIds(new Set(['later-page']), 'user-a');
    const loader = vi.fn(async (id: string) => ({ asset: asset(id, { name: 'Saved on another catalog page' }) }));
    render(<Library {...props} onLoadSavedAsset={loader} />);
    expect(await screen.findByRole('link', { name: 'Saved on another catalog page' })).toHaveAttribute('href', '#/beat-detail?id=later-page');
    expect(loader).toHaveBeenCalledWith('later-page');
  });

  it('ignores late saved-detail results from a previous account, including private data', async () => {
    writeFavoriteIds(new Set(['private-detail']), 'user-a');
    writeFavoriteIds(new Set(['public-b']), 'user-b');
    let resolveOld: (value: { asset: CatalogAsset }) => void = () => undefined;
    const loader = vi.fn().mockImplementationOnce(() => new Promise(resolve => { resolveOld = resolve; }))
      .mockResolvedValue({ asset: asset('public-b', { name: 'Account B public saved audio' }) });
    const view = render(<Library {...props} onLoadSavedAsset={loader} />);
    await waitFor(() => expect(loader).toHaveBeenCalledWith('private-detail'));
    view.rerender(<Library {...props} userId="user-b" onLoadSavedAsset={loader} />);
    await screen.findByRole('link', { name: 'Account B public saved audio' });
    resolveOld({ asset: asset('private-detail', { name: 'Private late response', publicationStatus: 'draft' }) });
    await waitFor(() => expect(screen.queryByText('Private late response')).not.toBeInTheDocument());
    expect(screen.getByRole('link', { name: 'Account B public saved audio' })).toBeInTheDocument();
  });

  it('removes only confirmed unavailable saved IDs on explicit request, retaining failed and unresolved IDs', async () => {
    const ids = ['gone', ...Array.from({ length: 23 }, (_, index) => `failed-${index}`), 'not-requested-yet'];
    writeFavoriteIds(new Set(ids), 'user-a');
    const loader = vi.fn(async (id: string) => id === 'gone' ? { notFound: true } : { error: 'Temporary network failure' });
    render(<Library {...props} onLoadSavedAsset={loader} />);
    const remove = await screen.findByRole('button', { name: 'Remove unavailable saved items' });
    expect(readFavoriteIds('user-a')).toEqual(new Set(ids));
    expect(loader).toHaveBeenCalledTimes(24);
    expect(loader).not.toHaveBeenCalledWith('not-requested-yet');
    fireEvent.click(remove);
    expect(readFavoriteIds('user-a')).toEqual(new Set(ids.filter(id => id !== 'gone')));
  });
});
