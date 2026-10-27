import { spawn } from 'node:child_process'
import { mkdir, readFile, rename, stat, unlink, writeFile } from 'node:fs/promises'
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path'
import { randomUUID } from 'node:crypto'
import { inflateSync } from 'node:zlib'
import { config } from './config'
import { normalizeImageUpload } from './image-upload'

export const maxArtworkBytes = 10 * 1024 * 1024
export const artworkThumbnailMaxBytes = 512 * 1024
export const artworkThumbnailSide = 640
const minArtworkSide = 640
const maxArtworkSide = 10000
const maxArtworkPixels = 16_000_000
const maxDecodedArtworkBytes = 64 * 1024 * 1024
const pngSignature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])

export type ArtworkFormat = { mimeType: 'image/jpeg' | 'image/png'; extension: 'jpg' | 'png'; width: number; height: number }
export type ArtworkRecord = ArtworkFormat & { assetId: string; ownerId: string; storageKey: string; sizeBytes: number; thumbnailStorageKey?: string; thumbnailSizeBytes?: number; updatedAt: string }

export async function normalizeArtworkUpload(bytes: Buffer, mimeType: string | undefined): Promise<{ bytes: Buffer; format: ArtworkFormat }> {
  const normalized = await normalizeImageUpload(bytes, mimeType, { maxBytes: maxArtworkBytes, minSide: minArtworkSide, maxSide: maxArtworkSide, square: true })
  const format: ArtworkFormat = { mimeType: normalized.mimeType, extension: normalized.mimeType === 'image/png' ? 'png' : 'jpg', width: normalized.width, height: normalized.height }
  return { bytes: normalized.bytes, format }
}

function jpegDimensions(bytes: Buffer): { width: number; height: number } | undefined {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return undefined
  let offset = 2
  let dimensions: { width: number; height: number } | undefined
  while (offset + 4 < bytes.length && offset < 1024 * 1024) {
    if (bytes[offset] !== 0xff) return undefined
    while (bytes[offset] === 0xff) offset += 1
    const marker = bytes[offset++]
    if (marker === undefined || offset + 2 > bytes.length) return undefined
    if (marker === 0xd9) return undefined
    if (marker === 0xda) return dimensions && bytes.at(-2) === 0xff && bytes.at(-1) === 0xd9 ? dimensions : undefined
    if ([0x01, 0xd0, 0xd1, 0xd2, 0xd3, 0xd4, 0xd5, 0xd6, 0xd7].includes(marker)) continue
    const segmentLength = bytes.readUInt16BE(offset)
    if (segmentLength < 2 || offset + segmentLength > bytes.length) return undefined
    if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
      if (segmentLength < 7) return undefined
      dimensions = { height: bytes.readUInt16BE(offset + 3), width: bytes.readUInt16BE(offset + 5) }
    }
    offset += segmentLength
  }
  return undefined
}

function pngCrc32(bytes: Buffer): number {
  let crc = 0xffffffff
  for (const byte of bytes) {
    crc ^= byte
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0)
  }
  return (crc ^ 0xffffffff) >>> 0
}

