import { useEffect, useState } from 'react';
import { ArrowLeft, AudioLines, Play, RotateCcw } from 'lucide-react';
import type { AudioAsset } from '../types';
import type { CatalogAsset } from '../data/localCatalog';
import { getQuery } from '../app/routing';
import { Badge, PageHeader } from './ui';

type DetailResult = { asset?: CatalogAsset; error?: string; notFound?: boolean };

export function BeatDetail({ onLoad, onPlay }: {
  onLoad: (id: string) => Promise<DetailResult>;
  onPlay: (asset: AudioAsset) => void;
}) {
  const id = getQuery(window.location.hash).get('id') || '';
  const [result, setResult] = useState<DetailResult>();
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    setResult(undefined);
    if (!id) { setResult({ notFound: true }); return; }
    void onLoad(id).then(value => { if (active) setResult(value); })
      .catch(() => { if (active) setResult({ error: 'The catalog could not be loaded. Please try again.' }); });
    return () => { active = false; };
  }, [id, onLoad, attempt]);
  const back = <a className="button ghost" href="#/marketplace"><ArrowLeft size={16} aria-hidden="true" /> Back to Marketplace</a>;
  if (!result) return <section className="panel empty-state" role="status"><h1>Loading beat…</h1>{back}</section>;
  if (result.error) return <section className="panel empty-state"><h1>Catalog unavailable</h1><p role="alert">{result.error}</p><button type="button" className="button" onClick={() => setAttempt(value => value + 1)}><RotateCcw size={16} /> Retry</button>{back}</section>;
  const asset = result.asset;
  if (!asset || result.notFound) return <section className="panel empty-state beat-not-found" role="status"><h1>Beat not found</h1><p>This link has no published catalog item available.</p>{back}</section>;
  return <>
    <PageHeader eyebrow="Marketplace / Published audio" title={asset.name} description="Listen to the public preview and review available offers." action={back} />
    <div className="beat-detail-layout">
      <section className="panel beat-hero">
        <div className="beat-cover">{asset.cover ? <img src={asset.cover} alt={`Cover for ${asset.name}`} /> : <AudioLines size={48} aria-hidden="true" />}</div>
        <div className="beat-copy">
          <div className="creator-line"><strong>{asset.creatorName || 'BeatVault creator'}</strong>{asset.ownerId && <a href={`#/store?id=${encodeURIComponent(asset.ownerId)}`}>View creator store</a>}</div>
          <div className="detail-tags">{asset.tags.map(tag => <Badge key={tag.label}>#{tag.label}</Badge>)}</div>
          {asset.previewUrl ? <button type="button" className="button" onClick={() => onPlay(asset)} aria-label={`Play preview of ${asset.name}`}><Play size={16} aria-hidden="true" /> Play preview</button> : <p className="preview-unavailable" role="status">Preview unavailable</p>}
        </div>
      </section>
      <aside className="panel beat-facts">
        <h2>Available offers</h2>
        {asset.purchaseOffers?.length ? asset.purchaseOffers.map(offer => <div key={offer.id}><strong>{offer.label}</strong><span>{new Intl.NumberFormat('en-US', { style: 'currency', currency: offer.currency }).format(offer.amountMinor / 100)}</span><span>{offer.deliverables.map(format => format.toUpperCase()).join(' + ')}</span></div>) : <p>This published audio has no active sale offers.</p>}
        <a className="button" href={`#/marketplace?tab=explore&search=${encodeURIComponent(asset.name)}`}>View in Marketplace</a>
      </aside>
    </div>
  </>;
}
