import { afterEach, describe, expect, it, vi } from 'vitest'
import { createHash, randomUUID } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { join, relative } from 'node:path'
import { config } from './config'
import type { AssetRecord, BeatOrder, ServerRepository } from './store'
import { preparePurchaseDownload } from './purchase-delivery'
import { isPurchaseEntitlement, purchaseFormats, type PurchaseEntitlement } from './purchase-entitlements'
import { hasAudioSignature } from './uploads'

const directories: string[] = []
const hasFfmpeg = spawnSync(config.ffmpegPath, ['-version'], { windowsHide: true, stdio: 'ignore' }).status === 0
afterEach(async () => { await Promise.all(directories.splice(0).map(path => rm(path, { recursive: true, force: true }))) })
async function fixture() {
  await mkdir(config.uploadDirectory, { recursive: true })
  const directory = await mkdtemp(join(config.uploadDirectory, 'purchase-test-')); directories.push(directory)
  const source = join(directory, 'source')
  const bytes = Buffer.alloc(16044)
  bytes.write('RIFF', 0); bytes.writeUInt32LE(bytes.length - 8, 4); bytes.write('WAVEfmt ', 8); bytes.writeUInt32LE(16, 16)
  bytes.writeUInt16LE(1, 20); bytes.writeUInt16LE(1, 22); bytes.writeUInt32LE(8000, 24); bytes.writeUInt32LE(16000, 28); bytes.writeUInt16LE(2, 32); bytes.writeUInt16LE(16, 34); bytes.write('data', 36); bytes.writeUInt32LE(bytes.length - 44, 40)
  await writeFile(source, bytes)
  const asset: AssetRecord = { id: randomUUID(), ownerId: 'seller', originalName: 'beat.wav', storageKey: relative(config.uploadDirectory, source), mimeType: 'audio/wav', sizeBytes: bytes.length, contentHash: createHash('sha256').update(bytes).digest('hex'), state: 'available', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
  const entitlement: PurchaseEntitlement = { version: 1, assetId: asset.id, sourceHash: asset.contentHash, sourceSizeBytes: bytes.length, sourceName: asset.originalName, sourceMimeType: asset.mimeType, deliverables: ['wav'], offerLabel: 'WAV license', usageSummary: 'Commercial release allowed.', termsVersion: 'non-exclusive-offer-draft-v1' }
  const order: BeatOrder = { id: randomUUID(), buyerId: 'buyer', sellerId: 'seller', contentId: randomUUID(), offerId: 'wav', title: 'Purchased beat', amountMinor: 2000, commissionMinor: 100, processingEstimateMinor: 94, applicationFeeMinor: 194, sellerNetMinor: 1806, currency: 'usd', status: 'paid', createdAt: new Date().toISOString(), fulfillment: entitlement }
  const repository = { findAsset: vi.fn(async (assetId: string, ownerId?: string) => assetId === asset.id && ownerId === asset.ownerId ? asset : undefined) } as unknown as ServerRepository
  return { source, bytes, asset, order, repository }
}

describe('purchased offer delivery', () => {
  it('downloads the snapshotted native file independently of later catalog changes', async () => {
    const { order, repository, bytes, asset } = await fixture()
    const result = await preparePurchaseDownload(order, repository, 'wav')
    expect(result.mimeType).toBe('audio/wav')
    expect(await readFile(result.path)).toEqual(bytes)
    expect(repository.findAsset).toHaveBeenCalledWith(asset.id, 'seller')
    await result.cleanup()
  })

  it.each(['pending', 'failed', 'refund_pending', 'refunded', 'partially_refunded', 'disputed'] as const)('denies %s orders before reading source files', async status => {
    const { order, repository } = await fixture()
    await expect(preparePurchaseDownload({ ...order, status }, repository, 'wav')).rejects.toThrow('PURCHASE_ENTITLEMENT_UNAVAILABLE')
    expect(repository.findAsset).not.toHaveBeenCalled()
  })

  it('denies formats that were not purchased, legacy unsnapshotted orders and stems', async () => {
    const { order, repository } = await fixture()
    await expect(preparePurchaseDownload(order, repository, 'mp3')).rejects.toThrow('PURCHASE_ENTITLEMENT_UNAVAILABLE')
    await expect(preparePurchaseDownload({ ...order, fulfillment: undefined }, repository, 'wav')).rejects.toThrow('PURCHASE_ENTITLEMENT_UNAVAILABLE')
    expect(purchaseFormats(['stems'])).toBeUndefined()
    expect(purchaseFormats(['mp3', 'wav', 'stems'])).toBeUndefined()
    expect(isPurchaseEntitlement({ ...order.fulfillment, deliverables: ['stems'] })).toBe(false)
  })

  it('rejects changed bytes even when original filename, asset id and recorded hash remain unchanged', async () => {
    const { order, repository, source, bytes } = await fixture()
    bytes[bytes.length - 1] = 1
    await writeFile(source, bytes)
    await expect(preparePurchaseDownload(order, repository, 'wav')).rejects.toThrow('PURCHASE_SOURCE_UNAVAILABLE')
  })

  it('rejects seller substitution, changed metadata and storage traversal', async () => {
    const { order, repository, asset } = await fixture()
    asset.ownerId = 'another-seller'
    await expect(preparePurchaseDownload(order, repository, 'wav')).rejects.toThrow('PURCHASE_SOURCE_UNAVAILABLE')
    asset.ownerId = 'seller'; asset.storageKey = '../outside.wav'
    await expect(preparePurchaseDownload(order, repository, 'wav')).rejects.toThrow('ASSET_STORAGE_PATH_INVALID')
  })

  it.skipIf(!hasFfmpeg)('delivers full MP3 and WAV formats from one immutable offer without handing MP3 buyers the WAV original', async () => {
    const { order, repository, bytes } = await fixture()
    order.fulfillment!.deliverables = ['mp3', 'wav']
    const mp3 = await preparePurchaseDownload(order, repository, 'mp3')
    try {
      expect(mp3.mimeType).toBe('audio/mpeg')
      expect(mp3.name).toBe('beat.mp3')
      expect(await hasAudioSignature(mp3.path, 'audio/mpeg')).toBe(true)
      expect(await readFile(mp3.path)).not.toEqual(bytes)
      const wav = await preparePurchaseDownload(order, repository, 'wav')
      expect(await readFile(wav.path)).toEqual(bytes)
      await wav.cleanup()
    } finally { await mp3.cleanup() }
  }, 15000)
})
