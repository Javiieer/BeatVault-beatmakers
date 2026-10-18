import Busboy from 'busboy'
import { createWriteStream, createReadStream } from 'node:fs'
import { mkdir, open, readFile, readdir, rename, stat, unlink, writeFile } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { join } from 'node:path'
import type { IncomingMessage } from 'node:http'
import sharp from 'sharp'
import { config } from './config'
import { HttpInputError } from './http'
import { artworkPath, validateProfileImage } from './artwork'
import type { ServerRepository } from './store'
import type { SocialPost, SocialPostMedia } from './social-posts'

export const socialPhotoMaxBytes = 20 * 1024 * 1024
export const socialVideoMaxBytes = 100 * 1024 * 1024
export const socialMediaAccountMaxBytes = 512 * 1024 * 1024
export const socialPhotoMaxPixels = 16_000_000
export const socialVideoMaxDurationSeconds = 180
export const socialVideoMaxWidth = 1920
export const socialVideoMaxHeight = 1080
const mediaProcessTimeoutMs = 20_000
const safeOwner = (id: string) => id.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 80)

function detectMedia(bytes: Buffer, declared: string): SocialPostMedia['mimeType'] | undefined {
  if (bytes.length >= 12 && bytes[0] === 0xff && bytes[1] === 0xd8 && declared === 'image/jpeg' && validateProfileImage(bytes, declared)) return 'image/jpeg'
  if (bytes.length >= 57 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) && declared === 'image/png' && validateProfileImage(bytes, declared)) return 'image/png'
  if (declared === 'video/mp4' && bytes.length >= 12 && bytes.toString('ascii', 4, 8) === 'ftyp') return 'video/mp4'
  return undefined
}

async function reencodeSocialPhoto(bytes: Buffer, mimeType: 'image/jpeg' | 'image/png') {
  try {
    const pipeline = sharp(bytes, { limitInputPixels: socialPhotoMaxPixels }).rotate()
    const normalized = mimeType === 'image/jpeg'
      ? await pipeline.jpeg({ quality: 92 }).toBuffer()
      : await pipeline.png({ compressionLevel: 9 }).toBuffer()
    const metadata = await sharp(normalized, { limitInputPixels: socialPhotoMaxPixels }).metadata()
    if (metadata.format !== (mimeType === 'image/jpeg' ? 'jpeg' : 'png') || !metadata.width || !metadata.height || metadata.width * metadata.height > socialPhotoMaxPixels || metadata.exif || metadata.xmp || metadata.iptc) {
      throw new Error('SOCIAL_PHOTO_NORMALIZATION_FAILED')
    }
    return normalized
  } catch {
    throw new HttpInputError(400, 'SOCIAL_MEDIA_INVALID', 'La imagen JPEG/PNG no pudo procesarse de forma segura.')
  }
}

async function ffprobeSocialVideo(path: string) {
  const output = await new Promise<string>((resolvePromise, reject) => {
    const child = spawn(config.ffprobePath, ['-v', 'error', '-protocol_whitelist', 'file', '-show_entries', 'format=format_name,duration:stream=codec_type,codec_name,width,height', '-of', 'json', path], { shell: false, windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] })
    let stdout = ''
    let settled = false
    const finish = (error?: Error) => { if (settled) return; settled = true; clearTimeout(timeout); if (error) reject(error); else resolvePromise(stdout) }
    const timeout = setTimeout(() => { child.kill('SIGKILL'); finish(new Error('SOCIAL_MEDIA_PROBE_TIMEOUT')) }, mediaProcessTimeoutMs)
    child.stdout.setEncoding('utf8').on('data', (chunk: string) => { stdout += chunk; if (stdout.length > 64 * 1024) { child.kill('SIGKILL'); finish(new Error('SOCIAL_MEDIA_PROBE_OUTPUT_LIMIT')) } })
    child.once('error', () => finish(new Error('SOCIAL_MEDIA_PROBE_FAILED')))
    child.once('close', code => code === 0 ? finish() : finish(new Error('SOCIAL_MEDIA_PROBE_FAILED')))
  })
  let metadata: { format?: { format_name?: string; duration?: string }; streams?: Array<{ codec_type?: string; codec_name?: string; width?: number; height?: number; duration?: string }> }
  try { metadata = JSON.parse(output) as typeof metadata } catch { throw new Error('SOCIAL_MEDIA_PROBE_FAILED') }
  validateSocialVideoMetadata(metadata)
}

