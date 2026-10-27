import { isCreatorProfile, type ProfileInput } from '../domains/profile';

type ProfileDraft = { baseline: string; draft: ProfileInput; pendingImages: boolean; savedAt: number };
const key = (accountId: string) => `beatvault:profile-draft:${encodeURIComponent(accountId)}`;
export function readProfileDraft(accountId: string): ProfileDraft | undefined {
  try {
    const raw = sessionStorage.getItem(key(accountId));
    if (!raw || raw.length > 12000) return;
    const item = JSON.parse(raw) as ProfileDraft;
    const input = item.draft;
    if (!input || typeof item.baseline !== 'string' || typeof item.pendingImages !== 'boolean' || !Number.isFinite(item.savedAt) || Date.now() - item.savedAt > 86400000 || item.savedAt > Date.now() + 60000 ||
      !isCreatorProfile({ ...input, accountId }) || input.displayName.length > 60 || input.bio.length > 320 || input.location.length > 80 || input.website.length > 200 || input.instagram.length > 31 || input.genres.length > 10 || input.genres.some(genre => genre.length > 30)) return;
    const { displayName, bio, location, website, instagram, genres, coverId, avatarId, avatarFocalPoint, coverFocalPoint, publicProfile } = input;
    return { ...item, draft: { displayName, bio, location, website, instagram, genres, coverId, avatarId, avatarFocalPoint, coverFocalPoint, publicProfile } };
  } catch { return; }
}
export function writeProfileDraft(accountId: string, baseline: ProfileInput, draft: ProfileInput, pendingImages: boolean): boolean {
  try { sessionStorage.setItem(key(accountId), JSON.stringify({ baseline: JSON.stringify(baseline), draft, pendingImages, savedAt: Date.now() })); return true; }
  catch { return false; }
}
export function clearProfileDraft(accountId: string) {
  try { sessionStorage.removeItem(key(accountId)); } catch { /* Keep unsaved UI usable when browser storage is unavailable. */ }
}
