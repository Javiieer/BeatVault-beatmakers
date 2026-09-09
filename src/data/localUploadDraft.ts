export type FileMetadata = {
  name: string;
  size: string;
  mime: string;
  durationSeconds: number | null;
  fileReference: "session-only";
};

export type UploadDraft = {
  title: string;
  type: string;
  file: string;
  fileMetadata?: FileMetadata;
  tags: string[];
};

export const maxUploadFileSize = 500 * 1024 * 1024;
export const supportedAudioMimeTypes = [
  "audio/aac", "audio/flac", "audio/mpeg", "audio/mp4", "audio/ogg",
  "audio/wav", "audio/webm", "audio/x-m4a", "audio/x-wav",
] as const;
const supportedAudioExtensions = ["aac", "flac", "mp3", "m4a", "ogg", "wav", "webm"];

export type UploadFileError = "empty" | "too-large" | "unsupported-audio";

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let size = bytes;
  let unit = -1;
  do { size /= 1024; unit += 1; } while (size >= 1024 && unit < units.length - 1);
  return `${size.toFixed(size >= 10 ? 0 : 1)} ${units[unit]}`;
}

export function formatDuration(seconds: number | null): string {
  if (seconds === null) return "Not available";
  const wholeSeconds = Math.floor(seconds);
  return `${Math.floor(wholeSeconds / 60)}:${String(wholeSeconds % 60).padStart(2, "0")}`;
}

export function validateUploadFile(file: Pick<File, "name" | "size" | "type">): UploadFileError | null {
  if (!file.name.trim() || file.size <= 0) return "empty";
  if (file.size > maxUploadFileSize) return "too-large";
  const extension = file.name.toLowerCase().split(".").pop() ?? "";
  const supportedMime = !file.type || (supportedAudioMimeTypes as readonly string[]).includes(file.type);
  const supportedExtension = supportedAudioExtensions.includes(extension);
  if (!supportedMime && !supportedExtension) return "unsupported-audio";
  return null;
}

const draftKey = "beatvault:upload-draft";
export const emptyUploadDraft: UploadDraft = {
  title: "",
  type: "",
  file: "",
  tags: [],
};

function isFileMetadata(value: unknown): value is FileMetadata {
  if (!value || typeof value !== "object") return false;
  const metadata = value as Partial<FileMetadata>;
  return (
    typeof metadata.name === "string" &&
    typeof metadata.size === "string" &&
    typeof metadata.mime === "string" &&
    metadata.fileReference === "session-only" &&
    (metadata.durationSeconds === null ||
      (typeof metadata.durationSeconds === "number" &&
        Number.isFinite(metadata.durationSeconds) &&
        metadata.durationSeconds >= 0))
  );
}

export function readUploadDraft(): UploadDraft {
  try {
    if (typeof localStorage === "undefined") return emptyUploadDraft;
    const value = JSON.parse(
      localStorage.getItem(draftKey) ?? "null",
    ) as Partial<UploadDraft> | null;
    if (!value || typeof value !== "object") return emptyUploadDraft;
    const file = typeof value.file === "string" ? value.file : "";
    const fileMetadata = isFileMetadata(value.fileMetadata) && value.fileMetadata.name === file
      ? value.fileMetadata
      : undefined;
    return {
      title: typeof value.title === "string" ? value.title : "",
      type: typeof value.type === "string" ? value.type : "",
      file,
      fileMetadata,
      tags: Array.isArray(value.tags)
        ? value.tags.filter((tag): tag is string => typeof tag === "string")
        : [],
    };
  } catch {
    return emptyUploadDraft;
  }
}

export function writeUploadDraft(draft: UploadDraft) {
  try {
    if (typeof localStorage === "undefined") return false;
    localStorage.setItem(draftKey, JSON.stringify(draft));
    return true;
  } catch {
    return false;
  }
}
