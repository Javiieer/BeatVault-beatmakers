export const profileCoverIds = ['808', 'orchestra', 'lo-fi'] as const;
export type ProfileCover = typeof profileCoverIds[number];
export type ProfileImageKind = 'avatar' | 'cover';
export interface ProfileImageRecord {
  storageKey: string;
  thumbnailStorageKey: string;
  mimeType: 'image/jpeg' | 'image/png';
  sizeBytes: number;
  thumbnailSizeBytes: number;
  width: number;
  height: number;
}
export interface CreatorProfile {
  accountId: string;
  displayName: string;
  bio: string;
  location: string;
  website: string;
  instagram: string;
  genres: string[];
  coverId: ProfileCover | 'custom';
  avatarId: ProfileCover | 'initials' | 'custom';
  avatarImage?: ProfileImageRecord;
  coverImage?: ProfileImageRecord;
  avatarUrl?: string;
  coverUrl?: string;
  publicProfile: boolean;
  packageBadges?: PackageBadge[];
}
export type PackageBadge = 'creator' | 'studio';
export type ProfileInput = Omit<CreatorProfile, 'accountId' | 'packageBadges' | 'avatarImage' | 'coverImage' | 'avatarUrl' | 'coverUrl'>;
export const emptyProfile = (accountId: string): CreatorProfile => ({ accountId, displayName: 'Productor', bio: '', location: '', website: '', instagram: '', genres: [], coverId: 'lo-fi', avatarId: 'initials', publicProfile: false });
export function isCreatorProfile(value: unknown): value is CreatorProfile {
  if (!value || typeof value !== 'object') return false;
  const p = value as CreatorProfile;
  return typeof p.accountId === 'string' && typeof p.displayName === 'string' && typeof p.bio === 'string' &&
    typeof p.location === 'string' && typeof p.website === 'string' && typeof p.instagram === 'string' &&
    Array.isArray(p.genres) && p.genres.every(g => typeof g === 'string') &&
    (profileCoverIds.includes(p.coverId as ProfileCover) || p.coverId === 'custom') && (['initials', ...profileCoverIds].includes(p.avatarId as string) || p.avatarId === 'custom') && typeof p.publicProfile === 'boolean' &&
    (p.avatarImage === undefined || isProfileImageRecord(p.avatarImage)) && (p.coverImage === undefined || isProfileImageRecord(p.coverImage)) &&
    (p.avatarUrl === undefined || typeof p.avatarUrl === 'string') && (p.coverUrl === undefined || typeof p.coverUrl === 'string') &&
    (p.packageBadges === undefined || Array.isArray(p.packageBadges) && p.packageBadges.every(badge => badge === 'creator' || badge === 'studio'));
}

export function isProfileImageRecord(value: unknown): value is ProfileImageRecord {
  if (!value || typeof value !== 'object') return false;
  const image = value as Record<string, unknown>;
  return typeof image.storageKey === 'string' && /^[a-zA-Z0-9_-]{1,80}\/profile-(?:avatar|cover)-[a-f0-9-]+\.(?:jpg|png)$/.test(image.storageKey) &&
    typeof image.thumbnailStorageKey === 'string' && /^[a-zA-Z0-9_-]{1,80}\/profile-(?:avatar|cover)-[a-f0-9-]+\.thumb\.webp$/.test(image.thumbnailStorageKey) &&
    ['image/jpeg', 'image/png'].includes(image.mimeType as string) && Number.isSafeInteger(image.sizeBytes) && (image.sizeBytes as number) > 0 &&
    Number.isSafeInteger(image.thumbnailSizeBytes) && (image.thumbnailSizeBytes as number) > 0 &&
    Number.isSafeInteger(image.width) && (image.width as number) >= 256 && Number.isSafeInteger(image.height) && (image.height as number) >= 256;
}
