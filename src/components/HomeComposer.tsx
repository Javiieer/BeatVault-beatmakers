import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { Check, Globe, Image as ImageIcon, LoaderCircle, LockKeyhole, Send, Type, UsersRound, Video, X } from "lucide-react";
import { saveLocalHomePost, type LocalHomePost } from "../data/homePosts";
import { createSocialPost, type SocialAudience, type SocialPostView } from "../data/socialPostRepository";

type ComposerMode = "status" | "photo" | "video";
const maxPhotoBytes = 20 * 1024 * 1024;
const maxVideoBytes = 100 * 1024 * 1024;
const mediaTypes: Record<string, { mode: "photo" | "video"; mime: string }> = {
  jpg: { mode: "photo", mime: "image/jpeg" }, jpeg: { mode: "photo", mime: "image/jpeg" },
  png: { mode: "photo", mime: "image/png" },
  mp4: { mode: "video", mime: "video/mp4" },
};
const audienceLabels: Record<SocialAudience, string> = { private: "Solo yo", friends: "Amigos", public: "Público" };

export function HomeComposer({ scope, onPublish }: { scope: string; onPublish: (post: LocalHomePost | SocialPostView) => void }) {
  const authenticated = scope !== "demo";
  const [mode, setMode] = useState<ComposerMode>("status");
  const [text, setText] = useState("");
  const [file, setFile] = useState<File>();
  const [previewUrl, setPreviewUrl] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [audience, setAudience] = useState<SocialAudience>("private");
  const [audienceMenuOpen, setAudienceMenuOpen] = useState(false);
  const [audienceMenuPlacement, setAudienceMenuPlacement] = useState<"above" | "below">("above");
  const input = useRef<HTMLInputElement>(null);
  const audienceControl = useRef<HTMLDivElement>(null);
  const audienceTrigger = useRef<HTMLButtonElement>(null);
  const limit = mode === "video" ? maxVideoBytes : maxPhotoBytes;

  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl); }, [previewUrl]);
  useEffect(() => {
    if (!audienceMenuOpen) return;
    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (!audienceControl.current?.contains(event.target as Node)) setAudienceMenuOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setAudienceMenuOpen(false);
      audienceTrigger.current?.focus();
    };
    document.addEventListener("pointerdown", closeOnOutsidePointer);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePointer);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [audienceMenuOpen]);

  const chooseMode = (next: ComposerMode) => {
    setError("");
    if (next === "status") { clearMedia(); setMode(next); return; }
    if ((mode === "photo" || mode === "video") && mode !== next) clearMedia();
    setMode(next);
    window.requestAnimationFrame(() => input.current?.click());
  };
  const clearMedia = () => {
    setFile(undefined);
    setPreviewUrl("");
    if (input.current) input.current.value = "";
  };
  const toggleAudienceMenu = () => {
    if (audienceMenuOpen) {
      setAudienceMenuOpen(false);
      return;
    }
    const triggerBounds = audienceTrigger.current?.getBoundingClientRect();
    const spaceAbove = triggerBounds?.top ?? 0;
    const spaceBelow = window.innerHeight - (triggerBounds?.bottom ?? 0);
    setAudienceMenuPlacement(spaceAbove >= 132 || spaceAbove > spaceBelow ? "above" : "below");
    setAudienceMenuOpen(true);
  };
  const selectMedia = (event: ChangeEvent<HTMLInputElement>) => {
    const selected = event.currentTarget.files?.[0];
    if (!selected) return;
    const extension = selected.name.toLowerCase().split(".").pop() || "";
    const definition = mediaTypes[extension];
    if (!definition || definition.mode !== mode || (selected.type && selected.type.toLowerCase() !== definition.mime && !(extension === "jpg" && selected.type === "image/jpg"))) {
      setError(mode === "photo" ? "Elige una imagen JPG o PNG." : "Elige un video MP4.");
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
      if (authenticated) {
        const result = await createSocialPost({ kind: mode, body, audience, ...(file ? { file } : {}) });
        if (!result.ok) { setError(result.error.message); return; }
        onPublish(result.data);
      } else {
        const post = await saveLocalHomePost({
          scope,
          kind: mode,
          text: body,
          ...(file ? { media: file, mediaName: file.name, mimeType: file.type || mediaTypes[file.name.toLowerCase().split(".").pop() || ""].mime } : {}),
        });
        onPublish(post);
      }
      setText("");
      clearMedia();
      setMode("status");
      setAudience("private");
    } catch {
      setError(authenticated ? "No se pudo publicar en BeatVault. Revisa tu conexión e inténtalo de nuevo." : "No se pudo guardar en este navegador. Revisa el espacio disponible y vuelve a intentarlo.");
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
      <input ref={input} className="sr-only" type="file" accept={mode === "photo" ? "image/jpeg,image/png" : "video/mp4"} onChange={selectMedia} />
    </div><div className="home-composer-submit-row"><div className="home-audience-control" ref={audienceControl}>
      <button ref={audienceTrigger} className="home-audience-trigger" type="button" title={`Privacidad: ${audienceLabels[audience]}`} aria-label={`Privacidad de la publicación: ${audienceLabels[audience]}`} aria-expanded={audienceMenuOpen} aria-controls={audienceMenuOpen ? "home-audience-menu" : undefined} onClick={toggleAudienceMenu}>
        <span className="home-audience-icon" data-audience={audience} aria-hidden="true">{audience === "public" ? <Globe size={17} /> : audience === "friends" ? <UsersRound size={17} /> : <LockKeyhole size={17} />}</span>
      </button>
      {audienceMenuOpen && <div className="home-audience-menu" id="home-audience-menu" data-placement={audienceMenuPlacement} role="group" aria-label="Privacidad de la publicación">
        {(["public", "friends", "private"] as const).map(option => <button key={option} type="button" className="home-audience-option" aria-pressed={audience === option} onClick={() => { setAudience(option); setAudienceMenuOpen(false); audienceTrigger.current?.focus(); }}>
          {option === "public" ? <Globe size={16} aria-hidden="true" /> : option === "friends" ? <UsersRound size={16} aria-hidden="true" /> : <LockKeyhole size={16} aria-hidden="true" />}
          <span>{audienceLabels[option]}</span>{audience === option && <Check className="home-audience-check" size={15} aria-hidden="true" />}
        </button>)}
      </div>}
    </div><button className="button home-composer-submit" type="submit" disabled={busy || (mode === "status" ? !text.trim() : !file)}>{busy ? <LoaderCircle size={15} className="home-composer-spinner" /> : <Send size={15} />}{busy ? "Publicando" : "Publicar"}</button></div></div>
    {error && <p className="home-composer-error" role="alert">{error}</p>}
    <p className="home-composer-local">{authenticated ? "La publicación se guarda en tu cuenta." : "Publicación guardada solo en este equipo."} · Texto máx. 600 caracteres{mode === "video" ? " · Video MP4 máx. 100 MB" : mode === "photo" ? " · Foto JPG/PNG máx. 20 MB" : ""}</p>
  </form>;
}
