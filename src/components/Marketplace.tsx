import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ArrowUpRight, AudioLines, CircleUserRound, Download, Heart, Play, Search, ShoppingBag } from 'lucide-react';
import type { AudioAsset } from '../types';
import type { CatalogAsset } from '../data/localCatalog';
import type { MarketplaceFilters, MarketplacePage } from '../data/catalogRepository';
import { creatorType } from '../data/creatorUploads';
import { useAccountFavorites } from '../data/accountFavorites';
import { Badge, PageHeader } from './ui';
import { tx } from '../i18n';
import { loadBeatOrders, type BeatOrderView } from '../data/beatPurchases';
import { useBeatCheckout } from '../data/useBeatCheckout';
import { loginHref } from '../app/routing';

type MarketKind = 'all' | 'Beat' | 'One-shot';
export type MarketplaceTab = 'explore' | 'library' | 'purchases';
const validTab = (value?: string | null): MarketplaceTab => value === 'library' || value === 'purchases' ? value : 'explore';
const hashParams = () => new URLSearchParams(window.location.hash.split('?')[1] || '');
const initialMarketplaceTab = (fallback?: MarketplaceTab): MarketplaceTab => {
  const params = hashParams();
  if (params.has('tab')) return validTab(params.get('tab'));
  return ['success', 'cancelled'].includes(params.get('checkout') || '') ? 'purchases' : validTab(fallback);
};
const hashKind = (): MarketKind => hashParams().get('type') === 'beat' ? 'Beat' : hashParams().get('type') === 'sample' ? 'One-shot' : 'all';
const formatAmount = (amount: number, currency: string) => new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(amount / 100);
const isPublished = (asset: CatalogAsset) => asset.publicationStatus === 'published' && Boolean(creatorType(asset.type));
const orderStatusLabel: Record<BeatOrderView['status'], string> = { pending: 'Payment pending', paid: 'Paid', failed: 'Payment failed', refund_pending: 'Refund pending', refunded: 'Refunded', partially_refunded: 'Partially refunded', disputed: 'Under dispute' };
const offerUnavailable = (reason?: string) => reason === 'STEMS_UNAVAILABLE' ? 'Stems are not available for this offer.' : reason === 'PAYMENTS_NOT_CONFIGURED' ? 'Test checkout is not configured.' : 'This offer is not available for download yet.';
const downloadLink = (order: BeatOrderView, supplied?: string) => {
  if (order.status !== 'paid' || !supplied) return undefined;
  try {
    const url = new URL(supplied, window.location.origin);
    const expected = `/api/orders/${encodeURIComponent(order.id)}/download`;
    const params = [...url.searchParams.entries()];
    const validQuery = params.length === 0 || params.length === 1 && params[0][0] === 'format' && ['mp3', 'wav'].includes(params[0][1]);
    return url.origin === window.location.origin && url.pathname === expected && !url.hash && validQuery ? `${expected}${url.search}` : undefined;
  } catch { return undefined; }
};
const orderDownloads = (order: BeatOrderView) => {
  if (order.downloads?.length) return order.downloads.flatMap(download => {
    const href = downloadLink(order, download.url);
    return href && new URL(href, window.location.origin).searchParams.get('format') === download.format ? [{ href, label: `Download ${download.format.toUpperCase()}` }] : [];
  });
  const href = downloadLink(order, order.downloadUrl);
  return href ? [{ href, label: 'Download' }] : [];
};

