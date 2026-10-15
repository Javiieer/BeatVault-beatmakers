# Notification persistence

`NotificationRecord` is an internal repository record, not an API DTO. It contains recipient, actor, resource and source identifiers. Notification records intentionally contain no comment text, report details, or message body.

Supported events are `social_post_comment`, `social_post_reaction`, `friend_request`, and `friend_request_accepted`. Post events require `resourceType: post`; friendship events require `resourceType: friendship`. `sourceId` identifies the originating action, while `resourceId` identifies the target resource. `eventKey` is the stable idempotency key supplied by the caller.

The repository contract is:

- `createNotification` is idempotent by `eventKey` and returns the existing row for a retry.
- `listNotifications` returns `{ items, unreadCount, nextCursor }`, scoped to one recipient and ordered by `(createdAt, id)` descending. The cursor is the final returned item when another page exists.
- `markNotificationRead` updates only a matching `(id, recipientId)` and is idempotent; a missing or foreign notification returns `undefined`.

## HTTP and delivery

- `GET /api/notifications?limit=25&cursor=<opaque>` requires a session, uses a default page size of 25 and caps it at 50. It returns a public DTO with notification id/type, actor display identity, resource type/id, timestamps, unread count and an opaque next cursor. It never returns `recipientId`, `eventKey`, source ids, comment text or report details.
- A private actor is represented as `BeatVault creator` with the opaque actor id `private-creator` unless the recipient is allowed to view that profile.
- `POST /api/notifications/:id/read` requires a session and CSRF token. The update is recipient-scoped; missing and foreign ids both return 404.
- Persistent events are written for social-post comments/reactions and friend requests/acceptances. Reaction notices are deduplicated per actor/post; each comment and friendship event has its own stable source id.
- The server sends an SSE refresh signal `{ type: "notification", notificationId }` over the existing chat stream. The stream is process-local, so the client also polls every 30 seconds.
- Realtime events are sent only after notification persistence. The stream remains process-local, so polling is still the recovery path for missed SSE signals.
- Existing catalog comment/reaction activity remains on `/api/notifications/social` for compatibility; private actors are returned using the same generic identity policy.

## Transaction boundary

PostgreSQL creates each Home comment, reaction transition, friend request, or acceptance and its notification row in one parameterized data-modifying SQL statement. PostgreSQL commits or rolls back the action and notification together. The existing unique `event_key` provides notification deduplication; migration 027 already contains the needed table and indexes, so no extra PostgreSQL outbox table is required. SSE is only a post-commit wake-up signal, not the durable event itself.

The local JSON adapter uses a small write-ahead notification journal because action data and notifications live in separate files. It writes the pending event before the action, checks that the action is present before delivering, and removes the journal entry only after the notification is persisted. On startup, notification reads, and subsequent mutations, pending entries are recovered; entries whose action never committed are discarded. This protects the single-process local workflow from the crash window between action and notification writes. The JSON file locks are process-local, so multiple API processes sharing one data directory are not supported as a transactional deployment model.

These repository operations do not make a client retry of a lost reaction response idempotent: the existing endpoint is a toggle, so a retry can undo the first toggle. Request-level idempotency is separate follow-up work.

PostgreSQL listing reads the page and unread count in one statement. JSON reads one file snapshot for both. Neither adapter promises a transaction spanning arbitrary repository calls.