function pngDimensions(bytes: Buffer): { width: number; height: number } | undefined {
  if (bytes.length < 57 || !bytes.subarray(0, 8).equals(pngSignature)) return undefined
  let offset = 8
  let width = 0
  let height = 0
  let channels = 0
  let bitDepth = 0
  let colorType = -1
  let sawHeader = false
  let sawPalette = false
  let sawData = false
  let endedData = false
  let sawEnd = false
  const data: Buffer[] = []
  while (offset + 12 <= bytes.length) {
    const length = bytes.readUInt32BE(offset)
    if (length > maxArtworkBytes || offset + length + 12 > bytes.length) return undefined
    const type = bytes.toString('ascii', offset + 4, offset + 8)
    const payload = bytes.subarray(offset + 8, offset + 8 + length)
    const expectedCrc = bytes.readUInt32BE(offset + 8 + length)
    if (pngCrc32(bytes.subarray(offset + 4, offset + 8 + length)) !== expectedCrc) return undefined
    if (!sawHeader && (type !== 'IHDR' || length !== 13)) return undefined
    if (type === 'IHDR') {
      if (sawHeader) return undefined
      width = payload.readUInt32BE(0); height = payload.readUInt32BE(4); bitDepth = payload[8]
      colorType = payload[9]
      channels = colorType === 0 ? 1 : colorType === 2 ? 3 : colorType === 3 ? 1 : colorType === 4 ? 2 : colorType === 6 ? 4 : 0
      const validDepth = colorType === 0 ? [1, 2, 4, 8, 16] : colorType === 2 ? [8, 16] : colorType === 3 ? [1, 2, 4, 8] : colorType === 4 || colorType === 6 ? [8, 16] : []
      if (!channels || !validDepth.includes(bitDepth) || payload[10] !== 0 || payload[11] !== 0 || payload[12] !== 0) return undefined
      sawHeader = true
    } else if (type === 'PLTE') {
      if (!sawHeader || sawData || length === 0 || length % 3 !== 0 || length > 768) return undefined
      sawPalette = true
    } else if (type === 'IDAT') {
      if (!sawHeader || endedData || (colorType === 3 && !sawPalette)) return undefined
      sawData = true
      data.push(payload)
    } else if (type === 'IEND') {
      if (length !== 0 || !sawData || offset + 12 !== bytes.length) return undefined
      sawEnd = true
      break
    } else {
      if (sawData) endedData = true
      if ((bytes[offset + 4] & 0x20) === 0) return undefined
    }
    if (sawData && type !== 'IDAT') endedData = true
    offset += length + 12
  }
  if (!sawHeader || !sawData || !sawEnd || width < 1 || height < 1 || width * height > maxArtworkPixels || (colorType === 3 && !sawPalette)) return undefined
  const rowBytes = Math.ceil(width * channels * bitDepth / 8)
  const expectedBytes = (rowBytes + 1) * height
  if (expectedBytes > maxDecodedArtworkBytes) return undefined
  try {
    const decoded = inflateSync(Buffer.concat(data), { maxOutputLength: expectedBytes })
    if (decoded.length !== expectedBytes) return undefined
    for (let row = 0; row < height; row++) if (decoded[row * (rowBytes + 1)] > 4) return undefined
  } catch { return undefined }
  return { width, height }
}

export function validateArtwork(bytes: Buffer, declaredMime: string | undefined): ArtworkFormat | undefined {
  let format: ArtworkFormat | undefined
  const png = pngDimensions(bytes)
  if (png) {
    format = { mimeType: 'image/png', extension: 'png', ...png }
  } else {
    const dimensions = jpegDimensions(bytes)
    if (dimensions) format = { mimeType: 'image/jpeg', extension: 'jpg', ...dimensions }
  }
  if (!format || declaredMime?.split(';', 1)[0].trim().toLowerCase() !== format.mimeType) return undefined
  if (format.width !== format.height || format.width < minArtworkSide || format.width > maxArtworkSide || format.width * format.height > maxArtworkPixels) return undefined
  return format
}

export function validateProfileImage(bytes: Buffer, declaredMime: string | undefined): ArtworkFormat | undefined {
  let format: ArtworkFormat | undefined
  const png = pngDimensions(bytes)
  if (png) format = { mimeType: 'image/png', extension: 'png', ...png }
  else {
    const dimensions = jpegDimensions(bytes)
    if (dimensions) format = { mimeType: 'image/jpeg', extension: 'jpg', ...dimensions }
  }
  if (!format || declaredMime?.split(';', 1)[0].trim().toLowerCase() !== format.mimeType) return undefined
  if (format.width < 256 || format.height < 256 || format.width > 8000 || format.height > 8000 || format.width * format.height > 16_000_000) return undefined
  return format
}

export function artworkPath(uploadDirectory: string, storageKey: string): string {
  const root = resolve(uploadDirectory)
  const target = resolve(root, storageKey)
  const path = relative(root, target)
  if (!path || path === '..' || path.startsWith(`..${sep}`) || isAbsolute(path)) throw new Error('ARTWORK_STORAGE_PATH_INVALID')
  return target
}