export function validateSocialVideoMetadata(metadata: { format?: { format_name?: string; duration?: string }; streams?: Array<{ codec_type?: string; codec_name?: string; width?: number; height?: number; duration?: string }> }) {
  const video = metadata.streams?.find(stream => stream.codec_type === 'video')
  const duration = Number(metadata.format?.duration || video?.duration || 0)
  if (!metadata.format?.format_name?.split(',').some(name => name === 'mov' || name === 'mp4') || !video || video.codec_name !== 'h264' || !Number.isSafeInteger(video.width) || !Number.isSafeInteger(video.height) || (video.width || 0) < 1 || (video.height || 0) < 1 || (video.width || 0) > socialVideoMaxWidth || (video.height || 0) > socialVideoMaxHeight || !Number.isFinite(duration) || duration <= 0 || duration > socialVideoMaxDurationSeconds) throw new HttpInputError(400, 'SOCIAL_VIDEO_LIMITS', 'El video debe ser MP4/H.264, durar hasta 3 minutos y no exceder 1920x1080.')
}

export type ReceivedSocialMedia = { media: SocialPostMedia; body: string; audience: 'public' | 'friends' | 'private' }
export async function receiveSocialPostMedia(req: IncomingMessage, ownerId: string, kind: 'photo' | 'video'): Promise<ReceivedSocialMedia> {
  if (req.headers['content-type']?.split(';')[0]?.toLowerCase() !== 'multipart/form-data') throw new HttpInputError(415, 'MULTIPART_REQUIRED', 'Se requiere una carga multipart.')
  const maxFile = kind === 'photo' ? socialPhotoMaxBytes : socialVideoMaxBytes
  const maxRequest = maxFile + 128 * 1024
  if (Number(req.headers['content-length'] || 0) > maxRequest) throw new HttpInputError(413, 'SOCIAL_MEDIA_TOO_LARGE', 'El archivo excede el tamaño permitido.')
  const id = randomUUID()
  const temporary = join(config.uploadDirectory, `.social-${id}.tmp`)
  let declaredMime = ''
  let sizeBytes = 0
  let body = ''
  let audience = ''
  let fileSeen = false
  await mkdir(config.uploadDirectory, { recursive: true })
  try {
    await new Promise<void>((resolvePromise, reject) => {
      const parser = Busboy({ headers: req.headers, limits: { fileSize: maxFile, files: 1, fields: 3, fieldSize: 2048, parts: 4 } })
      let output: ReturnType<typeof createWriteStream> | undefined
      let settled = false
      const finish = (error?: Error) => {
        if (settled) return
        settled = true
        if (error && output && !output.closed) { output.destroy(); output.once('close', () => reject(error)); return }
        if (error) reject(error); else resolvePromise()
      }
      parser.on('file', (field, stream, info) => {
        if (field !== 'file' || fileSeen) { stream.resume(); finish(new HttpInputError(400, 'SOCIAL_MEDIA_FILE_REQUIRED', 'Carga un solo archivo en el campo file.')); return }
        fileSeen = true
        declaredMime = info.mimeType.toLowerCase()
        output = createWriteStream(temporary, { flags: 'wx', mode: 0o600 })
        stream.on('data', chunk => { sizeBytes += Buffer.byteLength(chunk) }).on('limit', () => finish(new HttpInputError(413, 'SOCIAL_MEDIA_TOO_LARGE', 'El archivo excede el tamaño permitido.'))).on('error', error => finish(error))
        output.on('error', error => finish(error))
        stream.pipe(output)
      })
      parser.on('field', (name, value) => {
        if (name === 'body') body = value
        else if (name === 'audience') audience = value
        else finish(new HttpInputError(400, 'SOCIAL_POST_FIELD_INVALID', 'Campo de publicación no permitido.'))
      }).on('filesLimit', () => finish(new HttpInputError(400, 'SOCIAL_MEDIA_FILE_REQUIRED', 'Carga un solo archivo.')))
        .on('fieldsLimit', () => finish(new HttpInputError(400, 'SOCIAL_POST_FIELD_INVALID', 'Demasiados campos.')))
        .on('partsLimit', () => finish(new HttpInputError(400, 'SOCIAL_POST_FIELD_INVALID', 'Demasiadas partes multipart.')))
        .on('error', error => finish(error instanceof Error ? error : new Error('SOCIAL_MEDIA_PARSE_FAILED')))
        .on('finish', () => { if (!fileSeen || !output) { finish(new HttpInputError(400, 'SOCIAL_MEDIA_FILE_REQUIRED', 'Falta el archivo.')); return }; output.once('close', () => finish()) })
      let requestBytes = 0
      req.on('data', chunk => { requestBytes += chunk.length; if (requestBytes > maxRequest) { req.unpipe(parser); parser.destroy(); req.resume(); finish(new HttpInputError(413, 'SOCIAL_MEDIA_TOO_LARGE', 'La solicitud excede el tamaño permitido.')) } })
        .on('aborted', () => finish(new HttpInputError(400, 'SOCIAL_MEDIA_ABORTED', 'La carga fue interrumpida.'))).on('error', error => finish(error)).pipe(parser)
    })
    if (!sizeBytes) throw new HttpInputError(400, 'SOCIAL_MEDIA_EMPTY', 'El archivo está vacío.')
    if (body.length > 600 || !['public', 'friends', 'private'].includes(audience)) throw new HttpInputError(400, 'SOCIAL_POST_INVALID', 'Texto o audiencia inválidos.')
    const storageKey = `social-posts/${safeOwner(ownerId)}/${id}`
    const destination = artworkPath(config.uploadDirectory, storageKey)
    await mkdir(join(destination, '..'), { recursive: true })
    let mimeType: SocialPostMedia['mimeType'] | undefined
    if (kind === 'photo') {
      const bytes = await readFile(temporary)
      mimeType = detectMedia(bytes, declaredMime)
      const dimensions = mimeType ? validateProfileImage(bytes, declaredMime) : undefined
      if ((mimeType !== 'image/jpeg' && mimeType !== 'image/png') || !dimensions || dimensions.width * dimensions.height > socialPhotoMaxPixels) throw new HttpInputError(400, 'SOCIAL_MEDIA_INVALID', 'La imagen JPEG/PNG debe decodificarse correctamente y no superar 16 megapixeles.')
      const normalized = await reencodeSocialPhoto(bytes, mimeType)
      if (normalized.length > maxFile) throw new HttpInputError(413, 'SOCIAL_MEDIA_TOO_LARGE', 'La imagen procesada excede el tamaño permitido.')
      await writeFile(temporary, normalized)
      sizeBytes = normalized.length
    } else {
      const handle = await open(temporary, 'r')
      try { const header = Buffer.alloc(32); const { bytesRead } = await handle.read(header, 0, header.length, 0); mimeType = detectMedia(header.subarray(0, bytesRead), declaredMime) }
      finally { await handle.close() }
      if (mimeType !== 'video/mp4') throw new HttpInputError(400, 'SOCIAL_MEDIA_INVALID', 'El archivo no es un contenedor MP4 válido.')
      await ffprobeSocialVideo(temporary)
      await runMediaProcess(config.ffmpegPath, ['-nostdin', '-hide_banner', '-loglevel', 'error', '-xerror', '-protocol_whitelist', 'file', '-i', temporary, '-map', '0:v:0', '-t', `${socialVideoMaxDurationSeconds + 1}`, '-f', 'null', '-'])
    }
    await rename(temporary, destination)
    const hash = createHash('sha256')
    for await (const chunk of createReadStream(destination)) hash.update(chunk as Buffer)
    return { media: { storageKey, mimeType: mimeType!, sizeBytes, sha256: hash.digest('hex') }, body: body.trim(), audience: audience as 'public' | 'friends' | 'private' }
  } catch (error) {
    await unlink(temporary).catch(() => undefined)
    await unlink(artworkPath(config.uploadDirectory, `social-posts/${safeOwner(ownerId)}/${id}`)).catch(() => undefined)
    throw error
  }
}

