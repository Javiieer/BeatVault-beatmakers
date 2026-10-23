import { useEffect, useRef, useState } from "react";
import { Archive, ArrowUpFromLine, BadgeDollarSign, Check, Download, Music2, Pencil, Play, RotateCcw, Search, Upload as UploadIcon, X } from "lucide-react";
import { PageHeader } from "./ui";
import type { AudioAsset } from "../types";
import type { CatalogAsset, CatalogStatus } from "../data/localCatalog";
import { creatorType, creatorTypes, uploadCovers, uploadStatusLabels } from "../data/creatorUploads";
import { readUploadDraft } from "../data/localUploadDraft";
import { getAccountStorageUsage, type AccountStorageUsage } from "../api/client";
import { BeatSaleListingForm } from './BeatSaleListingForm';
import type { ApiResult } from '../domains/core/contracts';
import type { BeatListingInput, BeatListingRecord } from '../domains/marketplace/sellerListings';
import { tx } from '../i18n';

const formatBytes = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let value = bytes / 1024; let unit = 0;
  while (value >= 1024 && unit < units.length - 1) { value /= 1024; unit++ }
  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[unit]}`;
};

export function UploadCard({ asset, onPlay, onEdit, onArchive, onRetryPreview, onPrepareSale, listing, retrying = false, busy = false }: {
  asset: CatalogAsset; onPlay: (asset: AudioAsset) => void; onEdit?: () => void; onArchive?: () => void; onRetryPreview?: () => void; onPrepareSale?: () => void; listing?: BeatListingRecord; retrying?: boolean; busy?: boolean;
}) {
  return <article className="creator-upload-card">
    <img className="creator-upload-cover" src={asset.cover || uploadCovers[0].url} alt="" loading="lazy" decoding="async" />
    <div className="creator-upload-copy">
      <span className="eyebrow">{creatorType(asset.type)}</span>
      <h2 title={asset.name}>{asset.name}</h2>
      <span className={`publication-pill ${asset.publicationStatus}`}>{uploadStatusLabels[asset.publicationStatus]}</span>
      {asset.assetId && asset.previewReady === false && <p className="creator-preview-pending">Preview público pendiente</p>}
      {asset.publicationStatus === 'rejected' && asset.reviewNote && <p className="creator-upload-review-note">Motivo: {asset.reviewNote}</p>}
      {listing && <span className="beat-listing-private-status">{tx('seller.privateBadge')}</span>}
      {listing?.communityReview && <p className={`seller-admin-review-status${listing.communityReview.current ? '' : ' stale'}`}>
        {listing.communityReview.current ? listing.communityReview.decision === 'approve' || listing.communityReview.decision === 'recommend' ? 'Community Manager approved the commercial review. Publication and sales remain separate.' : 'Community Manager requested changes.' : 'Community Manager review is outdated because the listing or evidence changed.'}
        {' '}{listing.communityReview.note}
      </p>}
      {listing?.adminReview && <p className={`seller-admin-review-status${listing.adminReview.current ? '' : ' stale'}`}>
        {listing.adminReview.current ? listing.adminReview.decision === 'approve' ? 'Admin approved the commercial review. Publication and sales remain separate.' : listing.adminReview.decision === 'reject' ? 'Listing rejected by administration.' : 'Administration requested changes.' : 'Listing changed after the decision and needs another review.'}
        {' '}{listing.adminReview.note}
      </p>}
      <p className="creator-upload-tags">{asset.tags.map(tag => `#${tag.label}`).join(" ") || "Sin tags"}</p>
    </div>
    <div className="creator-upload-actions">
      <button className="icon-button" type="button" aria-label={`Escuchar ${asset.name}`} title={asset.previewUrl ? "Escuchar" : "Audio no disponible"} disabled={!asset.previewUrl} onClick={() => onPlay(asset)}><Play size={18} /></button>
      {asset.downloadUrl && <a className="icon-button" href={asset.downloadUrl} download title="Descargar original" aria-label={`Descargar ${asset.name}`}><Download size={18} /></a>}
      {onRetryPreview && asset.assetId && asset.previewReady === false && <button className="button ghost creator-preview-retry" type="button" disabled={busy || retrying} onClick={onRetryPreview}><RotateCcw size={16} />{retrying ? "Procesando..." : "Generar preview"}</button>}
      {onPrepareSale && <button className="button ghost creator-offer-button" type="button" aria-label={`${tx(listing ? 'seller.offerButtonEdit' : 'seller.offerButton')} ${asset.name}`} title={tx('seller.preparationNote')} disabled={busy} onClick={onPrepareSale}><BadgeDollarSign size={17} /> {listing ? tx('seller.offerButtonEdit') : tx('seller.offerButton')}</button>}
      {onEdit && <button className="icon-button" type="button" aria-label={`Editar ${asset.name}`} title="Editar" disabled={busy} onClick={onEdit}><Pencil size={18} /></button>}
      {onArchive && <button className="icon-button" type="button" aria-label={`${asset.publicationStatus === "archived" ? "Restaurar" : "Archivar"} ${asset.name}`} title={asset.publicationStatus === "archived" ? "Restaurar" : "Archivar"} disabled={busy} onClick={onArchive}>{asset.publicationStatus === "archived" ? <RotateCcw size={18} /> : <Archive size={18} />}</button>}
    </div>
  </article>;
}

