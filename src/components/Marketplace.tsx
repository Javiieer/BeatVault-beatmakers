import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowUpRight, AudioLines, CircleUserRound, Download, Play, Search, ShoppingBag } from 'lucide-react';
import type { AudioAsset } from '../types';
import type { CatalogAsset } from '../data/localCatalog';
import type { MarketplacePage } from '../data/catalogRepository';
import { creatorType } from '../data/creatorUploads';
import { Badge, PageHeader } from './ui';
import { tx } from '../i18n';
import { StripeConnectPanel } from './StripeConnectPanel';
import { createBeatCheckout, loadBeatOrders, type BeatOrderView } from '../data/beatPurchases';

type MarketKind = 'all' | 'Beat' | 'One-shot';

export function Marketplace({ catalogAssets, onPlay, onSearch }: { catalogAssets: CatalogAsset[]; onPlay: (asset: AudioAsset) => void; onSearch?: (filters: { query?: string; type?: 'beat' | 'sample'; tag?: string; cursor?: string; limit?: number }) => Promise<MarketplacePage> }) {
  const [query, setQuery] = useState('');
  const [kind, setKind] = useState<MarketKind>('all');
  const [tag, setTag] = useState('all');
  const [serverPage, setServerPage] = useState<MarketplacePage>();
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [orders, setOrders] = useState<BeatOrderView[]>([]);
  const [activeOffer, setActiveOffer] = useState<string>();
  const [purchaseError, setPurchaseError] = useState<string>();
  const checkoutKeys = useRef(new Map<string, string>());
  const checkoutParams = new URLSearchParams(window.location.hash.split('?')[1] || '');
  const checkoutResult = checkoutParams.get('checkout');
  const returnedOrderId = checkoutParams.get('order');
  const returnedOrder = orders.find(order => order.id === returnedOrderId);

  useEffect(() => {
    let active = true;
    let timer = 0;
    let attempts = 0;
    const refresh = async () => {
      const result = await loadBeatOrders();
      if (!active) return;
      if (result.ok) {
        setOrders(result.data);
        const isPaid = returnedOrderId && result.data.some(order => order.id === returnedOrderId && order.status === 'paid');
        if (checkoutResult === 'success' && returnedOrderId && !isPaid && attempts < 8) {
          attempts += 1;
          timer = window.setTimeout(() => void refresh(), 1500);
        }
      }
    };
    void refresh();
    return () => { active = false; window.clearTimeout(timer); };
  }, [checkoutResult, returnedOrderId]);

  const buyBeat = async (contentId: string, offerId: string) => {
    const purchaseKey = `${contentId}:${offerId}`;
    const idempotencyKey = checkoutKeys.current.get(purchaseKey) || window.crypto.randomUUID();
    checkoutKeys.current.set(purchaseKey, idempotencyKey);
    setActiveOffer(purchaseKey);
    setPurchaseError(undefined);
    const result = await createBeatCheckout(contentId, offerId, idempotencyKey);
    if (result.ok) {
      checkoutKeys.current.delete(purchaseKey);
      window.location.assign(result.data.url);
    } else {
      if (result.error.code !== 'NETWORK_ERROR' && result.error.code !== 'TIMEOUT') checkoutKeys.current.delete(purchaseKey);
      setPurchaseError(result.error.message);
    }
    setActiveOffer(undefined);
  };

  useEffect(() => {
    if (!onSearch) return;
    let active = true;
    const timer = window.setTimeout(() => {
      setLoading(true);
      void onSearch({ query, type: kind === 'all' ? undefined : kind === 'Beat' ? 'beat' : 'sample', tag: tag === 'all' ? undefined : tag, limit: 24 })
        .then(page => { if (active) setServerPage(page); })
        .finally(() => { if (active) setLoading(false); });
    }, 180);
    return () => { active = false; window.clearTimeout(timer); };
  }, [onSearch, query, kind, tag]);

  const published = useMemo(() => catalogAssets.filter(asset => asset.publicationStatus === 'published' && creatorType(asset.type)), [catalogAssets]);
  const tags = useMemo(() => Array.from(new Set(published.flatMap(asset => asset.tags.map(item => item.label.trim()).filter(Boolean)))).sort((a, b) => a.localeCompare(b, 'es')), [published]);
  const visible = (serverPage?.assets ?? published).filter(asset => {
    const assetKind = creatorType(asset.type);
    const searchable = `${asset.name} ${asset.creatorName ?? ''} ${asset.tags.map(item => item.label).join(' ')}`.toLocaleLowerCase('es');
    return (kind === 'all' || assetKind === kind) &&
      (tag === 'all' || asset.tags.some(item => item.label === tag)) &&
      (!query.trim() || searchable.includes(query.trim().toLocaleLowerCase('es')));
  });
  const beatCount = published.filter(asset => creatorType(asset.type) === 'Beat').length;
  const oneShotCount = published.filter(asset => creatorType(asset.type) === 'One-shot').length;
  const listingTotal = serverPage?.total ?? published.length;
  const loadMore = async () => {
    if (!onSearch || !serverPage?.nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const next = await onSearch({ query, type: kind === 'all' ? undefined : kind === 'Beat' ? 'beat' : 'sample', tag: tag === 'all' ? undefined : tag, cursor: serverPage.nextCursor, limit: 24 });
      setServerPage(current => current ? { ...next, assets: [...current.assets, ...next.assets] } : next);
    } finally { setLoadingMore(false); }
  };
  const clearFilters = () => { setQuery(''); setKind('all'); setTag('all'); };

  return <>
    <PageHeader
      eyebrow={tx('market.eyebrow')}
      title={tx('market.title')}
      description={tx('market.description')}
      action={<a className="button" href="#/upload">{tx('market.publish')} <ArrowUpRight size={16} aria-hidden="true" /></a>}
    />

    <section className="market-summary" aria-label={tx('market.summary')}>
      <div><strong>{serverPage?.total ?? published.length}</strong><span>{tx('market.listings')}</span></div>
      <div><strong>{beatCount}</strong><span>{tx('market.beats')}</span></div>
      <div><strong>{oneShotCount}</strong><span>{tx('market.oneShots')}</span></div>
      <Badge tone="muted"><ShoppingBag size={13} aria-hidden="true" /> {tx('market.noPurchases')}</Badge>
    </section>

    <StripeConnectPanel />

    {checkoutResult === 'success' && <p className="market-checkout-status" role="status">{returnedOrder?.status === 'paid' ? 'Payment confirmed. Your beat is ready to download below.' : 'Payment submitted. Your download appears here once Stripe confirms it.'}</p>}
    {checkoutResult === 'cancelled' && <p className="market-checkout-status" role="status">Checkout canceled. No payment was recorded.</p>}

    {orders.length > 0 && <section className="market-purchases" aria-label="Your beat purchases">
      <h2>Your purchases</h2>
      {orders.map(order => <div className="market-purchase-row" key={order.id}>
        <div><strong>{order.title}</strong><span>{order.status === 'paid' ? 'Paid' : order.status === 'pending' ? 'Payment pending' : order.status === 'failed' ? 'Payment failed' : order.status === 'refunded' ? 'Refunded' : 'Under dispute'} · {new Intl.NumberFormat('en-US', { style: 'currency', currency: order.currency.toUpperCase() }).format(order.amountMinor / 100)}</span></div>
        {order.downloadUrl && <a className="button ghost" href={order.downloadUrl}><Download size={15} aria-hidden="true" /> Download</a>}
      </div>)}
    </section>}
    {purchaseError && <p className="form-error" role="alert">{purchaseError}</p>}

    <section className="market-toolbar" aria-label={tx('market.filters')}>
      <label className="search" htmlFor="market-search">
        <Search size={18} aria-hidden="true" />
        <span className="sr-only">{tx('market.search')}</span>
        <input id="market-search" value={query} onChange={event => setQuery(event.target.value)} placeholder={tx('market.search')} />
      </label>
      <div className="market-filter-group" role="group" aria-label={tx('market.audioType')}>
        {([
          ['all', tx('market.all')], ['Beat', tx('market.beats')], ['One-shot', tx('market.oneShots')],
        ] as const).map(([value, label]) => <button key={value} type="button" className={kind === value ? 'active' : ''} aria-pressed={kind === value} onClick={() => setKind(value)}>{label}</button>)}
      </div>
      <label className="market-tag-filter" htmlFor="market-tag">
        <span className="sr-only">{tx('market.style')}</span>
        <select id="market-tag" value={tag} onChange={event => setTag(event.target.value)}>
          <option value="all">{tx('market.style')}</option>
          {tags.map(item => <option key={item} value={item}>{item}</option>)}
        </select>
      </label>
    </section>

    {serverPage?.error && <p className="form-error" role="alert">{tx('market.apiUnavailable')}</p>}
    {loading && !serverPage && <p role="status">{tx('market.loading')}</p>}
    {visible.length ? <>
      <section className="market-grid" aria-label={tx('market.published')}>
      {visible.map(asset => <article className="market-card" key={asset.id}>
        <div className="market-artwork">
          {asset.cover ? <img src={asset.cover} alt={tx('market.cover', { name: asset.name })} loading="lazy" /> : <AudioLines size={34} aria-hidden="true" />}
          <span className="market-kind">{creatorType(asset.type)}</span>
        </div>
        <div className="market-card-body">
          <div className="market-card-title">
            <div><h2>{asset.name}</h2><p>{asset.tags.length ? asset.tags.map(item => `#${item.label}`).join(' ') : tx('market.noTags')}</p></div>
          </div>
          <a className="market-creator" href={asset.ownerId ? `#/profile?id=${encodeURIComponent(asset.ownerId)}` : undefined} aria-disabled={!asset.ownerId || undefined}>
            <CircleUserRound size={16} aria-hidden="true" />
            <span>{asset.creatorName || tx('market.producer')}</span>
          </a>
          <div className="market-card-footer">
            <span>{asset.metadata.format}{asset.metadata.duration && asset.metadata.duration !== '--' ? ` · ${asset.metadata.duration}` : ''}</span>
            {asset.previewUrl ? <button type="button" className="button market-play" onClick={() => onPlay(asset)} aria-label={tx('market.listen', { name: asset.name })}><Play size={15} fill="currentColor" aria-hidden="true" /> {tx('market.preview')}</button> : <span className="market-no-preview" role="status">{tx('market.previewUnavailable')}</span>}
          </div>
          {asset.purchaseOffers?.map(offer => <button key={offer.id} type="button" className="button market-buy" disabled={Boolean(activeOffer)} onClick={() => void buyBeat(asset.id, offer.id)}>
            <ShoppingBag size={15} aria-hidden="true" /> {activeOffer === `${asset.id}:${offer.id}` ? 'Opening checkout…' : `${offer.label} · ${new Intl.NumberFormat('en-US', { style: 'currency', currency: offer.currency }).format(offer.amountMinor / 100)}`}
          </button>)}
        </div>
      </article>)}
      </section>
      {serverPage?.nextCursor && <div className="market-load-more"><button type="button" className="button ghost" disabled={loadingMore} onClick={() => void loadMore()}>{loadingMore ? tx('market.loadingMore') : tx('market.loadMore')}</button></div>}
    </> : <section className="market-empty" role="status">
      <AudioLines size={28} aria-hidden="true" />
      <h2>{listingTotal ? tx('market.noMatches') : tx('market.emptyTitle')}</h2>
      <p>{listingTotal ? tx('market.changeFilters') : tx('market.emptyBody')}</p>
      {listingTotal > 0 && <button type="button" className="button ghost" onClick={clearFilters}>{tx('market.clear')}</button>}
      {!listingTotal && <a className="button" href="#/upload">{tx('market.upload')} <ArrowUpRight size={16} aria-hidden="true" /></a>}
    </section>}
  </>;
}