export function Marketplace({ catalogAssets, onPlay, onSearch, creatorId, libraryContent, userId, initialTab }: {
  catalogAssets: CatalogAsset[]; onPlay: (asset: AudioAsset) => void;
  onSearch?: (filters: MarketplaceFilters) => Promise<MarketplacePage>; creatorId?: string;
  libraryContent?: ReactNode; userId?: string; initialTab?: MarketplaceTab;
}) {
  const [tab, setTab] = useState<MarketplaceTab>(() => initialMarketplaceTab(initialTab));
  const [query, setQuery] = useState(() => (hashParams().get('search') || hashParams().get('q') || '').slice(0, 80));
  const [kind, setKind] = useState<MarketKind>(hashKind);
  const [tag, setTag] = useState(() => hashParams().get('tag') || 'all');
  const [serverPage, setServerPage] = useState<MarketplacePage>();
  const [loading, setLoading] = useState(Boolean(onSearch));
  const [loadingMore, setLoadingMore] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [searchRevision, setSearchRevision] = useState(0);
  const searchVersion = useRef(0);
  const [orders, setOrders] = useState<BeatOrderView[]>([]);
  const [ordersOwner, setOrdersOwner] = useState<string>();
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [ordersError, setOrdersError] = useState('');
  const [ordersRevision, setOrdersRevision] = useState(0);
  const { activeOffer, purchaseError, buyBeat } = useBeatCheckout(userId);
  const favorites = useAccountFavorites(userId);
  const favoriteIds = favorites.ids;
  const [favoriteMessage, setFavoriteMessage] = useState('');
  const checkoutParams = new URLSearchParams(window.location.hash.split('?')[1] || '');
  const checkoutResult = checkoutParams.get('checkout');
  const returnedOrderId = checkoutParams.get('order');
  const privateOrders = ordersOwner === userId ? orders : [];
  const returnedOrder = privateOrders.find(order => order.id === returnedOrderId);

  useEffect(() => { setTab(initialMarketplaceTab(initialTab)); }, [initialTab]);
  useEffect(() => {
    const sync = () => {
      const params = hashParams();
      setTab(initialMarketplaceTab(initialTab));
      setKind(hashKind());
      setQuery((params.get('search') || params.get('q') || '').slice(0, 80));
      setTag(params.get('tag') || 'all');
    };
    window.addEventListener('hashchange', sync);
    return () => window.removeEventListener('hashchange', sync);
  }, [initialTab]);
  const selectTab = (next: MarketplaceTab) => {
    setTab(next);
    const params = new URLSearchParams(window.location.hash.split('?')[1] || '');
    params.set('tab', next);
    window.history.pushState(null, '', `#/marketplace?${params.toString()}`);
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  };
  const updateFilters = (values: { query?: string; kind?: MarketKind; tag?: string }) => {
    const nextQuery = (values.query ?? query).slice(0, 80);
    const nextKind = values.kind ?? kind;
    const nextTag = values.tag ?? tag;
    setQuery(nextQuery); setKind(nextKind); setTag(nextTag);
    const params = hashParams();
    params.delete('q');
    if (nextQuery) params.set('search', nextQuery); else params.delete('search');
    if (nextKind === 'all') params.delete('type'); else params.set('type', nextKind === 'Beat' ? 'beat' : 'sample');
    if (nextTag === 'all') params.delete('tag'); else params.set('tag', nextTag);
    const path = window.location.hash.split('?')[0] || '#/marketplace';
    window.history.replaceState(null, '', `${path}${params.size ? `?${params}` : ''}`);
  };
  const toggleFavorite = async (id: string) => {
    if (!userId) { setFavoriteMessage('Sign in to save audio to your library.'); return; }
    const saved = !favoriteIds.has(id);
    const persisted = await favorites.change([id], saved);
    setFavoriteMessage(persisted ? saved ? 'Saved to your account library.' : 'Removed from your account library.' : 'Your change was not confirmed. Please retry.');
  };

  useEffect(() => {
    if (!userId || creatorId || tab !== 'purchases') return;
    let active = true;
    let timer = 0;
    let attempts = 0;
    setOrders([]); setOrdersLoading(true); setOrdersError('');
    const refresh = async () => {
      try {
        const result = await loadBeatOrders();
        if (!active) return;
        if (!result.ok) { setOrdersError(result.error.message); return; }
        setOrders(result.data); setOrdersOwner(userId);
        const confirmed = returnedOrderId && result.data.some(order => order.id === returnedOrderId && order.status === 'paid');
        if (checkoutResult === 'success' && returnedOrderId && !confirmed && attempts < 8) { attempts += 1; timer = window.setTimeout(() => void refresh(), 1500); }
      } catch { if (active) setOrdersError('Could not load your purchases. Please retry.'); }
      finally { if (active) setOrdersLoading(false); }
    };
    void refresh();
    return () => { active = false; window.clearTimeout(timer); };
  }, [userId, creatorId, tab, checkoutResult, returnedOrderId, ordersRevision]);


  useEffect(() => {
    const version = ++searchVersion.current;
    if (!onSearch) { setLoading(false); return; }
    setLoading(true); setSearchError(''); setLoadingMore(false);
    const timer = window.setTimeout(() => {
      void onSearch({ query, type: kind === 'all' ? undefined : kind === 'Beat' ? 'beat' : 'sample', tag: tag === 'all' ? undefined : tag, creatorId, limit: 24 })
        .then(page => { if (version === searchVersion.current) { setServerPage(page); setSearchError(page.error || ''); } })
        .catch(() => { if (version === searchVersion.current) { setServerPage(undefined); setSearchError('Could not load the catalog. Please retry.'); } })
        .finally(() => { if (version === searchVersion.current) setLoading(false); });
    }, 180);
    return () => { window.clearTimeout(timer); if (version === searchVersion.current) searchVersion.current += 1; };
  }, [onSearch, query, kind, tag, creatorId, searchRevision]);

  const published = useMemo(() => catalogAssets.filter(isPublished), [catalogAssets]);
  const publicPageAssets = serverPage?.source === 'api' ? serverPage.assets.filter(isPublished) : [];
  const displayAssets = creatorId ? publicPageAssets.filter(asset => asset.ownerId === creatorId && Boolean(asset.purchaseOffers?.length)) : onSearch ? publicPageAssets : published;
  const storeName = displayAssets.find(asset => asset.creatorName)?.creatorName || 'Creator store';
  const tags = useMemo(() => Array.from(new Set(displayAssets.flatMap(asset => asset.tags.map(item => item.label.trim()).filter(Boolean)))).sort((a, b) => a.localeCompare(b, 'es')), [displayAssets]);
  const visible = displayAssets.filter(asset => {
    const searchable = `${asset.name} ${asset.creatorName ?? ''} ${asset.tags.map(item => item.label).join(' ')}`.toLocaleLowerCase('es');
    return (kind === 'all' || creatorType(asset.type) === kind) && (tag === 'all' || asset.tags.some(item => item.label === tag)) && (!query.trim() || searchable.includes(query.trim().toLocaleLowerCase('es')));
  });
  const listingTotal = serverPage?.total ?? published.length;
  const loadMore = async () => {
    if (!onSearch || !serverPage?.nextCursor || loadingMore || loading) return;
    const version = searchVersion.current;
    setLoadingMore(true); setSearchError('');
    try {
      const next = await onSearch({ query, type: kind === 'all' ? undefined : kind === 'Beat' ? 'beat' : 'sample', tag: tag === 'all' ? undefined : tag, creatorId, cursor: serverPage.nextCursor, limit: 24 });
      if (version !== searchVersion.current) return;
      if (next.error || next.source !== 'api') { setSearchError(next.error || 'Could not load more audio.'); return; }
      setServerPage(current => current ? { ...next, assets: [...new Map([...current.assets, ...next.assets].map(asset => [asset.id, asset])).values()] } : next);
    } catch { if (version === searchVersion.current) setSearchError('Could not load more audio. Please retry.'); }
    finally { if (version === searchVersion.current) setLoadingMore(false); }
  };
  const clearFilters = () => updateFilters({ query: '', kind: 'all', tag: 'all' });
  const showExplore = Boolean(creatorId) || tab === 'explore';

  return <div className={creatorId ? 'market-store-view' : 'marketplace-view'}>
    {creatorId ? <PageHeader eyebrow="BEATVAULT · CREATOR STORE" title={storeName} description="Public beats and one-shots available from this seller." action={<a className="button ghost" href="#/marketplace">Back to Marketplace</a>} /> : <PageHeader eyebrow={tx('market.eyebrow')} title={tx('market.title')} description="Discover audio, save favorites and access your purchases in one place." action={<a className="button" href="#/upload">{tx('market.publish')} <ArrowUpRight size={16} aria-hidden="true" /></a>} />}
    {!creatorId && <nav className="market-tabs" aria-label="Marketplace sections">{([['explore', 'Explore'], ['library', 'My library'], ['purchases', 'My purchases']] as const).map(([value, label]) => <button key={value} type="button" aria-current={tab === value ? 'page' : undefined} onClick={() => selectTab(value)}>{label}</button>)}</nav>}
    {!showExplore && !userId && <section className="market-empty" role="status"><ShoppingBag size={28} aria-hidden="true" /><h2>Sign in to access {tab === 'library' ? 'your library' : 'your purchases'}</h2><p>Your saved audio and orders are private to your account.</p><a className="button" href={loginHref()}>Sign in</a></section>}
    {!creatorId && tab === 'library' && userId && <section aria-label="My library">{libraryContent ?? <div className="market-empty"><h2>Your library is empty</h2><p>Save audio from Explore to keep it here.</p><button className="button" onClick={() => selectTab('explore')}>Explore audio</button></div>}</section>}
    {!creatorId && tab === 'purchases' && userId && <section className="market-purchases" aria-label="Your beat purchases">
      <h2>My purchases</h2><p className="market-section-description">Orders and downloads appear only after payment is confirmed by the server.</p>
      {checkoutResult === 'success' && <p className="market-checkout-status" role="status">{returnedOrder?.status === 'paid' ? 'Payment confirmed. Your beat is ready to download below.' : 'Payment submitted. Your download appears here once Mercado Pago confirms it.'}</p>}
      {checkoutResult === 'cancelled' && <p className="market-checkout-status" role="status">Checkout canceled. Check your order status below.</p>}
      {ordersLoading && <p role="status">Loading your purchases…</p>}
      {ordersError && <div className="market-error" role="alert"><p>{ordersError}</p><button type="button" className="button ghost" onClick={() => setOrdersRevision(value => value + 1)}>Retry purchases</button></div>}
      {!ordersLoading && !ordersError && !privateOrders.length && <div className="market-empty" role="status"><ShoppingBag size={28} aria-hidden="true" /><h2>No purchases yet</h2><p>Your confirmed purchases will appear here.</p><button type="button" className="button" onClick={() => selectTab('explore')}>Explore audio</button></div>}
      {!ordersError && privateOrders.map(order => <div className="market-purchase-row" key={order.id}>
        <div><strong>{order.title}</strong><span>{orderStatusLabel[order.status]} · {formatAmount(order.amountMinor, order.currency.toUpperCase())}</span>
          {order.offerLabel && <span>{order.offerLabel}{order.deliverables?.length ? ` · ${order.deliverables.map(format => format.toUpperCase()).join(' + ')}` : ''}</span>}
          {order.usageSummary && <span className="market-purchase-license">{order.usageSummary}</span>}
          {order.termsVersion && <span>License version: {order.termsVersion}</span>}
        </div>
        <div className="market-purchase-downloads">{orderDownloads(order).map(download => <a key={download.href} className="button ghost" href={download.href}><Download size={15} aria-hidden="true" />{download.label}</a>)}{order.status === 'paid' && !orderDownloads(order).length && <span role="status">Download unavailable</span>}</div>
      </div>)}
    </section>}
    {showExplore && <>
      {!creatorId && <section className="market-summary" aria-label={tx('market.summary')}><div><strong>{listingTotal}</strong><span>{tx('market.listings')}</span></div><div><strong>{displayAssets.filter(asset => creatorType(asset.type) === 'Beat').length}</strong><span>{tx('market.beats')} on this page</span></div><div><strong>{displayAssets.filter(asset => creatorType(asset.type) === 'One-shot').length}</strong><span>{tx('market.oneShots')} on this page</span></div><Badge tone="muted">Local test environment</Badge></section>}
      {checkoutResult && !creatorId && <p className="market-checkout-status">Review payment status in <button className="market-inline-link" onClick={() => selectTab('purchases')}>My purchases</button>.</p>}
      {purchaseError && <p className="form-error" role="alert">{purchaseError}</p>}{favoriteMessage && <p className="market-save-status" role="status">{favoriteMessage}</p>}
      {favorites.error && <div role="alert"><p>{favorites.error}</p><button type="button" className="button ghost" onClick={() => void favorites.refresh()}>Retry saved audio</button></div>}
      {favorites.warning && <p role="status">{favorites.warning}</p>}
      <section className="market-toolbar" aria-label={tx('market.filters')}>
        <label className="search" htmlFor="market-search"><Search size={18} aria-hidden="true" /><span className="sr-only">{tx('market.search')}</span><input id="market-search" value={query} maxLength={80} onChange={event => updateFilters({ query: event.target.value })} placeholder={tx('market.search')} /></label>
        <div className="market-filter-group" role="group" aria-label={tx('market.audioType')}>{([['all', tx('market.all')], ['Beat', tx('market.beats')], ['One-shot', tx('market.oneShots')]] as const).map(([value, label]) => <button key={value} type="button" className={kind === value ? 'active' : ''} aria-pressed={kind === value} onClick={() => updateFilters({ kind: value })}>{label}</button>)}</div>
        <label className="market-tag-filter" htmlFor="market-tag"><span className="sr-only">{tx('market.style')}</span><select id="market-tag" value={tag} onChange={event => updateFilters({ tag: event.target.value })}><option value="all">{tx('market.style')}</option>{tags.map(item => <option key={item} value={item}>{item}</option>)}</select></label>
      </section>
      {searchError && <div className="market-error" role="alert"><p>{tx('market.apiUnavailable')}</p><button type="button" className="button ghost" onClick={() => setSearchRevision(value => value + 1)}>Retry catalog</button></div>}{loading && <p role="status">{tx('market.loading')}</p>}
      {visible.length ? <><section className="market-grid" aria-label={tx('market.published')}>
        {visible.map(asset => <article className="market-card" key={asset.id}>
          <a className="market-artwork" href={`#/beat-detail?id=${encodeURIComponent(asset.id)}`} aria-label={`View ${asset.name}`}>{asset.cover ? <img src={asset.cover} alt={tx('market.cover', { name: asset.name })} loading="lazy" /> : <AudioLines size={34} aria-hidden="true" />}<span className="market-kind">{creatorType(asset.type)}</span></a>
          <div className="market-card-body"><div className="market-card-title"><h2><a href={`#/beat-detail?id=${encodeURIComponent(asset.id)}`}>{asset.name}</a></h2><p>{asset.tags.length ? asset.tags.map(item => `#${item.label}`).join(' ') : tx('market.noTags')}</p></div>
            {asset.ownerId ? <a className="market-creator" href={`#/store?id=${encodeURIComponent(asset.ownerId)}`}><CircleUserRound size={16} aria-hidden="true" /><span>{asset.creatorName || tx('market.producer')}</span></a> : <span className="market-creator"><CircleUserRound size={16} aria-hidden="true" />{asset.creatorName || tx('market.producer')}</span>}
            <div className="market-card-footer"><span>{asset.metadata.format}{asset.metadata.duration && asset.metadata.duration !== '--' ? ` · ${asset.metadata.duration}` : ''}</span>{asset.previewUrl ? <button type="button" className="button market-play" onClick={() => onPlay(asset)} aria-label={tx('market.listen', { name: asset.name })}><Play size={15} fill="currentColor" aria-hidden="true" /> {tx('market.preview')}</button> : <span className="market-no-preview" role="status">{tx('market.previewUnavailable')}</span>}</div>
            <button className="button ghost market-save" type="button" aria-pressed={userId ? favoriteIds.has(asset.id) : false} aria-label={`${userId && favoriteIds.has(asset.id) ? 'Remove' : 'Save'} ${asset.name} ${userId && favoriteIds.has(asset.id) ? 'from' : 'to'} my library`} disabled={Boolean(userId) && (favorites.loading || favorites.busy || Boolean(favorites.error))} onClick={() => void toggleFavorite(asset.id)}><Heart size={15} fill={userId && favoriteIds.has(asset.id) ? 'currentColor' : 'none'} aria-hidden="true" />{userId && favoriteIds.has(asset.id) ? 'Saved' : 'Save to library'}</button>
            {asset.purchaseOffers?.map(offer => <div className="market-offer" key={offer.id}><button type="button" className="button market-buy" disabled={Boolean(activeOffer) || offer.available === false} onClick={() => void buyBeat(asset.id, offer.id)}><ShoppingBag size={15} aria-hidden="true" />{activeOffer === `${asset.id}:${offer.id}` ? 'Opening checkout…' : `${offer.label} · ${formatAmount(offer.amountMinor, offer.currency)}`}</button>{offer.deliverables.length > 0 && <span className="market-offer-formats">{offer.deliverables.map(format => format.toUpperCase()).join(' + ')}</span>}{offer.available === false && <p className="market-offer-unavailable">{offerUnavailable(offer.unavailableReason)}</p>}</div>)}
          </div>
        </article>)}
      </section>{serverPage?.nextCursor && <div className="market-load-more"><button type="button" className="button ghost" disabled={loadingMore || loading} onClick={() => void loadMore()}>{loadingMore ? tx('market.loadingMore') : tx('market.loadMore')}</button></div>}</> : !loading && !searchError && <section className="market-empty" role="status"><AudioLines size={28} aria-hidden="true" /><h2>{creatorId ? 'No public offers yet' : listingTotal ? tx('market.noMatches') : tx('market.emptyTitle')}</h2><p>{creatorId ? 'This seller has no public beats or one-shots available right now.' : listingTotal ? tx('market.changeFilters') : tx('market.emptyBody')}</p>{!creatorId && listingTotal > 0 && <button type="button" className="button ghost" onClick={clearFilters}>{tx('market.clear')}</button>}{!creatorId && !listingTotal && <a className="button" href="#/upload">{tx('market.upload')} <ArrowUpRight size={16} aria-hidden="true" /></a>}</section>}
    </>}
  </div>;
}
