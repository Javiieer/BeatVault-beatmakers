export const profileCoverIds = ['808', 'orchestra', 'lo-fi'] as const;
export type ProfileCover = typeof profileCoverIds[number];
export interface CreatorProfile {
  accountId: string;
  displayName: string;
  bio: string;
  location: string;
  website: string;
  instagram: string;
  genres: string[];
  coverId: ProfileCover;
  avatarId: ProfileCover | 'initials';
  publicProfile: boolean;
}
export type ProfileInput = Omit<CreatorProfile, 'accountId'>;
export const emptyProfile = (accountId: string): CreatorProfile => ({ accountId, displayName: 'Productor', bio: '', location: '', website: '', instagram: '', genres: [], coverId: 'lo-fi', avatarId: 'initials', publicProfile: false });
export function isCreatorProfile(value: unknown): value is CreatorProfile {
  if (!value || typeof value !== 'object') return false;
  const p = value as CreatorProfile;
  return typeof p.accountId === 'string' && typeof p.displayName === 'string' && typeof p.bio === 'string' &&
    typeof p.location === 'string' && typeof p.website === 'string' && typeof p.instagram === 'string' &&
    Array.isArray(p.genres) && p.genres.every(g => typeof g === 'string') &&
    profileCoverIds.includes(p.coverId) && ['initials', ...profileCoverIds].includes(p.avatarId) && typeof p.publicProfile === 'boolean';
}
