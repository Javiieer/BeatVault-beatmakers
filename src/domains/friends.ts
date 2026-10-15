import { isCreatorProfile, type CreatorProfile } from './profile';

export type FriendRequest = { id: string; requesterId: string; recipientId: string; createdAt: string };
export type FriendDirectoryEntry = Pick<CreatorProfile, 'accountId' | 'displayName' | 'bio' | 'genres' | 'avatarId' | 'coverId' | 'avatarUrl' | 'coverUrl'>;
export type FriendLink = { id: string; profile: FriendDirectoryEntry };
export type FriendOverview = { friends: FriendLink[]; incoming: Array<FriendRequest & { profile: FriendDirectoryEntry }>; outgoing: Array<FriendRequest & { profile: FriendDirectoryEntry }> };

export const isFriendDirectoryEntry = (value: unknown): value is FriendDirectoryEntry => {
  if (!value || typeof value !== 'object') return false;
  const item = value as Record<string, unknown>;
  return typeof item.accountId === 'string' && typeof item.displayName === 'string' && typeof item.bio === 'string' && Array.isArray(item.genres) && item.genres.every(genre => typeof genre === 'string') && typeof item.avatarId === 'string' && typeof item.coverId === 'string' && (item.avatarUrl === undefined || typeof item.avatarUrl === 'string') && (item.coverUrl === undefined || typeof item.coverUrl === 'string') && isCreatorProfile({ ...item, location: '', website: '', instagram: '', publicProfile: true });
};

const isRequest = (value: unknown): value is FriendRequest & { profile: FriendDirectoryEntry } => {
  if (!value || typeof value !== 'object') return false;
  const item = value as Record<string, unknown>;
  return typeof item.id === 'string' && typeof item.requesterId === 'string' && typeof item.recipientId === 'string' && typeof item.createdAt === 'string' && isFriendDirectoryEntry(item.profile);
};

export const isFriendOverview = (value: unknown): value is FriendOverview => {
  if (!value || typeof value !== 'object') return false;
  const item = value as Record<string, unknown>;
  return Array.isArray(item.friends) && item.friends.every(link => !!link && typeof link === 'object' && typeof (link as FriendLink).id === 'string' && isFriendDirectoryEntry((link as FriendLink).profile)) && Array.isArray(item.incoming) && item.incoming.every(isRequest) && Array.isArray(item.outgoing) && item.outgoing.every(isRequest);
};

export const isFriendDirectory = (value: unknown): value is FriendDirectoryEntry[] => Array.isArray(value) && value.every(isFriendDirectoryEntry);