export function Studio({ uploads, onPlay, onUpdate, onRetryPreview, onLoadBeatListings, onSaveBeatListing, scope, loadError }: {
  scope?: string;
  loadError?: string;
  uploads: CatalogAsset[];
  onPlay: (asset: AudioAsset) => void;
  onUpdate: (asset: CatalogAsset) => Promise<{ error?: string }>;
  onRetryPreview?: (asset: CatalogAsset) => Promise<{ asset?: CatalogAsset; error?: string }>;
  onLoadBeatListings?: () => Promise<ApiResult<BeatListingRecord[]>>;
  onSaveBeatListing?: (contentId: string, input: BeatListingInput) => Promise<ApiResult<BeatListingRecord>>;
}) {
  const [query, setQuery] = useState("");
  const [type, setType] = useState("all");
  const [status, setStatus] = useState("all");
  const [editing, setEditing] = useState<CatalogAsset>();
  const [busy, setBusy] = useState(false);
  const [retryingId, setRetryingId] = useState<string>();
  const [error, setError] = useState("");
  const [storageUsage, setStorageUsage] = useState<AccountStorageUsage>();
  const [storageUnavailable, setStorageUnavailable] = useState(false);
  const [beatListings, setBeatListings] = useState<BeatListingRecord[]>([]);
  const [listingError, setListingError] = useState('');
  const [saleEditing, setSaleEditing] = useState<CatalogAsset>();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const draft = readUploadDraft(scope);
  const hasDraft = Boolean(draft.title || draft.file);
  const editingOpen = Boolean(editing);
  useEffect(() => { if (editingOpen) dialogRef.current?.showModal(); }, [editingOpen]);
  useEffect(() => {
    if (scope === 'demo') return;
    let active = true;
    void getAccountStorageUsage().then(result => {
      if (!active) return;
      if (result.ok) setStorageUsage(result.data);
      else setStorageUnavailable(true);
    });
    return () => { active = false };
  }, [scope]);
  useEffect(() => {
    if (!onLoadBeatListings) return
    let active = true
    void onLoadBeatListings().then(result => {
      if (!active) return
      if (result.ok) setBeatListings(result.data)
      else setListingError(result.error.message)
    }).catch(() => { if (active) setListingError('No se pudieron consultar tus fichas comerciales.') })
    return () => { active = false }
  }, [onLoadBeatListings])
  const filtered = uploads.filter(asset =>
    (type === "all" || creatorType(asset.type) === type) &&
    (status === "all" || asset.publicationStatus === status) &&
    `${asset.name} ${asset.tags.map(tag => tag.label).join(" ")}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  const update = async (asset: CatalogAsset) => {
    if (busy) return;
    setBusy(true); setError("");
    try {
      const result = await onUpdate(asset);
      if (result.error) setError(result.error);
      else setEditing(undefined);
    } catch { setError("No se guardaron los cambios. Intenta de nuevo."); }
    finally { setBusy(false); }
  };
  const retryPreview = async (asset: CatalogAsset) => {
    if (!onRetryPreview || retryingId || !asset.assetId) return;
    setRetryingId(asset.id); setError("");
    try {
      const result = await onRetryPreview(asset);
      if (result.error) setError(result.error);
      else if (!result.asset?.previewReady) setError("El preview sigue pendiente. Intenta de nuevo en un momento.");
    } catch { setError("No se pudo generar el preview. Verifica FFmpeg e inténtalo de nuevo."); }
    finally { setRetryingId(undefined); }
  };
  const saveBeatListing = async (contentId: string, input: BeatListingInput): Promise<ApiResult<BeatListingRecord>> => {
    if (!onSaveBeatListing) return { ok: false, error: { code: 'NOT_AVAILABLE', message: 'Inicia sesión para preparar una ficha comercial.' } }
    const result = await onSaveBeatListing(contentId, input)
    if (result.ok) setBeatListings(current => [...current.filter(item => item.contentId !== contentId), result.data])
    return result
  }
  return <>
    <PageHeader eyebrow="BeatVault" title="Mis subidas" description={`${uploads.length} audios`}
      action={<a className="button" href="#/upload"><UploadIcon size={17} /> Subir audio</a>} />
    {scope !== 'demo' && <section className="creator-storage-summary" aria-label="Uso de almacenamiento">
      <div><span className="eyebrow">Almacenamiento de audios y artwork</span><strong>{storageUsage ? `${formatBytes(storageUsage.usedBytes)} usados${storageUsage.limitBytes === null ? '' : ` de ${formatBytes(storageUsage.limitBytes)}`}` : storageUnavailable ? 'No disponible' : 'Consultando consumo...'}</strong><p>{storageUnavailable ? 'No se pudo consultar el almacenamiento de la cuenta.' : storageUsage?.quotaSource === 'account' ? 'Límite de prueba asignado por administración. Se contabilizan audios y artwork.' : storageUsage?.quotaSource === 'server' ? 'Límite técnico global. Se contabilizan audios y artwork.' : 'Sin límite asignado por ahora; la cuota del paquete se definirá más adelante.'}</p></div>
      {storageUsage?.limitBytes !== null && storageUsage && <div className="creator-storage-meter" role="progressbar" aria-label="Almacenamiento usado" aria-valuenow={Math.min(100, Math.round(storageUsage.usedBytes / storageUsage.limitBytes * 100))} aria-valuemin={0} aria-valuemax={100}><i style={{ width: `${Math.min(100, storageUsage.usedBytes / storageUsage.limitBytes * 100)}%` }} /></div>}
    </section>}
    {hasDraft && <div className="creator-draft-strip"><div><span className="eyebrow">Borrador sin enviar</span><strong>{draft.title || draft.file}</strong></div><a className="button ghost" href="#/upload"><Pencil size={16} /> Continuar</a></div>}
    {onSaveBeatListing && <div className="beat-listing-status-banner"><BadgeDollarSign size={18} /><span><strong>{tx('seller.preparationBanner')}</strong> {tx('seller.preparationNote')}</span></div>}
    <div className="creator-upload-toolbar">
      <label className="search" htmlFor="uploads-search"><Search size={17} /><span className="sr-only">Buscar mis subidas</span><input id="uploads-search" placeholder="Buscar por nombre o tag" value={query} onChange={event => setQuery(event.target.value)} /></label>
      <div className="filter-chips" aria-label="Tipo de subida">{["all", ...creatorTypes].map(value => <button key={value} type="button" aria-pressed={type === value} className={type === value ? "active" : ""} onClick={() => setType(value)}>{value === "all" ? "Todos" : value === "Beat" ? "Beats" : "One-shots"}</button>)}</div>
      <label className="library-sort" htmlFor="uploads-status"><span>Estado</span><select id="uploads-status" value={status} onChange={event => setStatus(event.target.value)}><option value="all">Todos los estados</option>{Object.entries(uploadStatusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
    </div>
    {(error || loadError || listingError) && !editing && !saleEditing && <p className="upload-error" role="alert">{error || loadError || listingError}</p>}
    <p className="muted" role="status">{filtered.length} resultados</p>
    {filtered.length ? <div className="creator-upload-grid">{filtered.map(asset => <UploadCard key={asset.id} asset={asset} listing={beatListings.find(item => item.contentId === asset.id)} onPlay={onPlay} busy={busy} retrying={retryingId === asset.id} onRetryPreview={onRetryPreview ? () => void retryPreview(asset) : undefined} onPrepareSale={onSaveBeatListing && creatorType(asset.type) === 'Beat' ? () => setSaleEditing(asset) : undefined} onEdit={() => { setError(""); setEditing({ ...asset }); }} onArchive={() => void update({ ...asset, publicationStatus: asset.publicationStatus === "archived" ? "draft" : "archived" })} />)}</div> :
      <section className="empty-state creator-upload-empty"><Music2 size={28} /><h2>{uploads.length ? "No hay coincidencias" : "Todavia no tienes subidas"}</h2>{uploads.length ? <button className="button ghost" onClick={() => { setQuery(""); setType("all"); setStatus("all"); }}>Limpiar filtros</button> : <a className="button" href="#/upload"><ArrowUpFromLine size={17} /> Subir mi primer audio</a>}</section>}
    {editing && <dialog ref={dialogRef} className="creator-upload-dialog" aria-labelledby="creator-upload-edit-title" onCancel={event => { if (busy) event.preventDefault(); else setEditing(undefined); }} onClose={() => setEditing(undefined)}>
      <form onSubmit={event => { event.preventDefault(); if (editing.name.trim()) void update({ ...editing, name: editing.name.trim() }); }}>
        <div className="modal-heading"><h2 id="creator-upload-edit-title">Editar subida</h2><button type="button" className="icon-button" aria-label="Cerrar editor" disabled={busy} onClick={() => setEditing(undefined)}><X size={18} /></button></div>
        <label className="short-upload-field">Nombre<input required maxLength={160} value={editing.name} onChange={event => setEditing({ ...editing, name: event.target.value })} /></label>
        <label className="short-upload-field">Tipo<select value={creatorType(editing.type)} onChange={event => setEditing({ ...editing, type: event.target.value })}>{creatorTypes.map(value => <option key={value}>{value}</option>)}</select></label>
        <label className="short-upload-field">Tags<input defaultValue={editing.tags.map(tag => tag.label).join(", ")} onChange={event => setEditing({ ...editing, tags: event.target.value.split(",").map(label => ({ label: label.trim() })).filter(tag => tag.label) })} /></label>
        <label className="short-upload-field">Estado<select value={editing.publicationStatus} onChange={event => setEditing({ ...editing, publicationStatus: event.target.value as CatalogStatus })}>{Object.entries(uploadStatusLabels).map(([value, label]) => <option key={value} value={value} disabled={value === "published" || value === "rejected"}>{label}</option>)}</select></label>
        {error && <p className="upload-error" role="alert">{error}</p>}
        <div className="modal-actions"><button type="button" className="button ghost" disabled={busy} onClick={() => setEditing(undefined)}>Cancelar</button><button className="button" disabled={busy || !editing.name.trim()}><Check size={16} /> {busy ? "Guardando..." : "Guardar"}</button></div>
      </form>
    </dialog>}
    {saleEditing && onSaveBeatListing && <BeatSaleListingForm key={saleEditing.id} asset={saleEditing} listing={beatListings.find(item => item.contentId === saleEditing.id)} onClose={() => setSaleEditing(undefined)} onSave={saveBeatListing} />}
  </>;
}
