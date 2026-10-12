export type DirectMessage = {
  id: string;
  senderId: string;
  recipientId: string;
  body: string;
  createdAt: string;
  readAt?: string;
};

export type ChatConversation = {
  peerId: string;
  lastMessage: DirectMessage;
  unreadCount: number;
};

export const isDirectMessage = (value: unknown): value is DirectMessage => {
  if (!value || typeof value !== 'object') return false;
  const item = value as Record<string, unknown>;
  return typeof item.id === 'string' && typeof item.senderId === 'string' && typeof item.recipientId === 'string' && item.senderId !== item.recipientId && typeof item.body === 'string' && typeof item.createdAt === 'string' && (item.readAt === undefined || typeof item.readAt === 'string');
};

export const isChatConversationList = (value: unknown): value is ChatConversation[] => Array.isArray(value) && value.every(item => {
  if (!item || typeof item !== 'object') return false;
  const conversation = item as Record<string, unknown>;
  return typeof conversation.peerId === 'string' && isDirectMessage(conversation.lastMessage) && Number.isInteger(conversation.unreadCount) && Number(conversation.unreadCount) >= 0;
});

export const isDirectMessageList = (value: unknown): value is DirectMessage[] => Array.isArray(value) && value.every(isDirectMessage);
