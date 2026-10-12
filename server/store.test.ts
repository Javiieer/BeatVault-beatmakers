import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { randomUUID } from 'node:crypto'
import { JsonStore, LocalRepository, StorageQuotaExceededError, type AssetRecord } from './store'
import { config } from './config'

describe('JsonStore', () => {
  it('serializes concurrent read-modify-write operations without losing updates', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'beatvault-json-store-'))
    try {
      const file = join(directory, 'records.json')
      const first = new JsonStore(file)
      const second = new JsonStore(file)
      const valid = (value: unknown): value is number => typeof value === 'number'
      await Promise.all(Array.from({ length: 80 }, (_, index) => (index % 2 ? first : second).update<number[], number[]>([], valid, current => ({
        value: [...current, index],
        result: [...current, index],
      }))))

      const records = await first.read<number[]>([], valid)
      expect(records).toHaveLength(80)
      expect(new Set(records)).toEqual(new Set(Array.from({ length: 80 }, (_, index) => index)))
      expect(JSON.parse(await readFile(file, 'utf8'))).toHaveLength(80)
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('admits concurrent account uploads atomically and releases usage on deletion', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'beatvault-account-quota-'))
    const previousDirectory = config.dataDirectory
    config.dataDirectory = directory
    try {
      const repo = new LocalRepository()
      const ownerId = randomUUID()
      const create = (sizeBytes: number): AssetRecord => ({ id: randomUUID(), ownerId, originalName: 'test.wav', storageKey: `${ownerId}/${randomUUID()}`, mimeType: 'audio/wav', sizeBytes, contentHash: randomUUID(), state: 'available', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() })
      await repo.createAsset({ ...create(7), previewStorageKey: `${ownerId}/preview.m4a`, previewMimeType: 'audio/mp4', previewSizeBytes: 4 }, 10)
      const results = await Promise.allSettled([repo.createAsset(create(3), 10), repo.createAsset(create(3), 10)])
      expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1)
      expect(results.filter(result => result.status === 'rejected' && result.reason instanceof StorageQuotaExceededError)).toHaveLength(1)
      expect(await repo.getStorageUsage(ownerId)).toBe(10)
      const accepted = results.find(result => result.status === 'fulfilled')
      if (accepted?.status === 'fulfilled') await repo.deleteAsset(accepted.value.id, ownerId)
      expect(await repo.getStorageUsage(ownerId)).toBe(7)
      expect(await repo.listStorageUsage()).toContainEqual(expect.objectContaining({ ownerId, usedBytes: 7, originalCount: 1, previewBytes: 4, previewCount: 1, storedBytes: 11 }))
    } finally {
      config.dataDirectory = previousDirectory
      await rm(directory, { recursive: true, force: true })
    }
  })
  it('persists and clears manual account storage limits', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'beatvault-storage-quota-'))
    const previousDirectory = config.dataDirectory
    config.dataDirectory = directory
    try {
      const repo = new LocalRepository()
      const account = { id: 'quota-owner', email: 'quota@test.local', passwordHash: 'hash', role: 'creator' as const, verificationState: 'verified' as const }
      await repo.saveAccount(account)
      await repo.setStorageQuota(account.id, 1024, 'admin-id')
      expect(await repo.getStorageQuota(account.id)).toBe(1024)
      expect(await repo.listStorageQuotas()).toMatchObject([{ ownerId: account.id, limitBytes: 1024, updatedBy: 'admin-id' }])
      await repo.setStorageQuota(account.id, null, 'admin-id')
      expect(await repo.getStorageQuota(account.id)).toBeUndefined()
    } finally {
      config.dataDirectory = previousDirectory
      await rm(directory, { recursive: true, force: true })
    }
  })
})
