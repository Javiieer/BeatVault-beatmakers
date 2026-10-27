import { scopedKey } from './storageScope';

const favoritesKey = "beatvault:library-favorites";

export function readFavoriteIds(scope?: string) {
  try {
    if (typeof localStorage === "undefined") return null;
    const raw = localStorage.getItem(scopedKey(favoritesKey, scope));
    if (raw === null) return null;
    const value: unknown = JSON.parse(raw);
    return new Set(
      Array.isArray(value)
        ? value.filter((id): id is string => typeof id === "string")
        : [],
    );
  } catch {
    return null;
  }
}

export function writeFavoriteIds(ids: Set<string>, scope?: string) {
  try {
    if (typeof localStorage === "undefined") return false;
    localStorage.setItem(scopedKey(favoritesKey, scope), JSON.stringify([...ids]));
    return true;
  } catch {
    /* Favorites remain available for this session. */
    return false;
  }
}
