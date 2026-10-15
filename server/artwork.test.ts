import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { artworkPath, maxArtworkBytes, validateArtwork } from './artwork'
import { makeArtworkPng } from './artwork-fixture'

describe('catalog artwork validation', () => {
  it('accepts a square PNG with the declared MIME and minimum dimensions', () => {
    expect(validateArtwork(makeArtworkPng(640, 640), 'image/png')).toMatchObject({ mimeType: 'image/png', width: 640, height: 640 })
  })

  it('accepts the generated high-resolution BeatVault cover fixture as a square 4K JPEG', () => {
    const artwork = readFileSync(resolve(process.cwd(), 'server/fixtures/beat-upload-cover.jpg'))
    expect(artwork.length).toBeGreaterThan(1_000_000)
    expect(artwork.length).toBeLessThan(maxArtworkBytes)
    expect(validateArtwork(artwork, 'image/jpeg')).toMatchObject({ mimeType: 'image/jpeg', width: 4000, height: 4000 })
  })

  it('keeps a compact square cover fixture for storage-quota integration tests', () => {
    const artwork = readFileSync(resolve(process.cwd(), 'server/fixtures/beat-upload-cover-qa.jpg'))
    expect(artwork.length).toBeLessThan(68_000)
    expect(validateArtwork(artwork, 'image/jpeg')).toMatchObject({ mimeType: 'image/jpeg', width: 640, height: 640 })
  })

  it('rejects wrong MIME, non-square art, undersized art, and non-image bytes', () => {
    expect(validateArtwork(makeArtworkPng(640, 640), 'image/jpeg')).toBeUndefined()
    expect(validateArtwork(makeArtworkPng(1200, 800), 'image/png')).toBeUndefined()
    expect(validateArtwork(makeArtworkPng(320, 320), 'image/png')).toBeUndefined()
    expect(validateArtwork(makeArtworkPng(640, 640).subarray(0, -20), 'image/png')).toBeUndefined()
    expect(validateArtwork(Buffer.from('not an image'), 'image/png')).toBeUndefined()
    expect(validateArtwork(Buffer.from([0xff, 0xd8, 0xff]), 'image/jpeg')).toBeUndefined()
  })

  it('rejects paths outside the configured upload root', () => {
    expect(() => artworkPath('C:/uploads', '../outside.png')).toThrow('ARTWORK_STORAGE_PATH_INVALID')
    expect(artworkPath('C:/uploads', 'owner/asset-cover.png')).toContain('owner')
  })
})
