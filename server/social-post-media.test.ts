import { mkdir, mkdtemp, readFile, rm, stat, utimes, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { Readable } from 'node:stream'
import type { IncomingMessage } from 'node:http'
import { afterEach, describe, expect, it } from 'vitest'
import sharp from 'sharp'
import { config } from './config'
import { LocalRepository } from './store'
import { reconcileSocialPostMedia, receiveSocialPostMedia, validateSocialVideoMetadata } from './social-post-media'

describe('social media validation and reconciliation', () => {
  let priorData = ''
  let priorUploads = ''
  let dataDir = ''
  let uploadsDir = ''
  afterEach(async () => {
    if (priorData) config.dataDirectory = priorData
    if (priorUploads) config.uploadDirectory = priorUploads
    if (dataDir) await rm(dataDir, { recursive: true, force: true })
    if (uploadsDir) await rm(uploadsDir, { recursive: true, force: true })
  })

  it('requires bounded MP4/H.264 metadata', () => {
    const valid = { format: { format_name: 'mov,mp4,m4a,3gp,3g2,mj2', duration: '180.000' }, streams: [{ codec_type: 'video', codec_name: 'h264', width: 1920, height: 1080 }] }
    expect(() => validateSocialVideoMetadata(valid)).not.toThrow()
    expect(() => validateSocialVideoMetadata({ ...valid, format: { ...valid.format, duration: '180.01' } })).toThrow('El video debe ser MP4/H.264')
    expect(() => validateSocialVideoMetadata({ ...valid, streams: [{ ...valid.streams[0], width: 1921 }] })).toThrow('El video debe ser MP4/H.264')
    expect(() => validateSocialVideoMetadata({ ...valid, streams: [{ ...valid.streams[0], codec_name: 'mpeg4' }] })).toThrow('El video debe ser MP4/H.264')
  })

  it('strips JPEG GPS/XMP metadata, applies EXIF orientation, and keeps PNG transparency', async () => {
    priorUploads = config.uploadDirectory
    uploadsDir = await mkdtemp(join(tmpdir(), 'beatvault-social-uploads-'))
    config.uploadDirectory = uploadsDir

    const xmp = '<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"><rdf:Description rdf:about="" xmlns:exif="http://ns.adobe.com/exif/1.0/"><exif:GPSLatitude>19,25,0N</exif:GPSLatitude></rdf:Description></rdf:RDF></x:xmpmeta>'
    const jpegPixels = Buffer.alloc(300 * 400 * 3)
    const quadrantColors = [[255, 0, 0], [0, 255, 0], [0, 0, 255], [255, 255, 0]]
    for (let y = 0; y < 400; y++) for (let x = 0; x < 300; x++) {
      const color = quadrantColors[(y < 200 ? 0 : 2) + (x < 150 ? 0 : 1)]
      jpegPixels.set(color, (y * 300 + x) * 3)
    }
    const gpsJpeg = await sharp(jpegPixels, { raw: { width: 300, height: 400, channels: 3 } })
      .withExif({
        IFD3: {
          GPSProcessingMethod: 'BeatVault GPS fixture',
          GPSLatitudeRef: 'N',
          GPSLatitude: '19/1 25/1 0/1',
          GPSLongitudeRef: 'W',
          GPSLongitude: '99/1 8/1 0/1',
        },
      })
      .withMetadata({ orientation: 6 })
      .withXmp(xmp)
      .jpeg({ quality: 100 })
      .toBuffer()
    const sourceMetadata = await sharp(gpsJpeg).metadata()
    expect(sourceMetadata.exif).toBeDefined()
    expect(sourceMetadata.xmp).toBeDefined()
    expect(sourceMetadata.orientation).toBe(6)

    const uploadPhoto = async (bytes: Buffer, mime: 'image/jpeg' | 'image/png') => {
      const boundary = `social-${randomUUID()}`
      const fields = [
        `--${boundary}\r\nContent-Disposition: form-data; name="body"\r\n\r\nPhoto test\r\n`,
        `--${boundary}\r\nContent-Disposition: form-data; name="audience"\r\n\r\nprivate\r\n`,
        `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="photo.${mime === 'image/jpeg' ? 'jpg' : 'png'}"\r\nContent-Type: ${mime}\r\n\r\n`,
      ]
      const payload = Buffer.concat([...fields.map(value => Buffer.from(value)), bytes, Buffer.from(`\r\n--${boundary}--\r\n`)])
      const request = Object.assign(Readable.from([payload]), {
        headers: { 'content-type': `multipart/form-data; boundary=${boundary}`, 'content-length': String(payload.length) },
      })
      const received = await receiveSocialPostMedia(request as unknown as IncomingMessage, 'social-photo-owner', 'photo')
      const stored = await readFile(join(config.uploadDirectory, received.media.storageKey))
      expect(received.media.sizeBytes).toBe(stored.length)
      return { received, stored }
    }

    const jpeg = await uploadPhoto(gpsJpeg, 'image/jpeg')
    const cleanJpegMetadata = await sharp(jpeg.stored).metadata()
    expect(jpeg.received.media.mimeType).toBe('image/jpeg')
    expect(cleanJpegMetadata.format).toBe('jpeg')
    expect(cleanJpegMetadata.exif).toBeUndefined()
    expect(cleanJpegMetadata.xmp).toBeUndefined()
    expect(cleanJpegMetadata.orientation).toBeUndefined()
    expect(cleanJpegMetadata.width).toBe(400)
    expect(cleanJpegMetadata.height).toBe(300)
    const { data: jpegPixelsAfter, info: jpegInfo } = await sharp(jpeg.stored).raw().toBuffer({ resolveWithObject: true })
    const sampleJpegPixel = (x: number, y: number) => [...jpegPixelsAfter.subarray((y * jpegInfo.width + x) * 3, (y * jpegInfo.width + x) * 3 + 3)]
    const blueTopLeft = sampleJpegPixel(100, 75)
    const redTopRight = sampleJpegPixel(300, 75)
    const yellowBottomLeft = sampleJpegPixel(100, 225)
    const greenBottomRight = sampleJpegPixel(300, 225)
    expect(blueTopLeft[2]).toBeGreaterThan(blueTopLeft[0] * 2)
    expect(redTopRight[0]).toBeGreaterThan(redTopRight[2] * 2)
    expect(yellowBottomLeft[0]).toBeGreaterThan(yellowBottomLeft[2] * 2)
    expect(yellowBottomLeft[1]).toBeGreaterThan(yellowBottomLeft[2] * 2)
    expect(greenBottomRight[1]).toBeGreaterThan(greenBottomRight[0] * 2)

    const alphaPixels = Buffer.alloc(256 * 256 * 4)
    alphaPixels.set([255, 0, 0, 0], 0)
    alphaPixels.set([0, 255, 0, 127], 4)
    const alphaPng = await sharp(alphaPixels, { raw: { width: 256, height: 256, channels: 4 } })
      .withXmp(xmp)
      .png()
      .toBuffer()
    const png = await uploadPhoto(alphaPng, 'image/png')
    const cleanPng = sharp(png.stored)
    const pngMetadata = await cleanPng.metadata()
    const { data: pixels, info } = await cleanPng.ensureAlpha().raw().toBuffer({ resolveWithObject: true })
    expect(png.received.media.mimeType).toBe('image/png')
    expect(pngMetadata.format).toBe('png')
    expect(pngMetadata.xmp).toBeUndefined()
    expect(pngMetadata.hasAlpha).toBe(true)
    expect(info.channels).toBe(4)
    expect([pixels[3], pixels[7]]).toEqual([0, 127])
  })

  it('removes orphaned media and crash-left temporary files without touching referenced posts', async () => {
    priorData = config.dataDirectory
    priorUploads = config.uploadDirectory
    dataDir = await mkdtemp(join(tmpdir(), 'beatvault-social-data-'))
    uploadsDir = await mkdtemp(join(tmpdir(), 'beatvault-social-uploads-'))
    config.dataDirectory = dataDir
    config.uploadDirectory = uploadsDir
    const repo = new LocalRepository()
    const ownerId = 'social-cleanup-owner'
    const id = randomUUID()
    const storageKey = `social-posts/${ownerId}/${id}`
    const mediaDirectory = join(uploadsDir, 'social-posts', ownerId)
    await mkdir(mediaDirectory, { recursive: true })
    const orphan = join(mediaDirectory, randomUUID())
    const referenced = join(mediaDirectory, id)
    await writeFile(orphan, 'orphan')
    await writeFile(referenced, 'referenced')
    const postId = randomUUID()
    await repo.createSocialPost({ id: postId, authorId: ownerId, kind: 'photo', body: 'Image', audience: 'private', visibility: 'published', media: { storageKey, mimeType: 'image/jpeg', sizeBytes: 10, sha256: 'a'.repeat(64) }, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }, 512 * 1024 * 1024)
    const staleTemp = join(uploadsDir, `.social-${randomUUID()}.tmp`)
    const freshTemp = join(uploadsDir, `.social-${randomUUID()}.tmp`)
    await writeFile(staleTemp, 'stale')
    await writeFile(freshTemp, 'active')
    const old = new Date(Date.now() - 2 * 60 * 60 * 1000)
    await utimes(staleTemp, old, old)
    await reconcileSocialPostMedia(repo)
    await expect(stat(orphan)).rejects.toThrow()
    expect((await readFile(referenced, 'utf8'))).toBe('referenced')
    await expect(stat(staleTemp)).rejects.toThrow()
    expect(await readFile(freshTemp, 'utf8')).toBe('active')
  })
})
