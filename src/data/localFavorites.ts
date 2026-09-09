const favoritesKey = "beatvault:library-favorites";

export function readFavoriteIds() {
  try {
    if (typeof localStorage === "undefined") return null;
    const raw = localStorage.getItem(favoritesKey);
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

export function writeFavoriteIds(ids: Set<string>) {
  try {
    if (typeof localStorage === "undefined") return false;
    localStorage.setItem(favoritesKey, JSON.stringify([...ids]));
    return true;
  } catch {
    /* Favorites remain available for this session. */
    return false;
  }
}
