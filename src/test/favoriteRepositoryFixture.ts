// Component fixtures use the existing scoped seeds as a fake server store.
// Real HTTP decoding, migration and account binding are tested in the repository suite.
import { readFavoriteIds, writeFavoriteIds } from '../data/localFavorites'
export const favoriteRepositoryFixture = {
  loadAccountFavorites: async (userId: string) => ({ ok: true as const, data: { accountId: userId, contentIds: [...(readFavoriteIds(userId) || [])] } }),
  setAccountFavorite: async (userId: string, id: string, saved: boolean) => {
    const ids = readFavoriteIds(userId) || new Set<string>()
    if (saved) ids.add(id); else ids.delete(id)
    writeFavoriteIds(ids, userId)
    return { ok: true as const, data: { accountId: userId, contentIds: [...ids] } }
  },
  publishFavoriteChange: (userId: string) => window.dispatchEvent(new CustomEvent('beatvault:favorites-changed', { detail: { userId } })),
}
