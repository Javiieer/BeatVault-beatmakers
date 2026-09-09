import { useEffect, useRef, useState } from "react";
import type { AudioAsset } from "../types";
import { Badge } from "./ui-primitives";
import { Download, Heart, LoaderCircle, Pause, Play, Volume2, X, MoreVertical } from "lucide-react";

export function Waveform({ data }: { data: number[] }) {
  return (
    <div className="waveform" aria-label="Waveform placeholder">
      {data.map((height, i) => (
        <i key={i} style={{ height: `${height}%` }} />
      ))}
    </div>
  );
}
function safeDownloadName(asset: AudioAsset) {
  const base =
    asset.name
      .replace(/[^a-z0-9]+/gi, "-")
      .replace(/^-+|-+$/g, "")
      .toLowerCase() || asset.id;
  const extension =
    asset.metadata.format.replace(/[^a-z0-9]/gi, "").toLowerCase() || "wav";
  return `${base}.${extension}`;
}
export function AssetRow({
  asset,
  favorite = asset.favorite,
  onFavorite,
  onPlay,
  onEdit,
  onDelete,
}: {
  asset: AudioAsset;
  favorite?: boolean;
  onFavorite?: () => void;
  onPlay?: (asset: AudioAsset) => void;
  onEdit?: () => void;
  onDelete?: () => void;
}) {
  const preview = () => {
    if (!asset.previewUrl) return;
    onPlay?.(asset);
    window.dispatchEvent(
      new CustomEvent("beatvault:preview", { detail: asset }),
    );
  };
  const canDownload = Boolean(asset.downloadUrl);
  return (
    <div className="asset-row">
      <button
        type="button"
         className="play-disc"
         aria-label={`Preview ${asset.name}`}
         disabled={!asset.previewUrl}
        onClick={preview}
      >
         <Play size={15} fill="currentColor" aria-hidden="true" />
      </button>
      <div className="asset-color" style={{ background: asset.color }}>
        {asset.cover && (
          <img
            src={asset.cover}
            alt={`Cover art for ${asset.name}`}
            onError={(event) => {
              event.currentTarget.hidden = true;
            }}
          />
        )}
      </div>
       <div className="asset-name">
        <strong>{asset.name}</strong>
         <span>
           {asset.type} · {asset.metadata.format}
         </span>
         {asset.accessState && <small role="status">{asset.accessState === "included-demo" ? "Included/demo" : asset.accessState === "preview-only" ? "Preview only" : asset.accessState === "owned-metadata-only" ? "Owned / metadata-only" : "Unavailable"}</small>}
         {asset.contents && <small>Contents: {asset.contents.map((content) => content.name).join(", ")}</small>}
        {!asset.previewUrl && asset.localAvailability && <small role="status">{asset.localAvailability === "metadata-only" || asset.localAvailability === "missing" ? "Preview no disponible. Selecciona el archivo de nuevo en Upload." : "Preview no disponible"}</small>}
        <div className="asset-tags">
          {asset.collection && <Badge tone="teal">{asset.collection}</Badge>}
          {asset.licenseLabel && <Badge>{asset.licenseLabel}</Badge>}
          {asset.tags.map((tag) => (
            <Badge tone={tag.tone} key={tag.label}>
              #{tag.label}
            </Badge>
          ))}
        </div>
      </div>
      <Waveform data={asset.waveform} />
      <span className="meta">
        {asset.metadata.bpm ? `${asset.metadata.bpm} BPM` : "One-shot"}
      </span>
      <span className="meta">{asset.metadata.key ?? "—"}</span>
      <div className="asset-actions">
        {onEdit && <button type="button" className="icon-button" aria-label={`Edit ${asset.name}`} onClick={onEdit}><MoreVertical size={16} aria-hidden="true" /></button>}
        {canDownload && (
          <a
            className="download-link"
            href={asset.downloadUrl}
            download={safeDownloadName(asset)}
            aria-label={`Download ${asset.name}`}
          >
            <Download size={16} aria-hidden="true" />
          </a>
        )}
        <button
          type="button"
          className="heart"
          aria-label={`${favorite ? "Remove" : "Add"} ${asset.name} ${favorite ? "from" : "to"} favorites`}
          aria-pressed={favorite}
          onClick={onFavorite}
        >
          <Heart
            size={17}
            fill={favorite ? "currentColor" : "none"}
            aria-hidden="true"
          />
        </button>
        {onDelete && <button type="button" className="text-button" onClick={onDelete}>Archive</button>}
      </div>
    </div>
  );
}

