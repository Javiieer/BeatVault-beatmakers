export const notificationTypes = [
  'social_post_comment',
  'social_post_reaction',
  'friend_request',
  'friend_request_accepted',
] as const

export type NotificationType = typeof notificationTypes[number]
export type NotificationResourceType = 'post' | 'friendship'

export type NotificationRecord = {
  id: string
  recipientId: string
  actorId: string
  type: NotificationType
  resourceType: NotificationResourceType
  resourceId: string
  sourceId: string
  eventKey: string
  createdAt: string
  readAt: string | null
}

export type NotificationSeed = Pick<NotificationRecord, 'id' | 'type' | 'resourceType' | 'resourceId' | 'sourceId' | 'eventKey' | 'createdAt'>

export type NotificationCursor = Pick<NotificationRecord, 'createdAt' | 'id'>
export type NotificationPage = {
  items: NotificationRecord[]
  unreadCount: number
  nextCursor: NotificationCursor | null
}
export type NotificationPageOptions = { limit: number; cursor?: NotificationCursor }

const uuidPattern = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i
export const isValidNotificationTimestamp = (value: unknown): value is string => typeof value === 'string' && Number.isFinite(Date.parse(value))

export const isNotificationRecord = (value: unknown): value is NotificationRecord => {
  if (!value || typeof value !== 'object') return false
  const item = value as Partial<NotificationRecord>
  const expectedResource = item.type === 'social_post_comment' || item.type === 'social_post_reaction' ? 'post' : 'friendship'
  return typeof item.id === 'string' && uuidPattern.test(item.id)
    && typeof item.recipientId === 'string' && item.recipientId.length > 0 && item.recipientId.length <= 128
    && typeof item.actorId === 'string' && item.actorId.length > 0 && item.actorId.length <= 128
    && notificationTypes.includes(item.type as NotificationType)
    && item.resourceType === expectedResource
    && typeof item.resourceId === 'string' && item.resourceId.length > 0 && item.resourceId.length <= 255
    && typeof item.sourceId === 'string' && item.sourceId.length > 0 && item.sourceId.length <= 255
    && typeof item.eventKey === 'string' && item.eventKey.length > 0 && item.eventKey.length <= 255
    && isValidNotificationTimestamp(item.createdAt)
    && (item.readAt === null || isValidNotificationTimestamp(item.readAt))
}

export const normalizeNotificationRecord = (value: unknown): NotificationRecord => {
  if (!isNotificationRecord(value)) throw new Error('INVALID_NOTIFICATION')
  const item = value
  return { id: item.id.toLowerCase(), recipientId: item.recipientId, actorId: item.actorId, type: item.type, resourceType: item.resourceType, resourceId: item.resourceId, sourceId: item.sourceId, eventKey: item.eventKey, createdAt: new Date(item.createdAt).toISOString(), readAt: item.readAt === null ? null : new Date(item.readAt).toISOString() }
}

export const notificationLimit = (limit: number): number => Number.isFinite(limit)
  ? Math.max(1, Math.min(100, Math.floor(limit)))
  : 25

export const isNotificationCursor = (value: unknown): value is NotificationCursor => {
  if (!value || typeof value !== 'object') return false
  const cursor = value as Partial<NotificationCursor>
  return isValidNotificationTimestamp(cursor.createdAt) && typeof cursor.id === 'string' && uuidPattern.test(cursor.id)
}

export const normalizeNotificationCursor = (value: NotificationCursor | undefined): NotificationCursor | undefined => {
  if (value === undefined) return undefined
  if (!isNotificationCursor(value)) throw new Error('INVALID_NOTIFICATION_CURSOR')
  return { createdAt: new Date(value.createdAt).toISOString(), id: value.id.toLowerCase() }
}

export const compareNotificationOrder = (a: NotificationCursor, b: NotificationCursor): number => {
  const timeDifference = Date.parse(b.createdAt) - Date.parse(a.createdAt)
  return timeDifference || (b.id < a.id ? -1 : b.id > a.id ? 1 : 0)
}
