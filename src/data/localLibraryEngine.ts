import { formatFileSize, validateUploadFile, type FileMetadata, type UploadFileError } from "./localUploadDraft";

export type ImportStatus = "pending" | "validating" | "ready" | "rejected" | "metadata-unavailable" | "preview-unavailable";
export type ImportQueueItem = { id: string; file: File; status: ImportStatus; error?: string; metadata?: FileMetadata; previewUrl?: string };

export function importErrorMessage(error: UploadFileError): string {
  if (error === "empty") return "El archivo está vacío o no tiene nombre.";
  if (error === "too-large") return "El archivo supera el límite local de 500 MB.";
  return "Formato o MIME no soportado. Usa MP3, WAV, FLAC, M4A, OGG, AAC o WEBM.";
}

export function createImportQueue(files: readonly File[]): ImportQueueItem[] {
  const seen = new Set<string>();
  return files.flatMap((file, index) => {
    const key = `${file.name}-${file.size}-${file.lastModified}`;
    if (seen.has(key)) return [];
    seen.add(key);
    return [{ id: `${key}-${index}`, file, status: "pending" as const }];
  });
}

export function validateImportItem(item: ImportQueueItem): ImportQueueItem {
  const error = validateUploadFile(item.file);
  return error ? { ...item, status: "rejected", error: importErrorMessage(error) } : { ...item, status: "validating" };
}

export function updateImportItem(
  queue: readonly ImportQueueItem[],
  id: string,
  change: Partial<ImportQueueItem>,
): ImportQueueItem[] {
  return queue.map((item) => item.id === id ? { ...item, ...change } : item);
}

export function metadataFromFile(file: Pick<File, "name" | "size" | "type">, durationSeconds: number | null): FileMetadata {
  return { name: file.name, size: formatFileSize(file.size), mime: file.type, durationSeconds, fileReference: "session-only" };
}

export function localAvailabilityForImport(status: ImportStatus, hasPreview: boolean): "session-preview" | "metadata-only" | "preview-unavailable" | "rejected" {
  if (status === "rejected") return "rejected";
  if (status === "preview-unavailable" || status === "metadata-unavailable") return "preview-unavailable";
  return hasPreview ? "session-preview" : "metadata-only";
}
