import { useEffect, useRef, useState } from "react";
import { Check, FileUp, Save, Send, Trash2 } from "lucide-react";
import { PageHeader } from "./ui";
import { emptyUploadDraft, formatDuration, readUploadDraft, writeUploadDraft, type UploadDraft } from "../data/localUploadDraft";
import { createImportQueue, metadataFromFile, validateImportItem, type ImportQueueItem } from "../data/localLibraryEngine";
import { creatorType, creatorTypes, uploadCovers } from "../data/creatorUploads";
import type { CatalogAsset } from "../data/localCatalog";
import type { AssetRecord } from "../api/client";

export function Upload({ onPublish, onRemoteUpload, scope }: {
  scope?: string;
  onPublish: (asset: CatalogAsset, previewUrl?: string) => Promise<boolean>;
  onRemoteUpload?: (file: File) => Promise<{ ok: true; data: AssetRecord } | { ok: false; error: { message: string } }>;
}) {
  const [draft, setDraft] = useState<UploadDraft>(() => {
    const restored = readUploadDraft(scope);
    return { ...restored, type: creatorType(restored.type) || "", cover: restored.cover || uploadCovers[0].url };
  });
  const [tagsText, setTagsText] = useState(() => draft.tags.join(", "));
  const [queue, setQueue] = useState<ImportQueueItem[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [preview, setPreview] = useState<string>();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(true);
  const [submitted, setSubmitted] = useState<Set<string>>(() => new Set());
  const submittedRef = useRef(new Set<string>());
  const remoteFiles = useRef(new Map<string, AssetRecord>());
  const submitting = useRef(false);
  const selected = queue.find(item => item.id === selectedId);
  const selectedFile = selected?.status === "ready" ? selected.file : undefined;
  const ready = queue.filter(item => item.status === "ready" && !submitted.has(item.id));
  const valid = Boolean(creatorType(draft.type) && draft.title.trim() && draft.tags.length && ready.length);
  useEffect(() => { setSaved(writeUploadDraft(draft, scope)); }, [draft, scope]);
  useEffect(() => {
    if (!selectedFile) { setPreview(undefined); return; }
    const url = URL.createObjectURL(selectedFile);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [selectedFile]);
  const selectFiles = (files: File[]) => {
    if (!files.length || submitting.current) return;
    const next = createImportQueue(files).map(item => {
      const validated = validateImportItem(item);
      return validated.status === "rejected" ? validated : { ...validated, status: "ready" as const, metadata: metadataFromFile(item.file, null) };
    });
    const first = next.find(item => item.status === "ready");
    setQueue(next); setSelectedId(first?.id || "");
    setSubmitted(new Set()); submittedRef.current.clear(); remoteFiles.current.clear();
    setError(first ? "" : next[0]?.error || "Selecciona un archivo de audio.");
    setDraft(current => ({ ...current, title: current.title || first?.file.name.replace(/\.[^.]+$/, "") || "", file: first?.file.name || "", fileMetadata: first?.metadata }));
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
      for (const item of ready) {
        if (submittedRef.current.has(item.id)) continue;
        let previewUrl: string | undefined;
        try {
          if (onRemoteUpload && !remoteFiles.current.has(item.id)) {
            const uploaded = await onRemoteUpload(item.file);
            if (!uploaded.ok) { failures.push(`${item.file.name}: ${uploaded.error.message}`); continue; }
            remoteFiles.current.set(item.id, uploaded.data);
          }
          previewUrl = URL.createObjectURL(item.file);
          const metadata = item.metadata || metadataFromFile(item.file, null);
          const accepted = await onPublish({
            id: `catalog-${crypto.randomUUID()}`,
            assetId: remoteFiles.current.get(item.id)?.id,
            coverId: uploadCovers.find(cover => cover.url === draft.cover)?.id,
            name: queue.filter(entry => entry.status === "ready").length === 1 ? draft.title.trim() : item.file.name.replace(/\.[^.]+$/, ""),
            type: draft.type, productType: draft.type === "Beat" ? "beat" : "sound",
            cover: draft.cover, collection: "My catalog",
            metadata: { duration: formatDuration(metadata.durationSeconds), size: metadata.size, format: item.file.name.split(".").pop()?.toUpperCase() || "AUDIO" },
            tags: draft.tags.map(label => ({ label })), color: "#35d0ba", favorite: false, waveform: [],
            publicationStatus: "pending-review", localAvailability: "session-preview",
          }, previewUrl);
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
    } finally { submitting.current = false; setBusy(false); }
  };
  return <>
    <PageHeader eyebrow="Mis subidas" title="Subir audio" description="Beats y One-shots"
      action={<a className="button ghost" href="#/studio">Volver a mis subidas</a>} />
    <div className="upload-layout">
      <section className="upload-form">
        <fieldset disabled={busy} className="creator-upload-fields">
          <div className="upload-step"><span>01</span><h2>Audio</h2></div>
          <label className={`dropzone ${queue.length ? "has-file" : ""}`} htmlFor="upload-file">
            <input id="upload-file" type="file" multiple accept="audio/aac,audio/flac,audio/mpeg,audio/mp4,audio/ogg,audio/wav,audio/webm,.aac,.flac,.mp3,.m4a,.ogg,.wav,.webm" onChange={event => selectFiles(Array.from(event.target.files || []))} />
            <FileUp size={26} aria-hidden="true" />
            <strong>{queue.length ? `${queue.length} archivos seleccionados` : "Seleccionar audio"}</strong>
            <small>{draft.file && !queue.length ? `Vuelve a seleccionar: ${draft.file}` : "WAV, MP3, FLAC, OGG, AAC, M4A o WEBM"}</small>
          </label>
          {queue.length > 0 && <div className="upload-queue" aria-label="Import queue">{queue.map(item => <div className="check" key={item.id}>
            <span>{submitted.has(item.id) ? <Check size={16} /> : item.status === "rejected" ? "!" : ""}</span>
            <button className="text-button" type="button" disabled={item.status === "rejected"} onClick={() => setSelectedId(item.id)}>{item.file.name}</button>
            <small>{submitted.has(item.id) ? "En revision" : item.error || item.metadata?.size}</small>
            <button type="button" className="icon-button" title="Quitar archivo" aria-label={`Remove ${item.file.name}`} disabled={submitted.has(item.id)} onClick={() => remove(item.id)}><Trash2 size={16} /></button>
          </div>)}</div>}
          <div className="upload-step"><span>02</span><h2>Detalles</h2></div>
          <div className="form-grid">
            <label htmlFor="upload-title">Nombre<input id="upload-title" maxLength={160} value={draft.title} onChange={event => setDraft({ ...draft, title: event.target.value })} /></label>
            <label htmlFor="upload-type">Tipo<select id="upload-type" value={draft.type} onChange={event => setDraft({ ...draft, type: event.target.value })}><option value="">Seleccionar tipo</option>{creatorTypes.map(type => <option key={type}>{type}</option>)}</select></label>
          </div>
          <label className="short-upload-field" htmlFor="upload-tags">Tags<input id="upload-tags" placeholder="trap, oscuro, drums" value={tagsText} onChange={event => { setTagsText(event.target.value); setDraft({ ...draft, tags: [...new Set(event.target.value.split(",").map(tag => tag.trim()).filter(Boolean))].slice(0, 24) }); }} /></label>
          <fieldset className="creator-cover-picker"><legend>Portada</legend>{uploadCovers.map(cover => <button type="button" key={cover.url} title={cover.name} aria-label={`Portada ${cover.name}`} aria-pressed={draft.cover === cover.url} onClick={() => setDraft({ ...draft, cover: cover.url })}><img src={cover.url} alt="" /></button>)}</fieldset>
          <div className="upload-actions">
            <button className="button ghost" type="button" onClick={() => setSaved(writeUploadDraft(draft, scope))}><Save size={16} /> Guardar borrador</button>
            <button className="button" type="button" disabled={!valid || busy} onClick={() => void submit()}><Send size={16} /> {busy ? "Enviando..." : "Enviar a revision"}</button>
          </div>
        </fieldset>
        {error && <p className="upload-error" role="alert">{error}</p>}
        <p className="draft-status" role="status">{saved ? "Borrador guardado en este navegador" : "No se pudo guardar el borrador"}</p>
      </section>
      <aside className="upload-side">
        <img className="creator-upload-preview" src={draft.cover || uploadCovers[0].url} alt="Portada seleccionada" />
        <h2 className="creator-preview-title">{draft.title || "Sin titulo"}</h2>
        <p>{draft.type || "Tipo pendiente"}</p>
        {preview && <audio controls preload="metadata" src={preview} aria-label="Escuchar audio seleccionado" />}
        {onRemoteUpload && <p className="draft-status">Sesion conectada</p>}
      </aside>
    </div>
  </>;
}
