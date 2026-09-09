import { useEffect, useRef, useState } from "react";
import { Badge, Button, PageHeader } from "./ui";
import { Check, Circle, FileUp, Play, Trash2, Video } from "lucide-react";
import {
  formatDuration,
  readUploadDraft,
  validateUploadFile,
  writeUploadDraft,
  type UploadDraft,
} from "../data/localUploadDraft";
import {
  hasShortDraft,
  parseShortTags,
  readShortDraft,
  shortDraftChangedEvent,
  shortStatusLabel,
  type ShortDraft,
} from "../domains/shorts/localDraft";
import type { CatalogAsset } from "../data/localCatalog";
import { createImportQueue, localAvailabilityForImport, metadataFromFile, validateImportItem, type ImportQueueItem } from "../data/localLibraryEngine";

const defaultWaveform = [
  22, 45, 30, 65, 38, 78, 44, 28, 62, 35, 72, 48, 30, 58, 40, 70,
];

export function Upload({
  onPublish,
}: {
  onPublish: (asset: CatalogAsset, previewUrl?: string) => boolean;
}) {
  const [draft, setDraft] = useState<UploadDraft>(() => readUploadDraft());
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [queue, setQueue] = useState<ImportQueueItem[]>([]);
  const [published, setPublished] = useState(false);
  const [fileError, setFileError] = useState("");
  const [publishError, setPublishError] = useState("");
  const [saveState, setSaveState] = useState<
    "saved" | "saving" | "unavailable"
  >("saved");
  const [shortDraft, setShortDraft] = useState<ShortDraft>(() =>
    readShortDraft(),
  );
  const objectUrls = useRef(new Set<string>());
  const pendingAudioCleanup = useRef<(() => void) | null>(null);
  const selectedFileRef = useRef<File | null>(null);
  const currentPreviewUrl = useRef<string | null>(null);
  const required = ["Genre", "Character", "Usage"];
  const shortTags = parseShortTags(shortDraft.tags);
  const canUseShortReference = hasShortDraft(shortDraft);
  useEffect(() => {
    const syncDraft = () => setShortDraft(readShortDraft());
    window.addEventListener(shortDraftChangedEvent, syncDraft);
    window.addEventListener("storage", syncDraft);
    return () => {
      window.removeEventListener(shortDraftChangedEvent, syncDraft);
      window.removeEventListener("storage", syncDraft);
    };
  }, []);
  const valid = Boolean(
    draft.title.trim() &&
    draft.type.trim() &&
    draft.file.trim() &&
    queue.some((item) => item.status === "ready") &&
    required.every((tag) => draft.tags.includes(tag)),
  );
  useEffect(() => {
    setSaveState("saving");
    const timer = window.setTimeout(() => {
      setSaveState(writeUploadDraft(draft) ? "saved" : "unavailable");
    }, 0);
    return () => window.clearTimeout(timer);
  }, [draft]);
  useEffect(
    () => () => {
      pendingAudioCleanup.current?.();
      objectUrls.current.forEach((url) => URL.revokeObjectURL(url));
       objectUrls.current.clear();
       currentPreviewUrl.current = null;
    },
    [],
  );
  const update = (change: Partial<UploadDraft>) =>
    setDraft((current) => ({ ...current, ...change }));
  const saveDraft = () => {
    setSaveState("saving");
    setSaveState(writeUploadDraft(draft) ? "saved" : "unavailable");
  };
  const selectFiles = (files: readonly File[]) => {
    if (!files.length) return;
    const items = createImportQueue(files).map((item) => {
      const validated = validateImportItem(item);
      return validated.status === "rejected" ? validated : { ...validated, status: "ready" as const, metadata: metadataFromFile(item.file, null) };
    });
    setQueue(items);
    const first = items.find((item) => item.status === "ready");
    if (!first) { setSelectedFile(null); setFileError(items[0]?.error ?? "No se seleccionaron archivos válidos."); return; }
    setSelectedFile(first.file);
    selectedFileRef.current = first.file;
    setFileError("");
    selectFileForMetadata(first.file);
  };
  const removeQueueItem = (id: string) => {
    const item = queue.find((candidate) => candidate.id === id);
    if (!item) return;
    if (selectedFileRef.current === item.file) {
      pendingAudioCleanup.current?.();
      setSelectedFile(null);
      selectedFileRef.current = null;
      update({ file: "", fileMetadata: undefined });
    }
    setQueue((current) => current.filter((candidate) => candidate.id !== id));
    if (selectedFileRef.current === item.file) {
      const replacement = queue.find((candidate) => candidate.id !== id && candidate.status === "ready");
      if (replacement) selectFileForMetadata(replacement.file);
    }
  };
  const selectFileForMetadata = (file: File) => {
    if (!file) return;
    pendingAudioCleanup.current?.();
    if (currentPreviewUrl.current) {
      URL.revokeObjectURL(currentPreviewUrl.current);
      objectUrls.current.delete(currentPreviewUrl.current);
      currentPreviewUrl.current = null;
    }
    const validationError = validateUploadFile(file);
    if (validationError === "empty" && !file.name.trim()) {
      setSelectedFile(null);
      selectedFileRef.current = null;
      setFileError("Selecciona un archivo con nombre.");
      update({ file: "", fileMetadata: undefined });
      return;
    }
    if (validationError === "empty") {
      setSelectedFile(null);
      selectedFileRef.current = null;
      setFileError("El archivo seleccionado está vacío.");
      update({ file: "", fileMetadata: undefined });
      return;
    }
    if (validationError === "too-large") {
      setSelectedFile(null);
      selectedFileRef.current = null;
      setFileError("El prototipo acepta archivos de hasta 500 MB.");
      update({ file: "", fileMetadata: undefined });
      return;
    }
    if (validationError === "unsupported-audio") {
      setSelectedFile(null);
      selectedFileRef.current = null;
      setFileError("Formato de audio no soportado. Usa MP3, WAV, FLAC, M4A, OGG, AAC o WEBM.");
      update({ file: "", fileMetadata: undefined });
      return;
    }
    setFileError("");
    const fileMetadata = metadataFromFile(file, null);
    update({ file: file.name, fileMetadata });
    setSelectedFile(file);
    selectedFileRef.current = file;
    if (
      !file.type.startsWith("audio/") ||
      typeof URL === "undefined" ||
      typeof Audio === "undefined"
    ) {
      setQueue((current) => current.map((item) => item.file === file ? { ...item, status: "metadata-unavailable", metadata: fileMetadata } : item));
      return;
    }
    let objectUrl: string;
    try {
      objectUrl = URL.createObjectURL(file);
    } catch {
      return;
    }
    objectUrls.current.add(objectUrl);
    currentPreviewUrl.current = objectUrl;
    const audio = new Audio();
    const cleanup = (revokePreview = true) => {
      audio.removeAttribute("src");
      audio.load();
      if (revokePreview) {
        URL.revokeObjectURL(objectUrl);
        objectUrls.current.delete(objectUrl);
        if (currentPreviewUrl.current === objectUrl)
          currentPreviewUrl.current = null;
      }
      if (pendingAudioCleanup.current === cleanup)
        pendingAudioCleanup.current = null;
    };
    pendingAudioCleanup.current = cleanup;
    audio.addEventListener(
      "loadedmetadata",
      () => {
        if (
          selectedFileRef.current === file &&
          Number.isFinite(audio.duration) &&
          audio.duration >= 0
        ) {
          const metadata = { ...fileMetadata, durationSeconds: audio.duration };
          update({ fileMetadata });
          setQueue((current) => current.map((item) => item.file === file ? { ...item, status: "ready", metadata } : item));
        }
        cleanup(false);
      },
      { once: true },
    );
    audio.addEventListener("error", () => { setQueue((current) => current.map((item) => item.file === file ? { ...item, status: "preview-unavailable", metadata: fileMetadata } : item)); cleanup(); }, { once: true });
    audio.src = objectUrl;
  };
  const toggleTag = (tag: string) =>
    update({
      tags: draft.tags.includes(tag)
        ? draft.tags.filter((item) => item !== tag)
        : [...draft.tags, tag],
    });
  const useShortReference = () => {
    update({
      title: draft.title || shortDraft.caption,
      tags: Array.from(new Set([...draft.tags, ...shortTags])),
    });
  };
  const publish = () => {
    if (!valid || published) return;
     const readyItems = queue.filter((item) => item.status === "ready");
     const failures: string[] = [];
     const saved = readyItems.every((item, index) => {
      const metadata = item.metadata ?? draft.fileMetadata;
      const previewUrl = index === 0 ? currentPreviewUrl.current ?? undefined : (() => {
        try { const url = URL.createObjectURL(item.file); objectUrls.current.add(url); return url; } catch { return undefined; }
      })();
       const accepted = onPublish({
       id: `catalog-${Date.now()}-${index}`,
       name: readyItems.length === 1 ? draft.title.trim() : item.file.name.replace(/\.[^.]+$/, ""),
       type: draft.type,
       metadata: {
         duration: formatDuration(metadata?.durationSeconds ?? null),
         size: metadata?.size ?? "Unknown",
         format:
           metadata?.mime.split("/").pop()?.toUpperCase() ?? "FILE",
      },
      tags: draft.tags.map((label) => ({
        label,
        tone: label === "Dark" ? "violet" : "cyan",
      })),
      collection: "My catalog",
      licenseLabel: "Pending review",
      color: "#35d0ba",
      favorite: false,
      waveform: defaultWaveform,
      publicationStatus: "pending-review",
         localAvailability: localAvailabilityForImport(item.status, Boolean(previewUrl)),
       }, previewUrl);
       if (!accepted) failures.push(item.file.name);
       if (accepted && previewUrl) {
        objectUrls.current.delete(previewUrl);
        currentPreviewUrl.current = null;
      }
      return accepted;
    });
     if (saved && readyItems.length) setPublished(true);
     else setPublishError(failures.length ? `No se pudieron publicar: ${failures.join(", ")}.` : "No hay archivos listos para publicar.");
  };
  return (
    <>
      <PageHeader
        eyebrow="Content submission"
        title="Bring something to BeatVault"
        description="Upload intentionally, define the context, and prepare your content for review."
        action={
          <a className="button ghost" href="#/library">
            Cancel
          </a>
        }
      />
      <div className="upload-layout">
        <section className="panel upload-form">
          <div className="upload-step">
            <span>01</span>
            <div>
              <h2>Select content</h2>
              <p>Choose one file to prepare for the BeatVault catalog.</p>
            </div>
          </div>
          <label
            className={`dropzone ${draft.file ? "has-file" : ""}`}
            htmlFor="upload-file"
          >
            <input
              id="upload-file"
              type="file"
               multiple
               accept="audio/*,.mp3,.wav,.flac,.m4a,.ogg,.aac,.webm"
               onChange={(event) => selectFiles(Array.from(event.target.files ?? []))}
             />
             <input id="upload-folder" className="sr-only" type="file" multiple ref={(node) => node?.setAttribute("webkitdirectory", "")} onChange={(event) => selectFiles(Array.from(event.target.files ?? []))} />
            <span className="dropzone-icon"><FileUp size={24} aria-hidden="true" /></span>
             <strong>{queue.length ? `${queue.length} archivo${queue.length === 1 ? "" : "s"} seleccionado${queue.length === 1 ? "" : "s"}` : draft.file || "Drop files here or browse"}</strong>
            <small>
              {fileError
                ? fileError
                : draft.file && !selectedFile
                  ? "Persisted metadata only; select the file again to review"
                  : draft.file
                    ? "File selected for this session"
                    : "Audio: MP3, WAV, FLAC, M4A, OGG, AAC or WEBM"}
            </small>
          </label>
          <button type="button" className="button ghost" onClick={() => document.getElementById("upload-folder")?.click()}>Select folder</button>
           {queue.length > 0 && <div className="upload-queue" aria-label="Import queue" aria-live="polite">{queue.map((item) => <div className="check" key={item.id}><span className={item.status === "ready" ? "done" : ""}>{item.status}</span><span>{item.file.name} <small>{item.metadata?.size ?? "Tamaño no disponible"}</small></span>{item.error && <small className="upload-error">{item.error}</small>}<button type="button" className="icon-button" aria-label={`Remove ${item.file.name}`} onClick={() => removeQueueItem(item.id)}><Trash2 size={15} aria-hidden="true" /></button></div>)}</div>}
          {fileError && (
            <small className="upload-error" role="alert">
              {fileError}
            </small>
          )}
          {draft.fileMetadata && (
            <div
              className="file-metadata"
              aria-label={
                selectedFile
                  ? "Selected file metadata"
                  : "Persisted file metadata"
              }
            >
              <div>
                <span>Name</span>
                <strong>{draft.fileMetadata.name}</strong>
              </div>
              <div>
                <span>Size</span>
                <strong>{draft.fileMetadata.size}</strong>
              </div>
              <div>
                <span>MIME type</span>
                <strong>{draft.fileMetadata.mime || "Not available"}</strong>
              </div>
              <div>
                <span>Duration</span>
                <strong>
                  {formatDuration(draft.fileMetadata.durationSeconds)}
                </strong>
              </div>
            </div>
          )}
          <div className="upload-step">
            <span>02</span>
            <div>
              <h2>Define metadata</h2>
              <p>
                These details keep discovery consistent and creator-controlled.
              </p>
            </div>
          </div>
          <div className="form-grid">
            <label htmlFor="upload-title">
              Title
              <input
                id="upload-title"
                value={draft.title}
                onChange={(event) => update({ title: event.target.value })}
                placeholder="e.g. Dark 808 07"
              />
            </label>
            <label htmlFor="upload-type">
              Content type
              <select
                id="upload-type"
                value={draft.type}
                onChange={(event) => update({ type: event.target.value })}
              >
                <option value="">Select type</option>
                {["Beat", "Sample", "Loop", "Vocal", "MIDI", "Pack"].map(
                  (type) => (
                    <option key={type}>{type}</option>
                  ),
                )}
              </select>
            </label>
          </div>
          <label className="field-label">
            Required tags <span>Choose all that apply</span>
          </label>
          <div className="tag-picker">
            {[
              "Genre",
              "Character",
              "Usage",
              "Trap",
              "Dark",
              "Drums",
              "Tight",
              "Metallic",
            ].map((tag) => (
              <button
                type="button"
                className={draft.tags.includes(tag) ? "selected" : ""}
                onClick={() => toggleTag(tag)}
                key={tag}
              >
                #{tag}
              </button>
            ))}
          </div>
          <div className="upload-actions">
            <Button onClick={saveDraft}>Save draft</Button>
            <button
              className="button ghost"
              disabled={!valid || published}
              onClick={publish}
            >
              Publish for review
            </button>
          </div>
          {publishError && (
            <p className="upload-error" role="alert">
              {publishError}
            </p>
          )}
          <p className={`draft-status ${saveState}`} role="status">
            <i />
            {saveState === "saving"
              ? "Saving locally…"
              : saveState === "unavailable"
                ? "Local saving unavailable"
                : "Draft saved locally"}
          </p>
        </section>
        <aside className="upload-side">
          {canUseShortReference && (
            <section className="panel short-reference-card">
              <div className="card-title">
                <Video size={18} aria-hidden="true" />
                <h3>Short reference</h3>
              </div>
              <p>
                Use the local Short draft as discovery context for this catalog
                item.
              </p>
              <div className="short-reference-summary">
                <strong>{shortDraft.caption || "Untitled Short"}</strong>
                <span>{shortDraft.fileName || "No video selected"}</span>
                <span
                  className={`publication-pill ${shortDraft.publicationStatus}`}
                >
                  {shortStatusLabel(shortDraft.publicationStatus)}
                </span>
                <div>
                  {shortTags.length ? (
                    shortTags.map((tag) => (
                      <Badge tone="cyan" key={tag}>
                        #{tag}
                      </Badge>
                    ))
                  ) : (
                    <small>No tags yet</small>
                  )}
                </div>
              </div>
              <button
                type="button"
                className="button ghost"
                onClick={useShortReference}
                disabled={!shortTags.length && !shortDraft.caption}
              >
                Use tags here
              </button>
            </section>
          )}
          <section className="panel validation-card">
            <div className="card-title">
                <Check size={18} aria-hidden="true" />
              <h3>Publication checks</h3>
            </div>
            <p>All required fields must be complete before review.</p>
            {[
              ["File selected this session", Boolean(selectedFile)],
              ["Title added", Boolean(draft.title)],
              ["Content type", Boolean(draft.type)],
              [
                "Required tags",
                required.every((tag) => draft.tags.includes(tag)),
              ],
            ].map(([label, done]) => (
              <div className="check" key={String(label)}>
                <span className={done ? "done" : ""}>{done ? <Check size={16} aria-hidden="true" /> : <Circle size={16} aria-hidden="true" />}</span>
                {String(label)}
              </div>
            ))}
          </section>
          <section className="panel preview-card">
            <div className="card-title">
                <Play size={18} aria-hidden="true" />
              <h3>Preview output</h3>
            </div>
            <p>
              Technical previews and waveform generation will appear here after
              upload processing.
            </p>
            <Badge tone="cyan">Planned</Badge>
          </section>
        </aside>
      </div>
    </>
  );
}
