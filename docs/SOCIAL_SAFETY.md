# Social safety storage and access

Story reports preserve the text snapshot and, for image/video Stories, a private copy of the normalized media. The evidence copy is stored under the server-managed `moderation-evidence/stories/` namespace and is available only through an authenticated staff endpoint. Report responses never return its storage key; authors and reporters cannot read the staff queue or evidence endpoint.

Evidence remains while a report is open, including after the Story expires or its author deletes it. After staff resolves a report, the evidence is retained for 30 days from the decision timestamp, subject to an absolute limit of 90 days from report creation. At day 90, an unresolved report stays open while its media binary is deleted and `evidenceExpiredAt` marks the loss of evidence. A periodic cleanup and orphan reconciliation remove expired or unreferenced files; a failed unlink leaves the database reference intact for retry. Text report snapshots remain available to staff after the media retention period.

The staff Story report queue uses a stable `(createdAt, id)` cursor and exposes a “load more” action so older open reports remain reachable beyond the first 500.

PostgreSQL stores block mutations and their audit event in one transaction. JSON mode records the effective block/unblock state and audit event in a durable journal before attempting to mirror the event into the audit log; startup drains pending events. Relationship operations use a per-account-pair lock in JSON and a PostgreSQL advisory transaction lock, with database triggers as a final guard.
