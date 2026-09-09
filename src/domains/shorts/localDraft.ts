export type ShortDraftStatus = "draft" | "pending" | "published" | "archived";

export type ShortDraft = {
  caption: string;
  tags: string;
  fileName: string;
  publicationStatus: ShortDraftStatus;
  savedAt?: string;
};

export const shortsDraftKey = "beatvault-shorts-draft";
export const shortDraftChangedEvent = "beatvault:short-draft-changed";
export const shortsLikesKey = "beatvault:shorts-liked";
export const shortsSavesKey = "beatvault:shorts-saved";
export const shortsFollowsKey = "beatvault:shorts-followed";

export const emptyShortDraft: ShortDraft = {
  caption: "",
  tags: "",
  fileName: "",
  publicationStatus: "draft",
};

function isShortDraftStatus(value: unknown): value is ShortDraftStatus {
  return (
    value === "draft" ||
    value === "pending" ||
    value === "published" ||
    value === "archived"
  );
}

export function parseShortTags(value: string) {
  const tags = value
    .split(/[\s,]+/)
    .map((tag) => tag.trim().replace(/^#/, ""))
    .filter(Boolean);

  return Array.from(new Set(tags));
}

export function hasShortDraft(draft: ShortDraft) {
  return Boolean(
    draft.fileName.trim() || draft.caption.trim() || parseShortTags(draft.tags).length,
  );
}

export function canSendShortDraft(draft: ShortDraft) {
  return Boolean(
    draft.fileName.trim() && draft.caption.trim() && parseShortTags(draft.tags).length,
  );
}

export function canPublishShortDraft(draft: ShortDraft, fileAvailable: boolean) {
  return fileAvailable && canSendShortDraft(draft);
}

export function readShortIdSet(key: string, legacyKey?: string) {
  try {
    if (typeof localStorage === "undefined") return new Set<string>();
    const read = (storageKey: string) => {
      const value: unknown = JSON.parse(localStorage.getItem(storageKey) ?? "[]");
      return new Set(
        Array.isArray(value)
          ? value.filter((id): id is string => typeof id === "string")
          : [],
      );
    };
    const current = read(key);
    if (legacyKey && current.size === 0) {
      const legacy = read(legacyKey);
      if (legacy.size) writeShortIdSet(key, legacy);
      return legacy;
    }
    return current;
  } catch {
    return new Set<string>();
  }
}

export function writeShortIdSet(key: string, ids: Set<string>) {
  try {
    if (typeof localStorage === "undefined") return false;
    localStorage.setItem(key, JSON.stringify([...ids]));
    return true;
  } catch {
    return false;
  }
}

export function readShortDraft(): ShortDraft {
  try {
    if (typeof localStorage === "undefined") return { ...emptyShortDraft };
    const value: unknown = JSON.parse(
      localStorage.getItem(shortsDraftKey) ?? "null",
    );
    if (!value || typeof value !== "object") return { ...emptyShortDraft };

    const draft = value as Partial<ShortDraft>;
    return {
      caption: typeof draft.caption === "string" ? draft.caption : "",
      tags: typeof draft.tags === "string" ? draft.tags : "",
      fileName: typeof draft.fileName === "string" ? draft.fileName : "",
      publicationStatus: isShortDraftStatus(draft.publicationStatus)
        ? draft.publicationStatus
        : "draft",
      savedAt: typeof draft.savedAt === "string" ? draft.savedAt : undefined,
    };
  } catch {
    return { ...emptyShortDraft };
  }
}

export function writeShortDraft(draft: ShortDraft) {
  try {
    if (typeof localStorage === "undefined") return false;
    localStorage.setItem(shortsDraftKey, JSON.stringify(draft));
    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent(shortDraftChangedEvent, { detail: draft }),
      );
    }
    return true;
  } catch {
    return false;
  }
}

export function saveShortDraft(draft: ShortDraft) {
  const next = { ...draft, savedAt: new Date().toISOString() };
  return { draft: next, saved: writeShortDraft(next) };
}

export function updateShortDraftStatus(
  draft: ShortDraft,
  publicationStatus: ShortDraftStatus,
) {
  const next = {
    ...draft,
    publicationStatus,
    savedAt: new Date().toISOString(),
  };
  return { draft: next, saved: writeShortDraft(next) };
}

export function shortStatusLabel(status: ShortDraftStatus) {
  if (status === "pending") return "Pending review";
  if (status === "published") return "Published";
  if (status === "archived") return "Archived";
  return "Draft";
}
