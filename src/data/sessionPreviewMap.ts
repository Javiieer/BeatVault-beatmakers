export type SessionPreviewMap = ReadonlyMap<string, string>;

export function setSessionPreview(
  current: SessionPreviewMap,
  assetId: string,
  previewUrl: string,
  revoke: (url: string) => void,
): Map<string, string> {
  const next = new Map(current);
  const previous = next.get(assetId);
  if (previous && previous !== previewUrl) revoke(previous);
  next.set(assetId, previewUrl);
  return next;
}

export function removeSessionPreview(
  current: SessionPreviewMap,
  assetId: string,
  revoke: (url: string) => void,
): Map<string, string> {
  const next = new Map(current);
  const previewUrl = next.get(assetId);
  if (previewUrl) {
    revoke(previewUrl);
    next.delete(assetId);
  }
  return next;
}

export function clearSessionPreviews(
  current: SessionPreviewMap,
  revoke: (url: string) => void,
): Map<string, string> {
  current.forEach(revoke);
  return new Map();
}