function runMediaProcess(executable: string, args: string[]) {
  return new Promise<void>((resolvePromise, reject) => {
    const child = spawn(executable, args, { shell: false, windowsHide: true, stdio: ['ignore', 'ignore', 'ignore'] })
    const timeout = setTimeout(() => { child.kill('SIGKILL'); reject(new HttpInputError(400, 'SOCIAL_MEDIA_DECODE_TIMEOUT', 'No se pudo validar el archivo dentro del tiempo permitido.')) }, mediaProcessTimeoutMs)
    child.once('error', () => { clearTimeout(timeout); reject(new HttpInputError(503, 'MEDIA_PROCESSOR_UNAVAILABLE', 'El validador multimedia no está disponible.')) })
    child.once('close', code => { clearTimeout(timeout); if (code === 0) resolvePromise(); else reject(new HttpInputError(400, 'SOCIAL_MEDIA_DECODE_FAILED', 'El archivo multimedia está incompleto o dañado.')) })
  })
}

export async function removeSocialPostMedia(post: Pick<SocialPost, 'media'>) {
  if (!post.media) return
  await unlink(artworkPath(config.uploadDirectory, post.media.storageKey)).catch(() => undefined)
}

export async function readSocialPostMedia(post: SocialPost) {
  if (!post.media) return undefined
  const path = artworkPath(config.uploadDirectory, post.media.storageKey)
  try {
    const info = await stat(path)
    if (!info.isFile() || info.size !== post.media.sizeBytes || info.size <= 0) return undefined
    return { path, size: info.size, mimeType: post.media.mimeType }
  } catch { return undefined }
}

