import { describe, expect, it, vi } from 'vitest'
import { PostgresRepository, type SqlClient } from './postgres'
import { emptyProfile } from '../src/domains/profile'

describe('PostgresRepository', () => {
  it('lists account storage totals in one aggregate query', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [{ owner_id: 'owner', used_bytes: '4096', original_count: '2', preview_bytes: '1024', preview_count: '1' }] })
    const result = await new PostgresRepository({ query: query as unknown as SqlClient['query'] }).listStorageUsage()
    expect(result).toEqual([{ ownerId: 'owner', usedBytes: 4096, originalCount: 2, previewBytes: 1024, previewCount: 1, storedBytes: 5120 }])
    expect(query).toHaveBeenCalledWith(expect.stringContaining('COUNT(asset.id) FILTER (WHERE asset.preview_storage_key IS NOT NULL)'))
  })
  it('persists or removes manual account storage limits with parameterized queries', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [{ limit_bytes: '8192' }] })
    const repo = new PostgresRepository({ query: query as unknown as SqlClient['query'] })
    expect(await repo.getStorageQuota('owner')).toBe(8192)
    expect(query).toHaveBeenCalledWith('SELECT limit_bytes FROM account_storage_quotas WHERE owner_id = $1', ['owner'])
    await repo.setStorageQuota('owner', 4096, 'admin')
    expect(query).toHaveBeenLastCalledWith(expect.stringContaining('ON CONFLICT (owner_id) DO UPDATE'), ['owner', 4096, 'admin'])
    await repo.setStorageQuota('owner', null, 'admin')
    expect(query).toHaveBeenLastCalledWith('DELETE FROM account_storage_quotas WHERE owner_id = $1', ['owner'])
  })
  it('lists and persists marketplace promotion rules with parameterized queries', async () => {
    const row = { id: 'promotion-id', name: 'Launch', scope: 'loop' as const, percent_off: 10, starts_at: null, ends_at: null, enabled: true, created_at: '2026-10-12T00:00:00.000Z', updated_at: '2026-10-12T00:00:00.000Z', updated_by: 'admin' }
    const query = vi.fn().mockResolvedValue({ rows: [row] })
    const repo = new PostgresRepository({ query: query as unknown as SqlClient['query'] })
    const promotion = { id: row.id, name: row.name, scope: row.scope, percentOff: 10, enabled: true, createdAt: row.created_at, updatedAt: row.updated_at, updatedBy: row.updated_by }
    expect(await repo.savePromotion(promotion)).toEqual(promotion)
    expect(query).toHaveBeenCalledWith(expect.stringContaining('ON CONFLICT (id) DO UPDATE'), [row.id, row.name, 'loop', 10, null, null, true, row.created_at, 'admin'])
    expect(await repo.listPromotions()).toEqual([promotion])
    expect(await repo.deletePromotion(row.id)).toBe(true)
    expect(query).toHaveBeenLastCalledWith('DELETE FROM marketplace_promotions WHERE id = $1 RETURNING id', [row.id])
  })
  it('persists seller beat offer drafts as owner-scoped JSON with parameterized writes', async () => {
    const record = { contentId: 'content-id', ownerId: 'owner-id', description: 'Beat listing for artist placements.', genre: 'R&B', explicitContent: false, rights: { sellerCompositionShareBps: 10000, sellerMasterShareBps: 10000, sampleDisclosure: 'none' as const, sampleProofAvailable: false, collaborators: [], declarationAccepted: false }, offers: [{ id: 'standard', label: 'Standard', amountMinor: 3000, currency: 'USD' as const, deliverables: ['wav' as const], usageSummary: 'Draft only, not a license.', termsVersion: 'non-exclusive-offer-draft-v1' as const, status: 'draft-only' as const }], currency: 'USD' as const, status: 'draft-only' as const, schemaVersion: 1 as const, rightsDeclarationVersion: 'rights-intake-v1' as const, createdAt: '2026-10-12T00:00:00.000Z', updatedAt: '2026-10-12T00:00:00.000Z' }
    const query = vi.fn().mockResolvedValue({ rows: [{ data: record }] })
    const repo = new PostgresRepository({ query: query as unknown as SqlClient['query'] })
    expect(await repo.saveBeatListingDraft(record)).toEqual(record)
    expect(query).toHaveBeenCalledWith(expect.stringContaining('ON CONFLICT (content_id)'), [record.contentId, record.ownerId, JSON.stringify(record), record.createdAt])
    expect(await repo.findBeatListingDraft(record.contentId, record.ownerId)).toEqual(record)
    expect(query).toHaveBeenLastCalledWith(expect.stringContaining('WHERE content_id = $1 AND owner_id = $2'), [record.contentId, record.ownerId])
    query.mockResolvedValueOnce({ rows: [] })
    await expect(repo.saveBeatListingDraft(record)).rejects.toThrow('LISTING_NOT_FOUND')
  })
  it('stores profile metadata separately and uses the account column as identity', async () => {
    const profile = { ...emptyProfile('owner'), displayName: 'Producer' };
    const { accountId, ...metadata } = profile;
    const query = vi.fn().mockResolvedValue({ rows: [{ account_id: accountId, metadata: { ...metadata, accountId: 'forged' } }] });
    const repo = new PostgresRepository({ query: query as unknown as SqlClient['query'] });
    expect(await repo.saveProfile(profile)).toEqual(profile);
    expect(query).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO creator_profiles'), [accountId, JSON.stringify(metadata)]);
    expect(await repo.findProfile(accountId)).toEqual(profile);
    expect(query).toHaveBeenLastCalledWith(expect.stringContaining('WHERE account_id = $1'), [accountId]);
    query.mockResolvedValueOnce({ rows: [] });
    expect(await repo.findProfile('missing')).toBeUndefined();
  });
  it('persists and maps durable catalog references with parameterized retry handling', async () => {
    const row = { content_id: 'entry', creator_id: 'owner', type: 'beat', title: 'Audio', tag_ids: ['trap'], preview_ids: [], publication_status: 'draft', asset_id: 'asset', cover_id: 'lo-fi', review_note: null };
    const query = vi.fn().mockResolvedValue({ rows: [row] });
    const repo = new PostgresRepository({ query: query as unknown as SqlClient['query'] });
    const input = { contentId: 'entry', creatorId: 'owner', type: 'beat' as const, title: 'Audio', tagIds: ['trap'], previewIds: [], publicationStatus: 'draft' as const, assetId: 'asset', coverId: 'lo-fi' as const };
    expect(await repo.createCatalog(input)).toEqual(input);
    expect(query).toHaveBeenCalledWith(expect.stringContaining('ON CONFLICT (creator_id, asset_id)'), ['entry', 'owner', 'beat', 'Audio', ['trap'], [], 'draft', 'asset', 'lo-fi', null]);
    expect(await repo.listCatalog()).toEqual([input]);
    await repo.updateCatalog('entry', { title: 'Audio', type: 'beat', tagIds: [], publicationStatus: 'draft' }, 'owner');
    expect(query).toHaveBeenLastCalledWith(expect.stringContaining('cover_id = COALESCE($7, cover_id)'), ['Audio', 'beat', [], 'draft', 'entry', 'owner', null]);
  });
  it('uses parameterized account lookup and maps rows', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [{ id: 'a', email: 'a@test', password_hash: 'hash', role: 'creator' }] })
    const result = await new PostgresRepository({ query: query as unknown as SqlClient['query'] }).findAccountByEmail('a@test')
    expect(result?.passwordHash).toBe('hash')
    expect(result?.planId).toBe('free')
    expect(result?.purchasedPlanIds).toEqual([])
    expect(query).toHaveBeenCalledWith(expect.stringContaining('WHERE email = $1'), ['a@test'])
  })
  it('stores only hashed durable sessions and scopes revocation by account', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [{ token_hash: 'a'.repeat(64), account_id: 'account-1', csrf_token_hash: 'b'.repeat(64), expires_at: '1792000000000' }] })
    const repo = new PostgresRepository({ query: query as unknown as SqlClient['query'] })
    const session = { tokenHash: 'a'.repeat(64), accountId: 'account-1', csrfTokenHash: 'b'.repeat(64), expiresAt: 1792000000000 }
    await repo.createSession(session)
    expect(query).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO auth_sessions'), [session.tokenHash, session.accountId, session.csrfTokenHash, session.expiresAt])
    expect(await repo.findSession(session.tokenHash)).toEqual(session)
    expect(query).toHaveBeenLastCalledWith(expect.stringContaining('expires_at > NOW()'), [session.tokenHash])
    await repo.deleteAccountSessions(session.accountId, session.tokenHash)
    expect(query).toHaveBeenLastCalledWith(expect.stringContaining('token_hash <> $2'), [session.accountId, session.tokenHash])
    await repo.deleteExpiredSessions(1700000000000)
    expect(query).toHaveBeenLastCalledWith(expect.stringContaining('expires_at <= to_timestamp($1 / 1000.0)'), [1700000000000])
  })
  it('maps project update and reports missing rows', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] })
    await expect(new PostgresRepository({ query: query as unknown as SqlClient['query'] }).updateProject('p', { title: 'x', status: 'draft' }, 'a')).rejects.toThrow('NOT_FOUND')
    expect(query).toHaveBeenCalledWith(expect.stringContaining('WHERE id = $3 AND owner_id = $4'), ['x', 'draft', 'p', 'a'])
  })
  it('stores direct messages with parameterized private conversation queries', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [{ id: 'm1', sender_id: 'a', recipient_id: 'b', body: 'Hello', created_at: '2026-10-10T10:00:00.000Z', read_at: null }] })
    const repo = new PostgresRepository({ query: query as unknown as SqlClient['query'] })
    const message = { id: 'm1', senderId: 'a', recipientId: 'b', body: 'Hello', createdAt: '2026-10-10T10:00:00.000Z' }
    expect(await repo.createChatMessage(message)).toEqual(message)
    expect(query).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO direct_messages'), ['m1', 'a', 'b', 'Hello', message.createdAt, null])
    query.mockResolvedValueOnce({ rows: [{ id: 'm1', sender_id: 'a', recipient_id: 'b', body: 'Hello', created_at: message.createdAt, read_at: null }] })
    expect(await repo.listChatMessages('b', 'a', 100)).toEqual([message])
    expect(query).toHaveBeenLastCalledWith(expect.stringContaining('recipient_id = $1'), ['b', 'a', 100])
    query.mockResolvedValueOnce({ rows: [{ id: 'm1' }] })
    expect(await repo.markChatMessagesRead('b', 'a', '2026-10-10T10:01:00.000Z')).toBe(1)
    expect(query).toHaveBeenLastCalledWith(expect.stringContaining('read_at IS NULL'), ['b', 'a', '2026-10-10T10:01:00.000Z'])
  })
  it('reads persisted social activity only for the catalog owner and keeps reaction rows valid', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [{ id: 'event-1', type: 'reaction', contentId: 'beat-1', contentTitle: 'Night Drive', actorId: 'listener', actorName: '', body: '', createdAt: '2026-10-10T10:00:00.000Z' }] })
    const activity = await new PostgresRepository({ query: query as unknown as SqlClient['query'] }).listSocialActivity('owner')
    expect(activity).toEqual([expect.objectContaining({ id: 'event-1', type: 'reaction', contentId: 'beat-1', body: '' })])
    expect(query).toHaveBeenCalledWith(expect.stringContaining('COALESCE(e.body, \'\')'), ['owner'])
    expect(query).toHaveBeenCalledWith(expect.stringContaining("a.publication_status = 'published'"), ['owner'])
  })
})
