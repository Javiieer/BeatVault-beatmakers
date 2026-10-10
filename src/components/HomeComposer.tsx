import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { Image as ImageIcon, LoaderCircle, Send, Type, Video, X } from "lucide-react";
import { saveLocalHomePost, type LocalHomePost } from "../data/homePosts";

type ComposerMode = "status" | "photo" | "video";
const maxPhotoBytes = 20 * 1024 * 1024;
const maxVideoBytes = 100 * 1024 * 1024;
const mediaTypes: Record<string, { mode: "photo" | "video"; mime: string }> = {
  jpg: { mode: "photo", mime: "image/jpeg" }, jpeg: { mode: "photo", mime: "image/jpeg" },
  png: { mode: "photo", mime: "image/png" }, webp: { mode: "photo", mime: "image/webp" }, gif: { mode: "photo", mime: "image/gif" },
  mp4: { mode: "video", mime: "video/mp4" }, webm: { mode: "video", mime: "video/webm" },
};

export function HomeComposer({ scope, onPublish }: { scope: string; onPublish: (post: LocalHomePost) => void }) {
  const [mode, setMode] = useState<ComposerMode>("status");
  const [text, setText] = useState("");
  const [file, setFile] = useState<File>();
  const [previewUrl, setPreviewUrl] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const limit = mode === "video" ? maxVideoBytes : maxPhotoBytes;

  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl); }, [previewUrl]);

  const chooseMode = (next: ComposerMode) => {
    setError("");
    if (next === "status") { clearMedia(); setMode(next); return; }
    setMode(next);
    window.requestAnimationFrame(() => input.current?.click());
  };
  const clearMedia = () => {
    setFile(undefined);
    setPreviewUrl("");
    if (input.current) input.current.value = "";
  };
  const selectMedia = (event: ChangeEvent<HTMLInputElement>) => {
    const selected = event.currentTarget.files?.[0];
    if (!selected) return;
    const extension = selected.name.toLowerCase().split(".").pop() || "";
    const definition = mediaTypes[extension];
    if (!definition || definition.mode !== mode || (selected.type && selected.type.toLowerCase() !== definition.mime && !(extension === "jpg" && selected.type === "image/jpg"))) {
      setError(mode === "photo" ? "Elige una imagen JPG, PNG, WebP o GIF." : "Elige un video MP4 o WebM.");
      event.currentTarget.value = "";
      return;
    }
    if (selected.size <= 0 || selected.size > limit) {
      setError(`El archivo supera el límite de ${mode === "video" ? "100 MB" : "20 MB"}.`);
      event.currentTarget.value = "";
      return;
    }
    setError("");
    setFile(selected);
    setPreviewUrl(URL.createObjectURL(selected));
  };
  const publish = async (event: FormEvent) => {
    event.preventDefault();
    const body = text.trim();
    if (mode === "status" && !body) { setError("Escribe algo antes de publicar."); return; }
    if (mode !== "status" && !file) { setError("Selecciona un archivo para adjuntar."); return; }
    setBusy(true);
    setError("");
    try {
      const post = await saveLocalHomePost({
        scope,
        kind: mode,
        text: body,
        ...(file ? { media: file, mediaName: file.name, mimeType: file.type || mediaTypes[file.name.toLowerCase().split(".").pop() || ""].mime } : {}),
      });
      onPublish(post);
      setText("");
      clearMedia();
      setMode("status");
    } catch {
      setError("No se pudo guardar en este navegador. Revisa el espacio disponible y vuelve a intentarlo.");
    } finally { setBusy(false); }
  };

  return <form className="home-composer" onSubmit={publish}>
    <div className="home-composer-top"><span className="home-composer-avatar" aria-hidden="true">BV</span><label className="sr-only" htmlFor="home-post-text">¿Qué estás creando hoy?</label><textarea id="home-post-text" maxLength={600} placeholder="¿Qué estás creando hoy?" value={text} onChange={event => setText(event.target.value)} rows={2} /></div>
    {file && previewUrl && <div className="home-composer-preview">
      {mode === "photo" ? <img src={previewUrl} alt="Vista previa de la foto" /> : <video src={previewUrl} controls preload="metadata" aria-label="Vista previa del video" />}
      <button type="button" className="home-composer-remove" aria-label="Quitar archivo adjunto" onClick={clearMedia}><X size={16} /></button>
      <span>{file.name} · {mode === "video" ? "video" : "foto"}</span>
    </div>}
    <div className="home-composer-footer"><div className="home-composer-tools" aria-label="Tipo de publicación">
      <button type="button" className={mode === "status" ? "selected" : ""} aria-pressed={mode === "status"} onClick={() => chooseMode("status")}><Type size={16} /> Estado</button>
      <button type="button" className={mode === "photo" ? "selected" : ""} aria-pressed={mode === "photo"} onClick={() => chooseMode("photo")}><ImageIcon size={16} /> Foto</button>
      <button type="button" className={mode === "video" ? "selected" : ""} aria-pressed={mode === "video"} onClick={() => chooseMode("video")}><Video size={16} /> Video</button>
      <input ref={input} className="sr-only" type="file" accept={mode === "photo" ? "image/jpeg,image/png,image/webp,image/gif" : "video/mp4,video/webm"} onChange={selectMedia} />
    </div><button className="button home-composer-submit" type="submit" disabled={busy || (mode === "status" ? !text.trim() : !file)}>{busy ? <LoaderCircle size={15} className="home-composer-spinner" /> : <Send size={15} />}{busy ? "Guardando" : "Publicar"}</button></div>
    {error && <p className="home-composer-error" role="alert">{error}</p>}
    <p className="home-composer-local">Publicación guardada solo en este equipo · Texto máx. 600 caracteres{mode === "video" ? " · Video máx. 100 MB" : " · Foto máx. 20 MB"}</p>
  </form>;
}
