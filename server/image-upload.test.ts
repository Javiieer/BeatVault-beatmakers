import sharp from 'sharp'
import { describe, expect, it } from 'vitest'
import { normalizeImageUpload } from './image-upload'
import { normalizeArtworkUpload } from './artwork'
import { normalizeProfileImageUpload } from './profile-images'

const image = () => sharp({ create: { width: 960, height: 640, channels: 3, background: '#306090' } })

describe('bounded image upload normalization', () => {
  it.each(['jpeg', 'png', 'webp', 'avif'] as const)('decodes real %s bytes and creates clean square catalog artwork', async format => {
    const source = await image()[format]().toBuffer()
    const result = await normalizeArtworkUpload(source, `image/${format}`)
    expect(result.format).toMatchObject({ width: 640, height: 640 })
    const metadata = await sharp(result.bytes).metadata()
    expect(['jpeg', 'png']).toContain(metadata.format)
    expect(metadata.exif).toBeUndefined()
    expect(metadata.xmp).toBeUndefined()
    expect(metadata.iptc).toBeUndefined()
    expect(metadata.width).toBe(640)
    expect(metadata.height).toBe(640)
  })

  it('keeps PNG transparency and strips orientation/metadata while preserving profile proportions', async () => {
    const source = await sharp({ create: { width: 960, height: 640, channels: 4, background: '#30609080' } }).png().withMetadata({ orientation: 6 }).toBuffer()
    const result = await normalizeProfileImageUpload(source, 'image/png')
    const metadata = await sharp(result.bytes).metadata()
    expect(result.mimeType).toBe('image/png')
    expect(metadata.hasAlpha).toBe(true)
    expect(metadata.width).toBe(640)
    expect(metadata.height).toBe(960)
    expect(metadata.exif).toBeUndefined()
    expect(metadata.orientation).toBeUndefined()
  })

  it('allows missing browser MIME after signature detection but rejects forged MIME, SVG and truncation', async () => {
    const source = await image().webp().toBuffer()
    await expect(normalizeArtworkUpload(source, 'application/octet-stream')).resolves.toMatchObject({ format: { width: 640 } })
    await expect(normalizeArtworkUpload(source, 'image/jpeg')).rejects.toMatchObject({ code: 'IMAGE_INVALID' })
    await expect(normalizeArtworkUpload(Buffer.from('<svg onload="alert(1)"/>'), 'image/svg+xml')).rejects.toMatchObject({ code: 'IMAGE_INVALID' })
    await expect(normalizeArtworkUpload(source.subarray(0, -8), 'image/webp')).rejects.toMatchObject({ code: 'IMAGE_INVALID' })
  })

  it('rejects oversize input, undersize covers and input pixel bombs before producing stored bytes', async () => {
    await expect(normalizeImageUpload(Buffer.alloc(1025), 'image/png', { maxBytes: 1024, minSide: 640, maxSide: 10000 })).rejects.toMatchObject({ status: 413 })
    const small = await sharp({ create: { width: 640, height: 320, channels: 3, background: '#306090' } }).png().toBuffer()
    await expect(normalizeArtworkUpload(small, 'image/png')).rejects.toMatchObject({ code: 'IMAGE_INVALID' })
    const huge = await sharp({ create: { width: 4001, height: 4000, channels: 3, background: '#306090' } }).png().toBuffer()
    await expect(normalizeArtworkUpload(huge, 'image/png')).rejects.toMatchObject({ code: 'IMAGE_INVALID' })
  })

  it('rejects animated WebP rather than silently accepting only its first frame', async () => {
    const raw = Buffer.concat([Buffer.alloc(640 * 640 * 3, 32), Buffer.alloc(640 * 640 * 3, 192)])
    const animated = await sharp(raw, { raw: { width: 640, height: 1280, channels: 3, pageHeight: 640 } }).webp({ loop: 0, delay: [100, 100] }).toBuffer()
    expect((await sharp(animated).metadata()).pages).toBe(2)
    await expect(normalizeArtworkUpload(animated, 'image/webp')).rejects.toMatchObject({ code: 'IMAGE_INVALID' })
  })
})