export async function persistArtwork(ownerId: string, assetId: string, bytes: Buffer, format: ArtworkFormat): Promise<Pick<ArtworkRecord, 'storageKey' | 'sizeBytes'>> {
  const owner = ownerId.replace(/[^a-zA-Z0-9_-]/g, '_')
  const storageKey = `${owner}/${assetId}-${randomUUID()}.${format.extension}`
  const destination = artworkPath(config.uploadDirectory, storageKey)
  const temporary = resolve(dirname(destination), `.tmp-artwork-${randomUUID()}`)
  await mkdir(dirname(destination), { recursive: true })
  try {
    await writeFile(temporary, bytes, { flag: 'wx' })
    await rename(temporary, destination)
    return { storageKey, sizeBytes: bytes.length }
  } catch (error) {
    await unlink(temporary).catch(() => undefined)
    throw error
  }
}

export async function persistArtworkThumbnail(sourceStorageKey: string): Promise<{ decoded: boolean; thumbnail?: Pick<ArtworkRecord, 'thumbnailStorageKey' | 'thumbnailSizeBytes'> }> {
  const thumbnailStorageKey = sourceStorageKey.replace(/\.(?:jpg|png)$/i, '.thumb.webp')
  if (thumbnailStorageKey === sourceStorageKey) return { decoded: false }
  const source = artworkPath(config.uploadDirectory, sourceStorageKey)
  const destination = artworkPath(config.uploadDirectory, thumbnailStorageKey)
  const temporary = resolve(dirname(destination), `.tmp-artwork-thumbnail-${randomUUID()}.webp`)
  try {
    const sourceSize = (await stat(source)).size
    await mkdir(dirname(destination), { recursive: true })
    await new Promise<void>((resolvePromise, reject) => {
      const child = spawn(config.ffmpegPath, [
        '-nostdin', '-hide_banner', '-loglevel', 'error', '-y', '-i', source,
        '-vf', `scale=${artworkThumbnailSide}:${artworkThumbnailSide}:flags=lanczos`,
        '-frames:v', '1', '-threads', '2', '-c:v', 'libwebp', '-quality', '78',
        '-compression_level', '6', '-preset', 'picture', '-f', 'webp', temporary,
      ], { shell: false, windowsHide: true, stdio: ['ignore', 'ignore', 'ignore'] })
      const timeout = setTimeout(() => { child.kill('SIGKILL'); reject(new Error('ARTWORK_THUMBNAIL_TIMEOUT')) }, 30000)
      child.once('error', error => { clearTimeout(timeout); reject(error) })
      child.once('close', code => {
        clearTimeout(timeout)
        if (code === 0) resolvePromise()
        else reject(new Error('ARTWORK_THUMBNAIL_FAILED'))
      })
    })
    const bytes = await readFile(temporary)
    if (bytes.length < 16 || bytes.toString('ascii', 0, 4) !== 'RIFF' || bytes.toString('ascii', 8, 12) !== 'WEBP') throw new Error('ARTWORK_THUMBNAIL_INVALID')
    if (bytes.length > artworkThumbnailMaxBytes || bytes.length >= sourceSize) {
      await unlink(destination).catch(() => undefined)
      return { decoded: true }
    }
    await unlink(destination).catch(() => undefined)
    await rename(temporary, destination)
    return { decoded: true, thumbnail: { thumbnailStorageKey, thumbnailSizeBytes: bytes.length } }
  } catch {
    await unlink(destination).catch(() => undefined)
    return { decoded: false }
  } finally {
    await unlink(temporary).catch(() => undefined)
  }
}

export async function removeArtwork(storageKey: string): Promise<void> {
  await unlink(artworkPath(config.uploadDirectory, storageKey)).catch(() => undefined)
  const thumbnailStorageKey = storageKey.replace(/\.(?:jpg|png)$/i, '.thumb.webp')
  if (thumbnailStorageKey !== storageKey) await unlink(artworkPath(config.uploadDirectory, thumbnailStorageKey)).catch(() => undefined)
}

export async function artworkExists(storageKey: string): Promise<boolean> {
  return stat(artworkPath(config.uploadDirectory, storageKey)).then(info => info.isFile() && info.size > 0, () => false)
}
