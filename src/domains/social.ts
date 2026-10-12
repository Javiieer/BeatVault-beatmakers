export type SocialComment = { id: string; contentId: string; authorId: string; authorName: string; body: string; createdAt: string };
export type SocialActivity = { id: string; type: 'comment' | 'reaction'; contentId: string; contentTitle: string; actorId: string; actorName: string; body?: string; createdAt: string };
export type CatalogSocial = { comments: SocialComment[]; reactionCount: number; reactedByMe: boolean };

export const isCatalogSocial = (value: unknown): value is CatalogSocial => {
  if (!value || typeof value !== 'object') return false;
  const item = value as Record<string, unknown>;
  return Array.isArray(item.comments) && item.comments.every(comment => {
    if (!comment || typeof comment !== 'object') return false;
    const entry = comment as Record<string, unknown>;
    return ['id', 'contentId', 'authorId', 'authorName', 'body', 'createdAt'].every(key => typeof entry[key] === 'string');
  }) && Number.isInteger(item.reactionCount) && (item.reactionCount as number) >= 0 && typeof item.reactedByMe === 'boolean';
};

export const isSocialActivityList = (value: unknown): value is SocialActivity[] => Array.isArray(value) && value.every(activity => {
  if (!activity || typeof activity !== 'object') return false;
  const item = activity as Record<string, unknown>;
  return typeof item.id === 'string' && (item.type === 'comment' || item.type === 'reaction') && typeof item.contentId === 'string' && typeof item.contentTitle === 'string' && typeof item.actorId === 'string' && typeof item.actorName === 'string' && typeof item.createdAt === 'string' && (item.body === undefined || typeof item.body === 'string');
});
