import type { ServerResponse } from 'node:http'

export type ChatEvent = { type: 'message' | 'read' | 'activity'; peerId: string } | { type: 'presence'; peerId: string; online: boolean } | { type: 'notification'; notificationId: string }

const streams = new Map<string, Set<ServerResponse>>()

export function subscribeToChat(accountId: string, response: ServerResponse): (() => void) | undefined {
  const accountStreams = streams.get(accountId) ?? new Set<ServerResponse>()
  if (accountStreams.size >= 3) return undefined
  accountStreams.add(response)
  streams.set(accountId, accountStreams)
  return () => {
    accountStreams.delete(response)
    if (!accountStreams.size) streams.delete(accountId)
  }
}

export const isChatOnline = (accountId: string) => (streams.get(accountId)?.size ?? 0) > 0;

export function publishChatEvent(accountId: string, event: ChatEvent): void {
  const payload = `data: ${JSON.stringify(event)}\n\n`
  for (const response of streams.get(accountId) ?? []) {
    if (!response.destroyed && !response.writableEnded) response.write(payload)
  }
}

export function closeChatStreams(): void {
  for (const accountStreams of streams.values()) for (const response of accountStreams) response.end()
  streams.clear()
}
