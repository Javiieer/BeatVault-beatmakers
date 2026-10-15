import { readFile, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Readable } from 'node:stream'
import { afterEach, describe, expect, it } from 'vitest'
import { config } from './config'
import { receiveSellerEvidence, sellerEvidencePath } from './seller-evidence-upload'
import { reconcileUploads } from './uploads'

const makeRequest = (mime: string, bytes: Buffer, filename = 'proof.pdf') => {
  const boundary = 'beatvault-test-boundary'
  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: ${mime}\r\n\r\n`),
    bytes,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ])
  return Object.assign(Readable.from([body]), { headers: { 'content-type': `multipart/form-data; boundary=${boundary}`, 'content-length': String(body.length) } })
}

describe('private seller evidence upload', () => {
  const previousDirectory = config.uploadDirectory
  let directory: string | undefined
  afterEach(async () => {
    config.uploadDirectory = previousDirectory
    if (directory) await rm(directory, { recursive: true, force: true })
    directory = undefined
  })

  it('stores validated PDF evidence under a private path and ignores the submitted filename for storage', async () => {
    directory = await mkdtemp(join(tmpdir(), 'beatvault-evidence-upload-'))
    config.uploadDirectory = directory
    const evidence = await receiveSellerEvidence(makeRequest('application/pdf', Buffer.from('%PDF-1.7\nproof data'), '../../proof.pdf') as never, 'beat-1', 'owner/1')
    expect(evidence.mimeType).toBe('application/pdf')
    expect(evidence.originalName).toBe('proof.pdf')
    expect(evidence.storageKey).toMatch(/^private-marketplace-evidence\/owner_1\/[a-f0-9-]+$/)
    expect(await readFile(sellerEvidencePath(evidence), 'utf8')).toContain('%PDF-1.7')
  })

  it('rejects a document whose claimed MIME does not match its file signature', async () => {
    directory = await mkdtemp(join(tmpdir(), 'beatvault-evidence-invalid-'))
    config.uploadDirectory = directory
    await expect(receiveSellerEvidence(makeRequest('application/pdf', Buffer.from('<html>not a pdf'), 'proof.pdf') as never, 'beat-1', 'owner-1')).rejects.toThrow('EVIDENCE_SIGNATURE')
  })

  it('preserves seller rights evidence during upload reconciliation after restart', async () => {
    directory = await mkdtemp(join(tmpdir(), 'beatvault-evidence-reconcile-'))
    config.uploadDirectory = directory
    const record = await receiveSellerEvidence(makeRequest('application/pdf', Buffer.from('%PDF-1.7\nproof'), 'proof.pdf') as never, 'beat-1', 'owner-1')
    const repository = {
      listAssets: async () => [],
      listCatalogArtwork: async () => [],
      listAccounts: async () => [],
      listAllBeatListingDrafts: async () => [{ contentId: 'beat-1', ownerId: 'owner-1' }],
      listSellerEvidence: async () => [record],
    }
    await reconcileUploads(repository as never)
    expect(await readFile(sellerEvidencePath(record), 'utf8')).toContain('%PDF-1.7')
  })
})
