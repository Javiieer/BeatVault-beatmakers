import { describe, expect, it, vi } from 'vitest'
import { PostgresRepository, type SqlClient } from './postgres'

describe('PostgresRepository', () => {
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
