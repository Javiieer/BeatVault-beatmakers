import { describe, expect, it, vi } from 'vitest'
import { PostgresRepository, type SqlClient } from './postgres'
import { emptyProfile } from '../src/domains/profile'

describe('PostgresRepository', () => {
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
    expect(query).toHaveBeenCalledWith(expect.stringContaining('WHERE email = $1'), ['a@test'])
  })
  it('maps project update and reports missing rows', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] })
    await expect(new PostgresRepository({ query: query as unknown as SqlClient['query'] }).updateProject('p', { title: 'x', status: 'draft' }, 'a')).rejects.toThrow('NOT_FOUND')
    expect(query).toHaveBeenCalledWith(expect.stringContaining('WHERE id = $3 AND owner_id = $4'), ['x', 'draft', 'p', 'a'])
  })
})