export function AudioPlayer({ asset }: { asset?: AudioAsset }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [volume, setVolume] = useState(0.8);
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.pause();
    audio.currentTime = 0;
    setCurrentTime(0);
    setDuration(0);
    setPlaying(false);
    setError("");
    setLoading(false);
    if (!asset) return;
    if (!asset.previewUrl) {
      setError("Este asset no tiene preview disponible.");
      return;
    }
    setLoading(true);
    let cancelled = false;
    audio.src = asset.previewUrl;
    audio.load();
    audio
      .play()
      .then(() => {
        if (cancelled) return;
        setPlaying(true);
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setLoading(false);
        setError("No se pudo reproducir el preview.");
      });
    return () => {
      cancelled = true;
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
    };
  }, [asset]);
  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = volume;
  }, [volume]);
  const togglePlayback = () => {
    const audio = audioRef.current;
    if (!audio || !asset?.previewUrl) return;
    if (!audio.src) {
      audio.src = asset.previewUrl;
      audio.load();
    }
    if (audio.paused)
      audio
        .play()
        .then(() => setPlaying(true))
        .catch(() => setError("No se pudo reproducir el preview."));
    else audio.pause();
  };
  const formatTime = (value: number) =>
    `${Math.floor(value / 60)}:${String(Math.floor(value % 60)).padStart(2, "0")}`;
  const seek = (value: number) => {
    if (audioRef.current) audioRef.current.currentTime = value;
    setCurrentTime(value);
  };
  const changeVolume = (value: number) => {
    setVolume(value);
    if (audioRef.current) audioRef.current.volume = value;
  };
  const clear = () => {
    const audio = audioRef.current;
    audio?.pause();
    audio?.removeAttribute("src");
    audio?.load();
    setPlaying(false);
    setCurrentTime(0);
    setDuration(0);
    setError("");
    setLoading(false);
  };
  const hasPlayableDuration = Boolean(asset?.previewUrl && duration > 0);
  return (
    <footer
      className={`player${error ? " has-error" : ""}`}
      aria-busy={loading}
      data-state={loading ? "loading" : error ? "error" : playing ? "playing" : "paused"}
    >
      <audio
        ref={audioRef}
        onTimeUpdate={(event) =>
          setCurrentTime(event.currentTarget.currentTime)
        }
        onLoadedMetadata={(event) => {
          setDuration(
            Number.isFinite(event.currentTarget.duration)
              ? event.currentTarget.duration
              : 0,
          );
          setLoading(false);
        }}
        onWaiting={() => setLoading(true)}
        onCanPlay={() => setLoading(false)}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
        onError={() => {
          setLoading(false);
          setError("No se pudo cargar el preview.");
        }}
      />
      <button
        type="button"
        className="player-play"
        aria-label={loading ? "Loading preview" : playing ? "Pause preview" : error ? "Preview unavailable" : "Play preview"}
        aria-pressed={playing}
        disabled={!asset?.previewUrl || loading || Boolean(error)}
        onClick={togglePlayback}
      >
        {loading ? (
          <LoaderCircle className="player-loading" size={17} aria-hidden="true" />
        ) : playing ? (
          <Pause size={17} aria-hidden="true" />
        ) : (
          <Play size={17} fill="currentColor" aria-hidden="true" />
        )}
      </button>
      <div className="now-playing">
        <strong>{asset?.name ?? "No asset selected"}</strong>
        <span>
          {loading
            ? "Loading preview…"
            : error || asset?.label || "Select an asset to preview"}
        </span>
      </div>
      <div
        className={`player-progress${hasPlayableDuration ? "" : " inactive"}`}
      >
        <input
          type="range"
          min="0"
          max={duration || 0}
          step="0.01"
          value={Math.min(currentTime, duration || 0)}
          aria-label="Audio progress"
          disabled={!hasPlayableDuration || loading}
          onChange={(event) => seek(Number(event.target.value))}
        />
        <div className="time">
          <span>{formatTime(currentTime)}</span>
          <span>{formatTime(duration)}</span>
        </div>
      </div>
      <label className="volume" aria-label="Volume">
        <Volume2 size={15} aria-hidden="true" />
        <input
          type="range"
          min="0"
          max="1"
          step="0.01"
          value={volume}
          aria-label="Audio volume"
          onChange={(event) => changeVolume(Number(event.target.value))}
        />
      </label>
      <button
        type="button"
        className="queue"
        aria-label="Clear player"
        onClick={clear}
      >
        <X size={17} aria-hidden="true" />
      </button>
    </footer>
  );
}
