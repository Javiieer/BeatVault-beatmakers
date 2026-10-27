import { useEffect, useState } from 'react';
import { AudioLines, Download, Grid2X2, Heart, List, Play, RotateCcw, Search } from 'lucide-react';
import { PageHeader } from './ui';
import { useAccountFavorites } from '../data/accountFavorites';
import type { CatalogAsset } from '../data/localCatalog';
import { CatalogRepository, type CatalogSource } from '../data/catalogRepository';
import { loadBeatOrders, type BeatOrderView } from '../data/beatPurchases';
import type { AudioAsset } from '../types';
import { getQuery } from '../app/routing';
import '../styles/library.css';

type LibraryProps = {
  catalogAssets: CatalogAsset[];
  sessionPreviews: ReadonlyMap<string, string>;
  catalogSource: CatalogSource;
  catalogError?: string;
  onUpdateCatalogAsset?: (asset: CatalogAsset) => Promise<{ error?: string }>;
  onDeleteCatalogAsset?: (asset: CatalogAsset) => Promise<{ error?: string }>;
  embedded?: boolean;
  userId?: string;
  onPlay?: (asset: AudioAsset) => void;
  onLoadSavedAsset?: (id: string) => Promise<{ asset?: CatalogAsset; error?: string; notFound?: boolean }>;
};

type OrderState = { userId?: string; items: BeatOrderView[]; loading: boolean; error?: string };
const savedCatalog = new CatalogRepository();
const loadSavedAsset = (id: string) => savedCatalog.publishedDetail(id);

// Never promote an arbitrary API string into an executable/external download link.
function orderDownloads(order: BeatOrderView) {
  if (order.status !== 'paid') return [];
  const candidates = order.downloads?.length ? order.downloads.map(item => ({ ...item, label: item.format.toUpperCase() })) :
    order.downloadUrl ? [{ url: order.downloadUrl, label: 'Download' }] : [];
  return candidates.flatMap(item => {
    try {
      const url = new URL(item.url, window.location.origin);
      const format = url.searchParams.get('format');
      if (url.origin !== window.location.origin || url.hash || url.pathname !== `/api/orders/${encodeURIComponent(order.id)}/download` ||
        (url.search && (Array.from(url.searchParams).length !== 1 || !['mp3', 'wav'].includes(format || ''))) ||
        ('format' in item && format !== item.format)) return [];
      return [{ url: `${url.pathname}${url.search}`, label: item.label }];
    } catch { return []; }
  });
}

