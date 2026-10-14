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
  it('persists seller beat listing drafts privately by owner and preserves original creation time', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'beatvault-listing-drafts-'))
    const previousDirectory = config.dataDirectory
    config.dataDirectory = directory
    try {
      const repo = new LocalRepository()
      const record = { contentId: 'beat-1', ownerId: 'owner-1', description: 'A melodic beat draft for artists.', genre: 'R&B', explicitContent: false, rights: { sellerCompositionShareBps: 10000, sellerMasterShareBps: 10000, sampleDisclosure: 'none' as const, sampleProofAvailable: false, collaborators: [], declarationAccepted: false }, offers: [{ id: 'standard', label: 'Standard', amountMinor: 3000, currency: 'USD' as const, deliverables: ['wav' as const], usageSummary: 'Draft only, pending review.', termsVersion: 'non-exclusive-offer-draft-v1' as const, status: 'draft-only' as const }], currency: 'USD' as const, status: 'draft-only' as const, schemaVersion: 1 as const, rightsDeclarationVersion: 'rights-intake-v1' as const, createdAt: '2026-10-10T00:00:00.000Z', updatedAt: '2026-10-10T00:00:00.000Z' }
      await repo.saveBeatListingDraft(record)
      const updated = await repo.saveBeatListingDraft({ ...record, description: 'Updated description for an artist.', createdAt: '2026-10-12T00:00:00.000Z', updatedAt: '2026-10-12T00:00:00.000Z' })
      expect(updated.createdAt).toBe(record.createdAt)
      expect(await repo.listBeatListingDrafts('owner-1')).toMatchObject([{ contentId: 'beat-1', description: 'Updated description for an artist.' }])
      expect(await repo.listBeatListingDrafts('other-owner')).toEqual([])
      await expect(repo.saveBeatListingDraft({ ...record, ownerId: 'other-owner' })).rejects.toThrow('LISTING_NOT_FOUND')
    } finally {
      config.dataDirectory = previousDirectory
      await rm(directory, { recursive: true, force: true })
    }
  })
  it('stores rights evidence privately, enforces the per-listing limit, and scopes deletion to its owner', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'beatvault-seller-evidence-'))
    const previousDirectory = config.dataDirectory
    config.dataDirectory = directory
    try {
      const repo = new LocalRepository()
      const record = (id: string) => ({ id, contentId: 'beat-evidence', ownerId: 'seller-a', originalName: `${id}.pdf`, mimeType: 'application/pdf' as const, sizeBytes: 16, storageKey: `private-marketplace-evidence/seller-a/${id}`, contentHash: 'a'.repeat(64), createdAt: new Date().toISOString() })
      await repo.saveSellerEvidence(record('evidence-1'))
      await repo.saveSellerEvidence(record('evidence-2'))
      await repo.saveSellerEvidence(record('evidence-3'))
      await expect(repo.saveSellerEvidence(record('evidence-4'))).rejects.toThrow('EVIDENCE_LIMIT')
      expect(await repo.listSellerEvidence('beat-evidence', 'seller-b')).toEqual([])
      expect(await repo.deleteSellerEvidence('evidence-1', 'seller-b')).toBe(false)
      expect(await repo.listSellerEvidence('beat-evidence', 'seller-a')).toHaveLength(3)
    } finally {
      config.dataDirectory = previousDirectory
      await rm(directory, { recursive: true, force: true })
    }
  })
})
