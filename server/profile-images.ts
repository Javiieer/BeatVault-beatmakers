import { spawn } from 'node:child_process'
import { mkdir, readFile, rename, stat, unlink, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { randomUUID } from 'node:crypto'
import type { ProfileImageKind, ProfileImageRecord } from '../src/domains/profile'
import { artworkPath, validateProfileImage } from './artwork'
import { config } from './config'
import { HttpInputError } from './http'

export const profileImageMaxBytes = 8 * 1024 * 1024
export const profileImageMaxAccountBytes = 15 * 1024 * 1024
const profileImageMaxThumbnailBytes = 700 * 1024
const profileImageMaxDecodeMs = 20_000

export function validateProfileImageUpload(bytes: Buffer, mimeType: string | undefined, kind: ProfileImageKind) {
  if (bytes.length === 0 || bytes.length > profileImageMaxBytes) throw new HttpInputError(413, 'PROFILE_IMAGE_TOO_LARGE', 'La imagen debe pesar como maximo 8 MB.')
  const dimensions = validateProfileImage(bytes, mimeType)
  if (!dimensions) throw new HttpInputError(400, 'INVALID_PROFILE_IMAGE', 'Usa una imagen JPEG o PNG valida de al menos 256 x 256 px y hasta 16 megapixeles.')
  if (kind === 'avatar' && Math.abs(dimensions.width - dimensions.height) > Math.max(dimensions.width, dimensions.height) * 0.1) {
    throw new HttpInputError(400, 'AVATAR_MUST_BE_SQUARE', 'La foto de perfil debe ser cuadrada o casi cuadrada.')
  }
  return dimensions
}

const safeOwner = (ownerId: string) => ownerId.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 80)

async function runFfmpeg(args: string[], timeoutMs: number): Promise<void> {
  await new Promise<void>((resolvePromise, reject) => {
    const child = spawn(config.ffmpegPath, args, { shell: false, windowsHide: true, stdio: ['ignore', 'ignore', 'ignore'] })
    const timeout = setTimeout(() => { child.kill('SIGKILL'); reject(new Error('PROFILE_IMAGE_PROCESS_TIMEOUT')) }, timeoutMs)
    child.once('error', error => { clearTimeout(timeout); reject(error) })
    child.once('close', code => {
      clearTimeout(timeout)
      if (code === 0) resolvePromise()
      else reject(new Error('PROFILE_IMAGE_PROCESS_FAILED'))
    })
  })
}

export async function persistProfileImage(ownerId: string, kind: ProfileImageKind, bytes: Buffer, mimeType: string | undefined): Promise<ProfileImageRecord> {
  const dimensions = validateProfileImageUpload(bytes, mimeType, kind)
  const format = dimensions.extension
  const storageKey = `${safeOwner(ownerId)}/profile-${kind}-${randomUUID()}.${format}`
  const thumbnailStorageKey = storageKey.replace(/\.(?:jpg|png)$/i, '.thumb.webp')
  const source = artworkPath(config.uploadDirectory, storageKey)
  const thumbnail = artworkPath(config.uploadDirectory, thumbnailStorageKey)
  const sourceTemporary = resolve(dirname(source), `.tmp-profile-${randomUUID()}`)
  const thumbnailTemporary = resolve(dirname(thumbnail), `.tmp-profile-${randomUUID()}.webp`)
  await mkdir(dirname(source), { recursive: true })
  try {
    await writeFile(sourceTemporary, bytes, { flag: 'wx' })
    await rename(sourceTemporary, source)
    await runFfmpeg(['-nostdin', '-hide_banner', '-loglevel', 'error', '-xerror', '-protocol_whitelist', 'file', '-i', source, '-map', '0:v:0', '-f', 'null', '-'], profileImageMaxDecodeMs)
    const size = kind === 'avatar' ? 512 : 1600
    const height = kind === 'avatar' ? 512 : 640
    await runFfmpeg([
      '-nostdin', '-hide_banner', '-loglevel', 'error', '-xerror', '-protocol_whitelist', 'file', '-i', source,
      '-frames:v', '1', '-vf', `scale=${size}:${height}:force_original_aspect_ratio=decrease:flags=lanczos`,
      '-threads', '2', '-c:v', 'libwebp', '-quality', '80', '-compression_level', '6', '-preset', 'picture',
      '-f', 'webp', thumbnailTemporary,
    ], profileImageMaxDecodeMs)
    const thumbBytes = await readFile(thumbnailTemporary)
    if (thumbBytes.length < 16 || thumbBytes.length > profileImageMaxThumbnailBytes || thumbBytes.toString('ascii', 0, 4) !== 'RIFF' || thumbBytes.toString('ascii', 8, 12) !== 'WEBP') {
      throw new Error('PROFILE_IMAGE_THUMBNAIL_INVALID')
    }
    await rename(thumbnailTemporary, thumbnail)
    return { storageKey, thumbnailStorageKey, mimeType: dimensions.mimeType, sizeBytes: bytes.length, thumbnailSizeBytes: thumbBytes.length, width: dimensions.width, height: dimensions.height }
  } catch (error) {
    await unlink(source).catch(() => undefined)
    await unlink(thumbnail).catch(() => undefined)
    throw error
  } finally {
    await unlink(sourceTemporary).catch(() => undefined)
    await unlink(thumbnailTemporary).catch(() => undefined)
  }
}

const belongsTo = (image: ProfileImageRecord, ownerId: string, kind: ProfileImageKind) => {
  const prefix = `${safeOwner(ownerId)}/profile-${kind}-`
  return image.storageKey.startsWith(prefix) && image.thumbnailStorageKey === image.storageKey.replace(/\.(?:jpg|png)$/i, '.thumb.webp')
}

export async function removeProfileImage(image: ProfileImageRecord | undefined, ownerId: string, kind: ProfileImageKind): Promise<void> {
  if (!image) return
  if (!belongsTo(image, ownerId, kind)) return
  await unlink(artworkPath(config.uploadDirectory, image.storageKey)).catch(() => undefined)
  await unlink(artworkPath(config.uploadDirectory, image.thumbnailStorageKey)).catch(() => undefined)
}

export async function readProfileImage(image: ProfileImageRecord, thumbnail: boolean, ownerId: string, kind: ProfileImageKind): Promise<{ bytes: Buffer; mimeType: string } | undefined> {
  if (!belongsTo(image, ownerId, kind)) return undefined
  const key = thumbnail ? image.thumbnailStorageKey : image.storageKey
  try {
    const path = artworkPath(config.uploadDirectory, key)
    const info = await stat(path)
    if (!info.isFile() || info.size <= 0 || info.size > (thumbnail ? profileImageMaxThumbnailBytes : profileImageMaxBytes)) return undefined
    return { bytes: await readFile(path), mimeType: thumbnail ? 'image/webp' : image.mimeType }
  } catch { return undefined }
}