export async function reconcileSocialPostMedia(repo: ServerRepository) {
  const root = join(config.uploadDirectory, 'social-posts')
  const entries = await readdir(root, { withFileTypes: true }).catch(() => [])
  const referenced = new Set<string>()
  const pageSize = 1000
  let cursor: { createdAt: string; id: string } | undefined
  while (true) {
    const posts = await repo.listSocialPosts({ limit: pageSize, ...(cursor ? { cursor } : {}) })
    for (const post of posts) if (post.media) referenced.add(post.media.storageKey)
    if (posts.length < pageSize) break
    const last = posts.at(-1)
    if (!last || last.createdAt === cursor?.createdAt && last.id === cursor.id) throw new Error('SOCIAL_MEDIA_RECONCILIATION_CURSOR_STALLED')
    cursor = { createdAt: last.createdAt, id: last.id }
  }
  for (const name of await readdir(config.uploadDirectory).catch(() => [])) {
    if (!/^\.social-[a-f0-9-]{36}\.tmp$/i.test(name)) continue
    const path = join(config.uploadDirectory, name)
    const info = await stat(path).catch(() => undefined)
    if (info && Date.now() - info.mtimeMs > 60 * 60 * 1000) await unlink(path).catch(() => undefined)
  }
  for (const owner of entries) {
    if (!owner.isDirectory() || !/^[a-zA-Z0-9_-]{1,80}$/.test(owner.name)) continue
    for (const file of await readdir(join(root, owner.name), { withFileTypes: true }).catch(() => [])) {
      if (!file.isFile() || !/^[a-f0-9-]{36}$/i.test(file.name)) continue
      const key = `social-posts/${owner.name}/${file.name}`
      if (!referenced.has(key)) await unlink(artworkPath(config.uploadDirectory, key)).catch(() => undefined)
    }
  }
}
