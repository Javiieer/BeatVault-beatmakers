import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react'
import { Check, Globe, Image as ImageIcon, LoaderCircle, LockKeyhole, Send, Type, UsersRound, Video, X } from 'lucide-react'
import { createSocialStory, type SocialStoryKind, type SocialStoryView } from '../data/socialStoryRepository'
import type { SocialAudience } from '../data/socialPostRepository'
import { imageUploadAccept, imageUploadMime } from '../domains/media/imageFormats'
import '../styles/home-story-composer.css'

const photoLimitBytes = 20 * 1024 * 1024
const videoLimitBytes = 100 * 1024 * 1024
const audienceLabels: Record<SocialAudience, string> = { private: 'Solo yo', friends: 'Amigos', public: 'Público' }

export function HomeStoryComposer({ open, onClose, onPublish }: { open: boolean; onClose: () => void; onPublish: (story: SocialStoryView) => void }) {
  const [kind, setKind] = useState<SocialStoryKind>('status')
  const [body, setBody] = useState('')
  const [audience, setAudience] = useState<SocialAudience>('private')
  const [file, setFile] = useState<File>()
  const [previewUrl, setPreviewUrl] = useState('')
  const [error, setError] = useState('')
  const [videoDuration, setVideoDuration] = useState<number>()
  const [busy, setBusy] = useState(false)
  const [audienceMenuOpen, setAudienceMenuOpen] = useState(false)
  const dialog = useRef<HTMLDialogElement>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const audienceControl = useRef<HTMLDivElement>(null)
  const audienceTrigger = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (open && !dialog.current?.open) dialog.current?.showModal()
    else if (!open && dialog.current?.open) dialog.current.close()
  }, [open])
  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl) }, [previewUrl])
  useEffect(() => {
    if (!audienceMenuOpen) return
    const closeOutside = (event: PointerEvent) => { if (!audienceControl.current?.contains(event.target as Node)) setAudienceMenuOpen(false) }
    const closeEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') setAudienceMenuOpen(false) }
    document.addEventListener('pointerdown', closeOutside)
    document.addEventListener('keydown', closeEscape)
    return () => { document.removeEventListener('pointerdown', closeOutside); document.removeEventListener('keydown', closeEscape) }
  }, [audienceMenuOpen])

  const clearFile = () => {
    setFile(undefined)
    setVideoDuration(undefined)
    setPreviewUrl('')
    if (fileInput.current) fileInput.current.value = ''
  }
  const selectKind = (next: SocialStoryKind) => {
    setKind(next)
    setError('')
    if (next === 'status') { clearFile(); return }
    if (kind !== 'status' && kind !== next) clearFile()
    window.requestAnimationFrame(() => fileInput.current?.click())
  }
  const selectFile = (event: ChangeEvent<HTMLInputElement>) => {
    const selected = event.currentTarget.files?.[0]
    if (!selected) return
    const extension = selected.name.toLowerCase().split('.').pop()
    const accepted = kind === 'photo'
      ? Boolean(imageUploadMime(selected))
      : extension === 'mp4' && (!selected.type || selected.type.toLowerCase() === 'video/mp4')
    const limit = kind === 'video' ? videoLimitBytes : photoLimitBytes
    if (!accepted) { setError(kind === 'photo' ? 'Elige una imagen JPG, PNG, WebP o AVIF.' : 'Elige un video MP4.'); event.currentTarget.value = ''; return }
    if (selected.size <= 0 || selected.size > limit) { setError(`El archivo supera el límite de ${kind === 'video' ? '100 MB' : '20 MB'}.`); event.currentTarget.value = ''; return }
    clearFile()
    setFile(selected)
    setPreviewUrl(URL.createObjectURL(selected))
    setError('')
  }
  const publish = async (event: FormEvent) => {
    event.preventDefault()
    if (kind === 'status' && !body.trim()) { setError('Escribe algo para tu historia.'); return }
    if (kind !== 'status' && !file) { setError('Selecciona una foto o un video.'); return }
    if (kind === 'video' && videoDuration !== undefined && videoDuration > 30) { setError('El video de una historia no puede durar más de 30 segundos.'); return }
    setBusy(true)
    setError('')
    try {
      const result = await createSocialStory({ kind, body: body.trim(), audience, ...(file ? { file } : {}) })
      if (!result.ok) { setError(result.error.message); return }
      onPublish(result.data)
      onClose()
      setBody('')
      setAudience('private')
      setKind('status')
      clearFile()
    } catch { setError('No se pudo publicar la historia. Revisa tu conexión e inténtalo de nuevo.') }
    finally { setBusy(false) }
  }

  return <dialog ref={dialog} className="home-story-composer" aria-labelledby="home-story-composer-title" onClose={onClose} onClick={event => { if (event.target === dialog.current) onClose() }}>
    <header><div><span className="eyebrow">HOME · HISTORIAS</span><h2 id="home-story-composer-title">Crear historia</h2><p>Visible durante 24 horas</p></div><button type="button" className="icon-button" aria-label="Cerrar historia" onClick={onClose}><X size={18} /></button></header>
    <form onSubmit={publish}>
      <label className="sr-only" htmlFor="home-story-text">Texto de la historia</label>
      <textarea id="home-story-text" maxLength={600} value={body} onChange={event => setBody(event.target.value)} placeholder={kind === 'status' ? '¿Qué quieres compartir?' : 'Agrega una descripción (opcional)'} rows={3} />
      {file && previewUrl && <div className="home-story-upload-preview">
        {kind === 'photo' ? <img src={previewUrl} alt="Vista previa de la historia" /> : <video src={previewUrl} controls playsInline preload="metadata" aria-label="Vista previa del video de la historia" onLoadedMetadata={event => setVideoDuration(event.currentTarget.duration)} />}
        <button type="button" className="icon-button" aria-label="Quitar archivo" onClick={clearFile}><X size={16} /></button>
        <span>{file.name}{kind === 'video' && videoDuration !== undefined ? ` · ${Math.ceil(videoDuration)} s` : ''}</span>
      </div>}
      <div className="home-story-composer-actions">
        <div className="home-story-kind-tools" role="group" aria-label="Tipo de historia">
          <button type="button" className={kind === 'status' ? 'selected' : ''} aria-pressed={kind === 'status'} onClick={() => selectKind('status')}><Type size={16} /> Texto</button>
          <button type="button" className={kind === 'photo' ? 'selected' : ''} aria-pressed={kind === 'photo'} onClick={() => selectKind('photo')}><ImageIcon size={16} /> Foto</button>
          <button type="button" className={kind === 'video' ? 'selected' : ''} aria-pressed={kind === 'video'} onClick={() => selectKind('video')}><Video size={16} /> Video</button>
          <input ref={fileInput} className="sr-only" type="file" accept={kind === 'photo' ? imageUploadAccept : 'video/mp4'} onChange={selectFile} />
        </div>
        <div className="home-story-composer-submit">
          <div className="home-audience-control" ref={audienceControl}>
            <button ref={audienceTrigger} className="home-audience-trigger" type="button" title={`Privacidad: ${audienceLabels[audience]}`} aria-label={`Privacidad de la historia: ${audienceLabels[audience]}`} aria-expanded={audienceMenuOpen} onClick={() => setAudienceMenuOpen(value => !value)}>
              <span className="home-audience-icon" data-audience={audience} aria-hidden="true">{audience === 'public' ? <Globe size={17} /> : audience === 'friends' ? <UsersRound size={17} /> : <LockKeyhole size={17} />}</span>
            </button>
            {audienceMenuOpen && <div className="home-audience-menu" role="group" aria-label="Privacidad de la historia">
              {(['public', 'friends', 'private'] as const).map(option => <button key={option} type="button" className="home-audience-option" aria-pressed={audience === option} onClick={() => { setAudience(option); setAudienceMenuOpen(false); audienceTrigger.current?.focus() }}>
                {option === 'public' ? <Globe size={16} /> : option === 'friends' ? <UsersRound size={16} /> : <LockKeyhole size={16} />}<span>{audienceLabels[option]}</span>{audience === option && <Check size={15} />}
              </button>)}
            </div>}
          </div>
          <button className="button" type="submit" disabled={busy || (kind === 'status' ? !body.trim() : !file) || kind === 'video' && videoDuration !== undefined && videoDuration > 30}>{busy ? <LoaderCircle size={15} className="home-composer-spinner" /> : <Send size={15} />}{busy ? 'Publicando…' : 'Compartir historia'}</button>
        </div>
      </div>
      {error && <p className="home-composer-error" role="alert">{error}</p>}
      <p className="home-story-composer-note">JPG/PNG hasta 20 MB · MP4 hasta 100 MB y 30 segundos · Privacidad inicial: Solo yo</p>
    </form>
  </dialog>
}
