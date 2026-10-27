import type { ServerResponse } from 'node:http'

const maxStreamsPerAccount = 2
const streams = new Map<string, Set<ServerResponse>>()
type SocialFeedEventType = 'new-posts' | 'new-stories'

export function subscribeToSocialFeed(accountId: string, response: ServerResponse): (() => void) | undefined {
  const accountStreams = streams.get(accountId) ?? new Set<ServerResponse>()
  if (accountStreams.size >= maxStreamsPerAccount) return undefined
  accountStreams.add(response)
  streams.set(accountId, accountStreams)
  return () => {
    accountStreams.delete(response)
    if (!accountStreams.size) streams.delete(accountId)
  }
}

function publishSocialUpdate(type: SocialFeedEventType, exceptAccountId?: string, recipientIds?: Iterable<string>): void {
  const payload = `data: ${JSON.stringify({ type })}\n\n`
  const recipients = recipientIds ? new Set(recipientIds) : undefined
  for (const [accountId, accountStreams] of streams) {
    if (accountId === exceptAccountId || recipients && !recipients.has(accountId)) continue
    for (const response of accountStreams) {
      if (!response.destroyed && !response.writableEnded) response.write(payload)
    }
  }
}

export const publishSocialFeedUpdate = (exceptAccountId?: string) => publishSocialUpdate('new-posts', exceptAccountId)
export const publishSocialStoryUpdate = (exceptAccountId?: string, recipientIds?: Iterable<string>) => publishSocialUpdate('new-stories', exceptAccountId, recipientIds)

export function closeSocialFeedStreams(): void {
  for (const accountStreams of streams.values()) for (const response of accountStreams) response.end()
  streams.clear()
}