export function Library({ catalogAssets, catalogSource, catalogError, embedded = false, userId, onPlay, onLoadSavedAsset = loadSavedAsset }: LibraryProps) {
  const [query, setQuery] = useState(() => getQuery(window.location.hash).get('search') || '');
  const [kind, setKind] = useState('all');
  const [collection, setCollection] = useState('all');
  const [sort, setSort] = useState('name');
  const [view, setView] = useState<'list' | 'grid'>('list');
  const favorites = useAccountFavorites(userId);
  const [feedback, setFeedback] = useState('');
  const [retry, setRetry] = useState(0);
  const [orderState, setOrderState] = useState<OrderState>({ userId, items: [], loading: Boolean(userId) });
  const [savedLimit, setSavedLimit] = useState(24);
  const [savedRetry, setSavedRetry] = useState(0);
  const [savedState, setSavedState] = useState<{ userId?: string; items: CatalogAsset[]; loading: boolean; error?: string; unavailableIds: string[] }>({ userId, items: [], loading: false, unavailableIds: [] });
  const favoriteIds = favorites.ids;
  const savedIdsKey = JSON.stringify([...favoriteIds]);
  const orders = orderState.userId === userId ? orderState.items : [];
  const ordersLoading = Boolean(userId) && (orderState.userId !== userId || orderState.loading);

  useEffect(() => {
    const search = (event: Event) => {
      if (typeof (event as CustomEvent<unknown>).detail === 'string') setQuery((event as CustomEvent<string>).detail);
    };
    setFeedback('');
    setSavedLimit(24);
    window.addEventListener('beatvault:library-search', search);
    return () => {
      window.removeEventListener('beatvault:library-search', search);
    };
  }, [userId]);

  useEffect(() => {
    let active = true;
    setOrderState({ userId, items: [], loading: Boolean(userId) });
    if (userId) void loadBeatOrders().then(result => {
      if (!active) return;
      setOrderState(result.ok ? { userId, items: result.data.filter(order => order.status === 'paid'), loading: false } :
        { userId, items: [], loading: false, error: result.error.message });
    }).catch(() => {
      if (active) setOrderState({ userId, items: [], loading: false, error: 'Could not load your acquired audio. Try again.' });
    });
    return () => { active = false; };
  }, [userId, retry]);

  useEffect(() => {
    let active = true;
    setSavedState({ userId, items: [], loading: false, unavailableIds: [] });
    if (!userId) return;
    const ids: string[] = JSON.parse(savedIdsKey);
    const missing = ids.filter(id => catalogSource !== 'api' || catalogError || !catalogAssets.some(asset => asset.id === id && asset.publicationStatus === 'published')).slice(0, savedLimit);
    if (!missing.length) return;
    setSavedState({ userId, items: [], loading: true, unavailableIds: [] });
    void (async () => {
      const resolved: CatalogAsset[] = [];
      const unavailableIds: string[] = [];
      let hasError = false;
      for (let index = 0; index < missing.length && active; index += 4) {
        const batch = await Promise.allSettled(missing.slice(index, index + 4).map(id => onLoadSavedAsset(id)));
        for (const [offset, result] of batch.entries()) {
          if (result.status === 'rejected') { hasError = true; continue; }
          const requestedId = missing[index + offset];
          if (result.value.asset?.publicationStatus === 'published' && result.value.asset.id === requestedId) resolved.push(result.value.asset);
          else if (result.value.notFound === true && !result.value.asset) unavailableIds.push(requestedId);
          else hasError = true;
        }
      }
      if (active) setSavedState({ userId, items: resolved, loading: false, unavailableIds, error: hasError ? 'Some saved audio could not be loaded. Your saved IDs have been kept.' : undefined });
    })();
    return () => { active = false; };
  }, [userId, savedIdsKey, catalogAssets, catalogSource, catalogError, savedLimit, savedRetry, onLoadSavedAsset]);

  if (!userId) return <section className="library-page library-empty" aria-label="My library"><h2>Sign in to open your library</h2><p>Your saved audio and purchases are kept separate for each account.</p></section>;

  const loadedSaved = savedState.userId === userId ? savedState.items : [];
  const available = Array.from(new Map([...loadedSaved, ...(catalogSource === 'api' && !catalogError ? catalogAssets : [])].filter(asset => asset.publicationStatus === 'published' && favoriteIds.has(asset.id)).map(asset => [asset.id, asset])).values());
  const missingCount = [...favoriteIds].filter(id => catalogSource !== 'api' || catalogError || !catalogAssets.some(asset => asset.id === id && asset.publicationStatus === 'published')).length;
  const hasMoreSaved = missingCount > savedLimit;
  const unavailableIds = savedState.userId === userId ? savedState.unavailableIds.filter(id => favoriteIds.has(id)) : [];
  const unavailableCount = unavailableIds.length;
  const searchText = query.trim().toLocaleLowerCase('en');
  const saved = available.filter(asset => (kind === 'all' || (kind === 'beat' ? asset.productType === 'beat' || asset.type.toLowerCase() === 'beat' : asset.productType === 'sound' || asset.type.toLowerCase() === 'one-shot')) &&
    `${asset.name} ${asset.creatorName || ''} ${asset.tags.map(tag => tag.label).join(' ')}`.toLocaleLowerCase('en').includes(searchText))
    .sort((a, b) => sort === 'type' ? a.type.localeCompare(b.type) || a.name.localeCompare(b.name) : a.name.localeCompare(b.name));
  const acquired = orders.filter(order => kind !== 'one-shot' && order.title.toLocaleLowerCase('en').includes(searchText))
    .sort((a, b) => a.title.localeCompare(b.title));
  const shownCount = (collection !== 'acquired' ? saved.length : 0) + (collection !== 'saved' ? acquired.length : 0);
  const removeFavorite = async (id: string) => {
    const persisted = await favorites.change([id], false);
    setFeedback(persisted ? 'Removed from your saved audio.' : 'Your change was not confirmed. Please retry.');
  };
  const removeUnavailable = async () => {
    const persisted = await favorites.change(unavailableIds, false);
    setFeedback(persisted ? 'Removed unavailable items from your saved audio.' : 'Some changes were not confirmed. Please retry.');
  };
  const clearFilters = () => { setQuery(''); setKind('all'); setCollection('all'); setSort('name'); };

  return <section className={`library-page${embedded ? ' library-embedded' : ''}`} aria-label="My library">
    {!embedded && <PageHeader eyebrow="YOUR COLLECTION" title="My library" description="Saved public audio and purchases for this account." />}
    <div className="library-introduction"><div><h2>Your audio collection</h2><p>Saved audio follows your account across browsers. Acquired audio comes from confirmed orders.</p></div><a className="button ghost" href="#/studio">Manage my uploads</a></div>
    {favorites.loading && <p role="status">Loading saved audio from your account…</p>}
    {favorites.error && <div role="alert"><p>{favorites.error}</p><button type="button" className="button ghost" onClick={() => void favorites.refresh()}>Retry saved audio</button></div>}
    {favorites.warning && <p role="status">{favorites.warning}</p>}
    <section className="library-overview" aria-label="Library overview">
      <div><span>Saved audio</span><strong>{available.length}</strong><small>public items</small></div>
      <div><span>Acquired audio</span><strong>{orders.length}</strong><small>confirmed orders</small></div>
      <div><span>Results</span><strong>{shownCount}</strong><small>matching your filters</small></div>
    </section>
    <section className="library-controls" aria-label="Search and filter your library">
      <div className="library-toolbar">
        <label className="search" htmlFor="library-search"><Search size={17} aria-hidden="true" /><span className="sr-only">Search your library</span><input id="library-search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Search audio, creator or tag" /></label>
        <label className="library-sort" htmlFor="library-sort"><span>Sort</span><select id="library-sort" value={sort} onChange={event => setSort(event.target.value)}><option value="name">Name A–Z</option><option value="type">Audio type</option></select></label>
        <div className="view-toggle" role="group" aria-label="Library layout"><button type="button" className={view === 'list' ? 'active' : ''} aria-label="List view" aria-pressed={view === 'list'} onClick={() => setView('list')}><List size={17} /></button><button type="button" className={view === 'grid' ? 'active' : ''} aria-label="Grid view" aria-pressed={view === 'grid'} onClick={() => setView('grid')}><Grid2X2 size={17} /></button></div>
      </div>
      <div className="filter-chips" role="group" aria-label="Library collection">{[['all', 'All my audio'], ['saved', 'Saved'], ['acquired', 'Acquired']] .map(([value, label]) => <button type="button" key={value} className={collection === value ? 'active' : ''} aria-pressed={collection === value} onClick={() => setCollection(value)}>{label}</button>)}</div>
      <div className="filter-chips" role="group" aria-label="Library audio type">{[['all', 'All types'], ['beat', 'Beats'], ['one-shot', 'One-shots']].map(([value, label]) => <button type="button" key={value} className={kind === value ? 'active' : ''} aria-pressed={kind === value} onClick={() => setKind(value)}>{label}</button>)}</div>
    </section>
    {feedback && <p role="status" className="library-feedback">{feedback}</p>}
    {catalogError && <p role="status">The main catalog is unavailable. Saved audio is checked separately against the public catalog.</p>}
    {ordersLoading && <p role="status">Loading acquired audio…</p>}
    {savedState.userId === userId && savedState.loading && <p role="status">Loading saved audio…</p>}
    {savedState.userId === userId && savedState.error && <div className="library-load-error" role="alert"><p>{savedState.error}</p><button className="button ghost" type="button" onClick={() => setSavedRetry(value => value + 1)}>Retry saved audio</button></div>}
    {orderState.userId === userId && orderState.error && <div className="library-load-error" role="alert"><p>{orderState.error}</p><button className="button ghost" type="button" onClick={() => setRetry(value => value + 1)}>Retry acquired audio</button></div>}
    {unavailableCount > 0 && <div className="library-load-error"><p className="library-demo-note">{unavailableCount} saved {unavailableCount === 1 ? 'item is' : 'items are'} no longer in the public catalog.</p><button className="button ghost" type="button" disabled={favorites.busy || favorites.loading || Boolean(favorites.error)} onClick={() => void removeUnavailable()}>Remove unavailable saved items</button></div>}
    {collection !== 'acquired' && saved.length > 0 && <section className="panel library-panel" aria-label="Saved public audio"><h2>Saved audio</h2><div className={`library-personal-items${view === 'grid' ? ' grid-view' : ''}`}>{saved.map(asset => <article className="library-personal-item" key={asset.id}>
      <AudioLines size={24} aria-hidden="true" /><div className="library-personal-copy"><a href={`#/beat-detail?id=${encodeURIComponent(asset.id)}`}>{asset.name}</a><span>{asset.type} · {asset.creatorName || 'Creator'}</span><small>{asset.tags.map(tag => `#${tag.label}`).join(' ')}</small></div>
      <div className="library-personal-actions">{asset.previewUrl && onPlay && <button type="button" className="icon-button" aria-label={`Play preview for ${asset.name}`} onClick={() => onPlay({ ...asset, previewUrl: `/api/catalog/${encodeURIComponent(asset.id)}/preview`, downloadUrl: undefined })}><Play size={17} /></button>}<button type="button" className="icon-button" aria-label={`Remove ${asset.name} from saved audio`} disabled={favorites.busy || favorites.loading || Boolean(favorites.error)} onClick={() => void removeFavorite(asset.id)}><Heart size={17} fill="currentColor" /></button></div>
    </article>)}</div></section>}
    {collection !== 'acquired' && hasMoreSaved && <button className="button ghost" type="button" disabled={savedState.loading} onClick={() => setSavedLimit(value => value + 24)}>Load more saved audio</button>}
    {collection !== 'saved' && acquired.length > 0 && <section className="panel library-panel" aria-label="Acquired audio"><h2>Acquired audio</h2><div className={`library-personal-items${view === 'grid' ? ' grid-view' : ''}`}>{acquired.map(order => <article className="library-personal-item" key={order.id}>
      <AudioLines size={24} aria-hidden="true" /><div className="library-personal-copy"><strong>{order.title}</strong><span>Confirmed purchase · {order.offerLabel || order.offerId}</span>{order.usageSummary && <small>{order.usageSummary}</small>}</div><div className="library-personal-actions">{orderDownloads(order).length ? orderDownloads(order).map(download => <a key={download.url} className="button ghost" aria-label={`Download ${order.title}${download.label === 'Download' ? '' : ` (${download.label})`}`} href={download.url}><Download size={16} />{download.label}</a>) : <span>Download unavailable</span>}</div>
    </article>)}</div></section>}
    {!shownCount && !ordersLoading && !savedState.loading && !favorites.loading && !favorites.error && <section className="empty-state" role="status"><AudioLines size={26} aria-hidden="true" /><h2>{query || kind !== 'all' || collection !== 'all' ? 'No matching audio' : 'Your library is empty'}</h2><p>Save public audio in Explore or return after a purchase is confirmed.</p><a className="button" href="#/marketplace?tab=explore">Explore Marketplace</a>{(query || kind !== 'all' || collection !== 'all') && <button className="button ghost" type="button" onClick={clearFilters}><RotateCcw size={15} />Clear library filters</button>}</section>}
  </section>;
}
