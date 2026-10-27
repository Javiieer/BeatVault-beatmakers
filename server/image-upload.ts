import sharp from 'sharp'
import { HttpInputError } from './http'

export type NormalizedImage = { bytes: Buffer; mimeType: 'image/jpeg' | 'image/png'; width: number; height: number }

function signatureMime(bytes: Buffer): string | undefined {
  if (bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg'
  if (bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return 'image/png'
  if (bytes.length >= 16 && bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP' && bytes.readUInt32LE(4) + 8 === bytes.length) return 'image/webp'
  if (bytes.length >= 24 && bytes.toString('ascii', 4, 8) === 'ftyp') {
    const boxLength = bytes.readUInt32BE(0)
    if (boxLength < 16 || boxLength > Math.min(bytes.length, 4096)) return undefined
    const brands: string[] = [bytes.toString('ascii', 8, 12)]
    for (let offset = 16; offset + 4 <= boxLength; offset += 4) brands.push(bytes.toString('ascii', offset, offset + 4))
    if (brands.includes('avif')) return 'image/avif'
  }
  return undefined
}

export async function normalizeImageUpload(bytes: Buffer, declaredMime: string | undefined, options: {
  maxBytes: number; minSide: number; maxSide: number; square?: boolean;
}): Promise<NormalizedImage> {
  if (!bytes.length || bytes.length > options.maxBytes) throw new HttpInputError(413, 'IMAGE_TOO_LARGE', 'La imagen excede el tamaño permitido.')
  const actualMime = signatureMime(bytes)
  const declared = declaredMime?.split(';', 1)[0].trim().toLowerCase()
  const canonical = declared === 'image/jpg' ? 'image/jpeg' : declared
  if (!actualMime || canonical && canonical !== 'application/octet-stream' && canonical !== actualMime) throw new HttpInputError(400, 'IMAGE_INVALID', 'Usa una imagen JPG, PNG, WebP o AVIF válida; el contenido debe coincidir con su formato.')
  try {
    const input = sharp(bytes, { limitInputPixels: 16_000_000, failOn: 'warning', animated: false }).timeout({ seconds: 15 })
    const metadata = await input.metadata()
    const expected = { 'image/jpeg': 'jpeg', 'image/png': 'png', 'image/webp': 'webp', 'image/avif': 'heif' }[actualMime]
    if (metadata.format !== expected || (metadata.pages || 1) > 1 || !metadata.width || !metadata.height || metadata.width < options.minSide || metadata.height < options.minSide || metadata.width > options.maxSide || metadata.height > options.maxSide || metadata.width * metadata.height > 16_000_000) throw new Error('IMAGE_DIMENSIONS_OR_ANIMATION_INVALID')
    const sampleBytes = metadata.depth === 'uchar' ? 1 : metadata.depth === 'ushort' ? 2 : 4
    if (metadata.width * metadata.height * (metadata.channels || 4) * sampleBytes > 64 * 1024 * 1024) throw new Error('IMAGE_DECODED_BYTES_LIMIT')
    if (actualMime === 'image/avif' && metadata.compression !== 'av1') throw new Error('IMAGE_AVIF_CODEC_INVALID')
    const outputMime = actualMime === 'image/png' || metadata.hasAlpha ? 'image/png' : 'image/jpeg'
    const pipeline = input.rotate()
    if (options.square) {
      const side = Math.min(metadata.width, metadata.height, 4000)
      pipeline.resize(side, side, { fit: 'cover', position: 'centre', withoutEnlargement: true })
    }
    // No keepMetadata/withMetadata: uploaded EXIF/XMP/IPTC never enters served artifacts.
    const normalized = await (outputMime === 'image/png' ? pipeline.png({ compressionLevel: 9 }) : pipeline.jpeg({ quality: 92, mozjpeg: true })).toBuffer({ resolveWithObject: true })
    if (!normalized.data.length || normalized.data.length > options.maxBytes) throw new HttpInputError(413, 'IMAGE_TOO_LARGE', 'La imagen procesada excede el tamaño permitido.')
    return { bytes: normalized.data, mimeType: outputMime, width: normalized.info.width, height: normalized.info.height }
  } catch (error) {
    if (error instanceof HttpInputError) throw error
    throw new HttpInputError(400, 'IMAGE_INVALID', `La imagen debe decodificarse por completo, no estar animada y tener lados de al menos ${options.minSide} px, hasta 16 megapíxeles.`)
  }
}
