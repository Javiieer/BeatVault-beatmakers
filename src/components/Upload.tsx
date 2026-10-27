import { useEffect, useRef, useState } from "react";
import { Check, FileUp, Save, Send, Trash2 } from "lucide-react";
import { PageHeader } from "./ui";
import { emptyUploadDraft, formatDuration, readUploadDraft, writeUploadDraft, type UploadDraft } from "../data/localUploadDraft";
import { createImportQueue, metadataFromFile, validateImportItem, type ImportQueueItem } from "../data/localLibraryEngine";
import { creatorType, creatorTypes, uploadCovers } from "../data/creatorUploads";
import type { CatalogAsset } from "../data/localCatalog";
import type { ArtworkUploadResult, AssetRecord } from "../api/client";
import type { ApiResult } from "../domains/core/contracts";
import { imageUploadAccept, imageUploadMime } from '../domains/media/imageFormats';

const maxQueueFiles = 50;

export function Upload({ onPublish, onRemoteUpload, onRemoteArtworkUpload, scope }: {
  scope?: string;
  onPublish: (asset: CatalogAsset, previewUrl?: string, artwork?: File) => Promise<boolean | string>;
  onRemoteUpload?: (file: File) => Promise<{ ok: true; data: AssetRecord } | { ok: false; error: { message: string } }>;
  onRemoteArtworkUpload?: (assetId: string, file: File) => Promise<ApiResult<ArtworkUploadResult>>;
}) {
  const [draft, setDraft] = useState<UploadDraft>(() => {
    const restored = readUploadDraft(scope);
    return { ...restored, type: creatorType(restored.type) || "", cover: restored.cover || uploadCovers[0].url };
  });
  const [tagsText, setTagsText] = useState(() => draft.tags.join(", "));
  const [queue, setQueue] = useState<ImportQueueItem[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [preview, setPreview] = useState<string>();
  const [artwork, setArtwork] = useState<File>();
  const [artworkPreview, setArtworkPreview] = useState<string>();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(true);
  const [dragActive, setDragActive] = useState(false);
  const [uploadStage, setUploadStage] = useState('');
  const [submitted, setSubmitted] = useState<Set<string>>(() => new Set());
  const submittedRef = useRef(new Set<string>());
  const remoteFiles = useRef(new Map<string, AssetRecord>());
  const fileInput = useRef<HTMLInputElement>(null);
  const submitting = useRef(false);
  const selected = queue.find(item => item.id === selectedId);
  const selectedFile = selected?.status === "ready" ? selected.file : undefined;
  const ready = queue.filter(item => item.status === "ready" && !submitted.has(item.id));
  const valid = Boolean(creatorType(draft.type) && draft.title.trim() && draft.tags.length && ready.length && ready.every(item => (item.title ?? item.file.name.replace(/\.[^.]+$/, '')).trim()));
  useEffect(() => { setSaved(writeUploadDraft(draft, scope)); }, [draft, scope]);
  useEffect(() => {
    if (!selectedFile) { setPreview(undefined); return; }
    const url = URL.createObjectURL(selectedFile);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [selectedFile]);
  useEffect(() => {
    if (!artwork) { setArtworkPreview(undefined); return; }
    const url = URL.createObjectURL(artwork);
    setArtworkPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [artwork]);
  const selectFiles = (files: File[]) => {
    if (!files.length || submitting.current) return;
    const known = new Set(queue.map(item => `${item.file.name}-${item.file.size}-${item.file.lastModified}`));
    const incoming = files.filter(file => {
      const identity = `${file.name}-${file.size}-${file.lastModified}`;
      if (known.has(identity)) return false;
      known.add(identity);
      return true;
    });
    const next = createImportQueue(incoming.slice(0, Math.max(0, maxQueueFiles - queue.length))).map(item => {
      const validated = validateImportItem(item);
      return validated.status === "rejected" ? validated : { ...validated, status: "ready" as const, metadata: metadataFromFile(item.file, null), title: item.file.name.replace(/\.[^.]+$/, '') };
    });
    const first = next.find(item => item.status === "ready");
    setQueue(current => [...current, ...next]);
    if (!selectedId) setSelectedId(first?.id || "");
    setError(queue.length + incoming.length > maxQueueFiles ? `Puedes preparar hasta ${maxQueueFiles} audios por lote. Los demás no se añadieron.` : !incoming.length ? 'Estos archivos ya están en la cola.' : first ? "" : next[0]?.error || "Selecciona un archivo de audio.");
    if (!selectedId) setDraft(current => ({ ...current, title: current.title || first?.file.name.replace(/\.[^.]+$/, "") || "", file: first?.file.name || "", fileMetadata: first?.metadata }));
  };
  const remove = (id: string) => {
    const next = queue.filter(item => item.id !== id);
    setQueue(next);
    if (selectedId === id) {
      const replacement = next.find(item => item.status === "ready");
      setSelectedId(replacement?.id || "");
      setDraft(current => ({ ...current, file: replacement?.file.name || "", fileMetadata: replacement?.metadata }));
    }
  };
  const submit = async () => {
    if (!valid || submitting.current) return;
    submitting.current = true; setBusy(true); setError("");
    const failures: string[] = [];
    try {
      if (artwork) {
        if (artwork.size > 10 * 1024 * 1024 || !imageUploadMime(artwork)) {
          setError("El artwork debe ser JPG, PNG, WebP o AVIF y pesar como máximo 10 MB.");
          return;
        }
        try {
          const bitmap = await createImageBitmap(artwork);
          const validDimensions = bitmap.width >= 640 && bitmap.height >= 640 && bitmap.width <= 10000 && bitmap.height <= 10000 && bitmap.width * bitmap.height <= 16_000_000;
          bitmap.close();
          if (!validDimensions) { setError("Usa una imagen con ambos lados de al menos 640 px, hasta 10 000 px por lado y 16 megapíxeles."); return; }
        } catch {
          // Some browsers cannot preview AVIF. The server is authoritative and decodes it safely.
          if (!onRemoteArtworkUpload) { setError("Este navegador no pudo leer la portada. Prueba otro formato."); return; }
        }
      }
      for (const item of ready) {
        if (submittedRef.current.has(item.id)) continue;
        let previewUrl: string | undefined;
        try {
          if (onRemoteUpload && !remoteFiles.current.has(item.id)) {
            setUploadStage(`Subiendo audio: ${item.file.name}`);
            const uploaded = await onRemoteUpload(item.file);
            if (!uploaded.ok) { failures.push(`${item.file.name}: ${uploaded.error.message}`); continue; }
            remoteFiles.current.set(item.id, uploaded.data);
          }
          let artworkForPublish = artwork;
          const remoteAssetId = remoteFiles.current.get(item.id)?.id;
          if (artwork && remoteAssetId && onRemoteArtworkUpload) {
            setUploadStage(`Procesando portada: ${item.file.name}`);
            const uploadedArtwork = await onRemoteArtworkUpload(remoteAssetId, artwork);
            if (!uploadedArtwork.ok) { failures.push(`${item.file.name}: artwork: ${uploadedArtwork.error.message}`); continue; }
            artworkForPublish = undefined;
          }
          previewUrl = URL.createObjectURL(item.file);
          const metadata = item.metadata || metadataFromFile(item.file, null);
          setUploadStage(`Guardando ficha: ${item.file.name}`);
          const accepted = await onPublish({
            id: `catalog-${crypto.randomUUID()}`,
            assetId: remoteFiles.current.get(item.id)?.id,
            coverId: uploadCovers.find(cover => cover.url === draft.cover)?.id,
            name: queue.filter(entry => entry.status === "ready").length === 1 ? draft.title.trim() : (item.title ?? item.file.name.replace(/\.[^.]+$/, "")).trim(),
            type: draft.type, productType: draft.type === "Beat" ? "beat" : "sound",
            cover: draft.cover, collection: "My catalog",
            metadata: { duration: formatDuration(metadata.durationSeconds), size: metadata.size, format: item.file.name.split(".").pop()?.toUpperCase() || "AUDIO" },
            tags: draft.tags.map(label => ({ label })), color: "#35d0ba", favorite: false, waveform: [],
            publicationStatus: "pending-review", localAvailability: "session-preview",
          }, previewUrl, artworkForPublish);
          if (!accepted) { URL.revokeObjectURL(previewUrl); failures.push(`${item.file.name}: no se guardo en el catalogo.`); continue; }
          submittedRef.current.add(item.id);
          setSubmitted(new Set(submittedRef.current));
        } catch {
          if (previewUrl) URL.revokeObjectURL(previewUrl);
          failures.push(`${item.file.name}: no se pudo completar la subida.`);
        }
      }
      if (failures.length) setError(failures.join(" "));
      else {
        setDraft(emptyUploadDraft); writeUploadDraft(emptyUploadDraft, scope);
        window.location.hash = "#/studio";
      }
    } finally { submitting.current = false; setBusy(false); setUploadStage(''); }
  };
  return <>
    <PageHeader eyebrow="Mis subidas" title="Subir audio" description="Beats y One-shots"
      action={<a className="button ghost" href="#/studio">Volver a mis subidas</a>} />
    <div className="upload-layout">
      <section className="upload-form">
        <fieldset disabled={busy} className="creator-upload-fields">
          <div className="upload-step"><span>01</span><h2>Audio</h2></div>
          <label className={`dropzone ${queue.length ? "has-file" : ""} ${dragActive ? 'is-dragging' : ''}`} htmlFor="upload-file" role="button" tabIndex={busy ? -1 : 0} aria-label="Seleccionar o añadir archivos de audio" aria-disabled={busy} onKeyDown={event => { if (!busy && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); fileInput.current?.click(); } }} onDragOver={event => { event.preventDefault(); if (!busy) setDragActive(true); }} onDragLeave={() => setDragActive(false)} onDrop={event => { event.preventDefault(); setDragActive(false); if (!busy) selectFiles(Array.from(event.dataTransfer.files)); }}>
            <input ref={fileInput} id="upload-file" type="file" multiple accept="audio/aac,audio/flac,audio/mpeg,audio/mp4,audio/ogg,audio/wav,audio/webm,.aac,.flac,.mp3,.m4a,.ogg,.wav,.webm" onChange={event => { selectFiles(Array.from(event.target.files || [])); event.currentTarget.value = ''; }} />
            <FileUp size={26} aria-hidden="true" />
            <strong>{queue.length ? `${queue.length} archivos seleccionados · añadir más` : "Seleccionar audio"}</strong>
            <small>{draft.file && !queue.length ? `Vuelve a seleccionar: ${draft.file}` : "WAV, MP3, FLAC, OGG, AAC, M4A o WEBM"}</small>
            <small>Arrastra archivos aquí o selecciónalos. Hasta 50 por lote; 500 MB por archivo.</small>
          </label>
          {queue.length > 0 && <div className="upload-queue" aria-label="Import queue">{queue.map(item => <div className="check" key={item.id}>
            <span>{submitted.has(item.id) ? <Check size={16} /> : item.status === "rejected" ? "!" : ""}</span>
            <button className="text-button" type="button" disabled={item.status === "rejected"} onClick={() => setSelectedId(item.id)}>{item.file.name}</button>
            {queue.filter(entry => entry.status === 'ready').length > 1 && item.status === 'ready' && <input aria-label={`Nombre para ${item.file.name}`} maxLength={160} disabled={submitted.has(item.id)} value={item.title || ''} onChange={event => { const title = event.target.value; setQueue(current => current.map(entry => entry.id === item.id ? { ...entry, title } : entry)); }} />}
            <small>{submitted.has(item.id) ? "En revision" : item.error || item.metadata?.size}</small>
            <button type="button" className="icon-button" title="Quitar archivo" aria-label={`Remove ${item.file.name}`} disabled={submitted.has(item.id)} onClick={() => remove(item.id)}><Trash2 size={16} /></button>
          </div>)}</div>}
          {queue.filter(item => item.status === 'ready').length > 1 && <p className="draft-status">Puedes cambiar el nombre de cada audio en la cola. El tipo, los tags y la portada se aplican al lote.</p>}
          <div className="upload-step"><span>02</span><h2>Detalles</h2></div>
          <div className="form-grid">
            <label htmlFor="upload-title">Nombre<input id="upload-title" maxLength={160} value={draft.title} onChange={event => setDraft({ ...draft, title: event.target.value })} /></label>
            <label htmlFor="upload-type">Tipo<select id="upload-type" value={draft.type} onChange={event => setDraft({ ...draft, type: event.target.value })}><option value="">Seleccionar tipo</option>{creatorTypes.map(type => <option key={type}>{type}</option>)}</select></label>
          </div>
          <label className="short-upload-field" htmlFor="upload-tags">Tags<input id="upload-tags" placeholder="trap, oscuro, drums" value={tagsText} onChange={event => { setTagsText(event.target.value); setDraft({ ...draft, tags: [...new Set(event.target.value.split(",").map(tag => tag.trim()).filter(Boolean))].slice(0, 24) }); }} /></label>
          <fieldset className="creator-cover-picker"><legend>Artwork del audio</legend>
            <label className="artwork-upload" htmlFor="upload-artwork">Subir JPG, PNG, WebP o AVIF<input id="upload-artwork" type="file" accept={imageUploadAccept} onChange={event => { const file = event.target.files?.[0]; if (file) { setArtwork(file); setError(""); } }} /></label>
            {artwork && <button type="button" className="button ghost" onClick={() => setArtwork(undefined)}>Quitar artwork</button>}
            {!artwork && uploadCovers.map(cover => <button type="button" key={cover.url} title={cover.name} aria-label={`Portada ${cover.name}`} aria-pressed={draft.cover === cover.url} onClick={() => setDraft({ ...draft, cover: cover.url })}><img src={cover.url} alt="" /></button>)}
          </fieldset>
          <p className="draft-status">La portada se recorta al centro para crear un cuadrado de hasta 4000 × 4000 px. Usa JPG, PNG, WebP o AVIF, hasta 10 MB y 16 megapíxeles; ambos lados deben medir al menos 640 px. El servidor limpia los metadatos de la imagen.</p>
          <div className="upload-actions">
            <button className="button ghost" type="button" onClick={() => setSaved(writeUploadDraft(draft, scope))}><Save size={16} /> Guardar borrador</button>
            <button className="button" type="button" disabled={!valid || busy} onClick={() => void submit()}><Send size={16} /> {busy ? "Enviando..." : "Enviar a revision"}</button>
          </div>
        </fieldset>
        {error && <p className="upload-error" role="alert">{error}</p>}
        {uploadStage && <p className="draft-status" role="status" aria-live="polite">{uploadStage}</p>}
        <p className="draft-status" role="status">{saved ? "Borrador guardado en este navegador" : "No se pudo guardar el borrador"}</p>
      </section>
      <aside className="upload-side">
        <img className="creator-upload-preview" src={artworkPreview || draft.cover || uploadCovers[0].url} alt="Artwork seleccionado" />
        <h2 className="creator-preview-title">{draft.title || "Sin titulo"}</h2>
        <p>{draft.type || "Tipo pendiente"}</p>
        {preview && <audio controls preload="metadata" src={preview} aria-label="Escuchar audio seleccionado" />}
        {onRemoteUpload && <p className="draft-status">Sesion conectada</p>}
      </aside>
    </div>
  </>;
}
