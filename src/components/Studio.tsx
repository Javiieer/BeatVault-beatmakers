import { useEffect, useRef, useState } from "react";
import { Archive, ArrowUpFromLine, Check, Download, Music2, Pencil, Play, RotateCcw, Search, Upload as UploadIcon, X } from "lucide-react";
import { PageHeader } from "./ui";
import type { AudioAsset } from "../types";
import type { CatalogAsset, CatalogStatus } from "../data/localCatalog";
import { creatorType, creatorTypes, uploadCovers, uploadStatusLabels } from "../data/creatorUploads";
import { readUploadDraft } from "../data/localUploadDraft";

export function UploadCard({ asset, onPlay, onEdit, onArchive, busy = false }: {
  asset: CatalogAsset; onPlay: (asset: AudioAsset) => void; onEdit?: () => void; onArchive?: () => void; busy?: boolean;
}) {
  return <article className="creator-upload-card">
    <img className="creator-upload-cover" src={asset.cover || uploadCovers[0].url} alt="" />
    <div className="creator-upload-copy">
      <span className="eyebrow">{creatorType(asset.type)}</span>
      <h2 title={asset.name}>{asset.name}</h2>
      <span className={`publication-pill ${asset.publicationStatus}`}>{uploadStatusLabels[asset.publicationStatus]}</span>
      {asset.publicationStatus === 'rejected' && asset.reviewNote && <p className="creator-upload-review-note">Motivo: {asset.reviewNote}</p>}
      <p className="creator-upload-tags">{asset.tags.map(tag => `#${tag.label}`).join(" ") || "Sin tags"}</p>
    </div>
    <div className="creator-upload-actions">
      <button className="icon-button" type="button" aria-label={`Escuchar ${asset.name}`} title={asset.previewUrl ? "Escuchar" : "Audio no disponible"} disabled={!asset.previewUrl} onClick={() => onPlay(asset)}><Play size={18} /></button>
      {asset.downloadUrl && <a className="icon-button" href={asset.downloadUrl} download title="Descargar original" aria-label={`Descargar ${asset.name}`}><Download size={18} /></a>}
      {onEdit && <button className="icon-button" type="button" aria-label={`Editar ${asset.name}`} title="Editar" disabled={busy} onClick={onEdit}><Pencil size={18} /></button>}
      {onArchive && <button className="icon-button" type="button" aria-label={`${asset.publicationStatus === "archived" ? "Restaurar" : "Archivar"} ${asset.name}`} title={asset.publicationStatus === "archived" ? "Restaurar" : "Archivar"} disabled={busy} onClick={onArchive}>{asset.publicationStatus === "archived" ? <RotateCcw size={18} /> : <Archive size={18} />}</button>}
    </div>
  </article>;
}

export function Studio({ uploads, onPlay, onUpdate, scope, loadError }: {
  scope?: string;
  loadError?: string;
  uploads: CatalogAsset[];
  onPlay: (asset: AudioAsset) => void;
  onUpdate: (asset: CatalogAsset) => Promise<{ error?: string }>;
}) {
  const [query, setQuery] = useState("");
  const [type, setType] = useState("all");
  const [status, setStatus] = useState("all");
  const [editing, setEditing] = useState<CatalogAsset>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const dialogRef = useRef<HTMLDialogElement>(null);
  const draft = readUploadDraft(scope);
  const hasDraft = Boolean(draft.title || draft.file);
  const editingOpen = Boolean(editing);
  useEffect(() => { if (editingOpen) dialogRef.current?.showModal(); }, [editingOpen]);
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
  return <>
    <PageHeader eyebrow="BeatVault" title="Mis subidas" description={`${uploads.length} audios`}
      action={<a className="button" href="#/upload"><UploadIcon size={17} /> Subir audio</a>} />
    {hasDraft && <div className="creator-draft-strip"><div><span className="eyebrow">Borrador sin enviar</span><strong>{draft.title || draft.file}</strong></div><a className="button ghost" href="#/upload"><Pencil size={16} /> Continuar</a></div>}
    <div className="creator-upload-toolbar">
      <label className="search" htmlFor="uploads-search"><Search size={17} /><span className="sr-only">Buscar mis subidas</span><input id="uploads-search" placeholder="Buscar por nombre o tag" value={query} onChange={event => setQuery(event.target.value)} /></label>
      <div className="filter-chips" aria-label="Tipo de subida">{["all", ...creatorTypes].map(value => <button key={value} type="button" aria-pressed={type === value} className={type === value ? "active" : ""} onClick={() => setType(value)}>{value === "all" ? "Todos" : value === "Beat" ? "Beats" : "One-shots"}</button>)}</div>
      <label className="library-sort" htmlFor="uploads-status"><span>Estado</span><select id="uploads-status" value={status} onChange={event => setStatus(event.target.value)}><option value="all">Todos los estados</option>{Object.entries(uploadStatusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
    </div>
    {(error || loadError) && !editing && <p className="upload-error" role="alert">{error || loadError}</p>}
    <p className="muted" role="status">{filtered.length} resultados</p>
    {filtered.length ? <div className="creator-upload-grid">{filtered.map(asset => <UploadCard key={asset.id} asset={asset} onPlay={onPlay} busy={busy} onEdit={() => { setError(""); setEditing({ ...asset }); }} onArchive={() => void update({ ...asset, publicationStatus: asset.publicationStatus === "archived" ? "draft" : "archived" })} />)}</div> :
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
  </>;
}
