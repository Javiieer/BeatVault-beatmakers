import Busboy from 'busboy'
import { createWriteStream, createReadStream } from 'node:fs'
import { mkdir, open, readFile, readdir, rename, stat, unlink, writeFile, copyFile, constants } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { join } from 'node:path'
import type { IncomingMessage } from 'node:http'
import { config } from './config'
import { HttpInputError } from './http'
import { artworkPath } from './artwork'
import { normalizeImageUpload } from './image-upload'
import type { ServerRepository } from './store'
import type { SocialPost, SocialPostMedia } from './social-posts'
import type { SocialStory, SocialStoryCursor } from './social-stories'

export const socialPhotoMaxBytes = 20 * 1024 * 1024
export const socialVideoMaxBytes = 100 * 1024 * 1024
export const socialMediaAccountMaxBytes = 512 * 1024 * 1024
export const socialPhotoMaxPixels = 16_000_000
export const socialVideoMaxDurationSeconds = 180
export const socialVideoMaxWidth = 1920
export const socialVideoMaxHeight = 1080
const mediaProcessTimeoutMs = 20_000
const socialVideoSanitizeTimeoutMs = 120_000
const safeOwner = (id: string) => id.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 80)

function detectMedia(bytes: Buffer, declared: string): SocialPostMedia['mimeType'] | undefined {
  if (declared === 'video/mp4' && bytes.length >= 12 && bytes.toString('ascii', 4, 8) === 'ftyp') return 'video/mp4'
  return undefined
}

async function ffprobeSocialVideo(path: string, maxDurationSeconds = socialVideoMaxDurationSeconds) {
  const output = await new Promise<string>((resolvePromise, reject) => {
    const child = spawn(config.ffprobePath, ['-v', 'error', '-protocol_whitelist', 'file', '-enable_drefs', '0', '-use_absolute_path', '0', '-show_entries', 'format=format_name,duration:format_tags:stream=codec_type,codec_name,width,height,duration:stream_tags:stream_side_data', '-of', 'json', path], { shell: false, windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] })
    let stdout = ''
    let settled = false
    const finish = (error?: Error) => { if (settled) return; settled = true; clearTimeout(timeout); if (error) reject(error); else resolvePromise(stdout) }
    const timeout = setTimeout(() => { child.kill('SIGKILL'); finish(new Error('SOCIAL_MEDIA_PROBE_TIMEOUT')) }, mediaProcessTimeoutMs)
    child.stdout.setEncoding('utf8').on('data', (chunk: string) => { stdout += chunk; if (stdout.length > 64 * 1024) { child.kill('SIGKILL'); finish(new Error('SOCIAL_MEDIA_PROBE_OUTPUT_LIMIT')) } })
    child.once('error', () => finish(new Error('SOCIAL_MEDIA_PROBE_FAILED')))
    child.once('close', code => code === 0 ? finish() : finish(new Error('SOCIAL_MEDIA_PROBE_FAILED')))
  })
  let metadata: SocialVideoProbeMetadata
  try { metadata = JSON.parse(output) as typeof metadata } catch { throw new Error('SOCIAL_MEDIA_PROBE_FAILED') }
  validateSocialVideoMetadata(metadata, maxDurationSeconds)
  return metadata
}

type SocialVideoProbeMetadata = {
  format?: { format_name?: string; duration?: string; tags?: Record<string, string> }
  streams?: Array<{ codec_type?: string; codec_name?: string; width?: number; height?: number; duration?: string; tags?: Record<string, string>; side_data_list?: Array<{ side_data_type?: string }> }>
}

export function validateSocialVideoMetadata(metadata: SocialVideoProbeMetadata, maxDurationSeconds = socialVideoMaxDurationSeconds) {
  const video = metadata.streams?.find(stream => stream.codec_type === 'video')
  const duration = Number(metadata.format?.duration || video?.duration || 0)
  if (!metadata.format?.format_name?.split(',').some(name => name === 'mov' || name === 'mp4') || !video || video.codec_name !== 'h264' || !Number.isSafeInteger(video.width) || !Number.isSafeInteger(video.height) || (video.width || 0) < 1 || (video.height || 0) < 1 || (video.width || 0) > socialVideoMaxWidth || (video.height || 0) > socialVideoMaxHeight || !Number.isFinite(duration) || duration <= 0 || duration > maxDurationSeconds) throw new HttpInputError(400, 'SOCIAL_VIDEO_LIMITS', `El video debe ser MP4/H.264, durar hasta ${Math.floor(maxDurationSeconds / 60) || maxDurationSeconds} ${maxDurationSeconds < 60 ? 'segundos' : 'minutos'} y no exceder 1920x1080.`)
}

const normalizedVideoFormatTags = new Set(['major_brand', 'minor_version', 'compatible_brands', 'encoder'])
const normalizedVideoStreamTags = new Set(['language', 'handler_name', 'encoder'])

export function validateSanitizedSocialVideoMetadata(metadata: SocialVideoProbeMetadata) {
  const formatTags = metadata.format?.tags || {}
  if (Object.keys(formatTags).some(key => !normalizedVideoFormatTags.has(key.toLowerCase()))) throw new Error('SOCIAL_VIDEO_METADATA_NOT_STRIPPED')
  if ((formatTags.major_brand && formatTags.major_brand !== 'isom') || (formatTags.minor_version && formatTags.minor_version !== '512') || (formatTags.compatible_brands && formatTags.compatible_brands !== 'isomiso2avc1mp41') || (formatTags.encoder && !/^Lavf(?:\d+(?:\.\d+){1,2})?$/.test(formatTags.encoder))) throw new Error('SOCIAL_VIDEO_METADATA_NOT_STRIPPED')
  for (const stream of metadata.streams || []) {
    const streamTags = stream.tags || {}
    if (Object.keys(streamTags).some(key => !normalizedVideoStreamTags.has(key.toLowerCase())) || (stream.side_data_list?.length || 0) > 0) throw new Error('SOCIAL_VIDEO_METADATA_NOT_STRIPPED')
    if ((streamTags.language && streamTags.language !== 'und') || (streamTags.handler_name && !['VideoHandler', 'SoundHandler'].includes(streamTags.handler_name)) || (streamTags.encoder && !/^Lavc(?:\d+(?:\.\d+){1,2})? (?:libx264|libopenh264)$/.test(streamTags.encoder))) throw new Error('SOCIAL_VIDEO_METADATA_NOT_STRIPPED')
  }
}

async function sanitizeSocialVideo(source: string, destination: string, maxDurationSeconds: number, sourceDurationSeconds: number) {
  const deadline = Date.now() + socialVideoSanitizeTimeoutMs
  const common = [
    '-nostdin', '-hide_banner', '-loglevel', 'error', '-y', '-protocol_whitelist', 'file', '-enable_drefs', '0', '-use_absolute_path', '0', '-threads', '2', '-i', source,
    '-map', '0:v:0', '-map', '0:a:0?', '-map_metadata', '-1', '-map_chapters', '-1', '-sn', '-dn',
    '-t', String(maxDurationSeconds), '-vf', 'scale=ceil(iw/2)*2:ceil(ih/2)*2', '-pix_fmt', 'yuv420p',
    '-b:v', '2M', '-maxrate', '4M', '-bufsize', '4M', '-threads', '2', '-c:a', 'aac', '-b:a', '128k',
    '-movflags', '+faststart', '-fflags', '+bitexact', '-flags:v', '+bitexact', '-flags:a', '+bitexact',
    '-metadata', 'creation_time=', '-metadata', 'location=', '-brand', 'isom', '-fs', String(socialVideoMaxBytes), '-f', 'mp4',
  ]
  let sanitized = false
  for (const encoder of ['libx264', 'libopenh264']) {
    const remainingMs = deadline - Date.now()
    if (remainingMs <= 0) break
    await unlink(destination).catch(() => undefined)
    try {
      await runMediaProcess(config.ffmpegPath, [...common, '-c:v', encoder, destination], remainingMs)
      sanitized = true
      break
    } catch { await unlink(destination).catch(() => undefined) }
  }
  if (!sanitized) throw new HttpInputError(503, 'SOCIAL_VIDEO_SANITIZER_UNAVAILABLE', 'No se pudo procesar el video de forma segura.')
  const info = await stat(destination)
  if (!info.isFile() || info.size < 16 || info.size > socialVideoMaxBytes) throw new HttpInputError(413, 'SOCIAL_MEDIA_TOO_LARGE', 'El video procesado excede el tamaño permitido.')
  const normalized = await ffprobeSocialVideo(destination, maxDurationSeconds)
  try { validateSanitizedSocialVideoMetadata(normalized) }
  catch { throw new HttpInputError(400, 'SOCIAL_VIDEO_SANITIZATION_FAILED', 'No se pudo retirar de forma segura la metadata del video.') }
  const outputDurationSeconds = Number(normalized.format?.duration)
  if (!Number.isFinite(outputDurationSeconds) || sourceDurationSeconds - outputDurationSeconds > Math.max(0.5, sourceDurationSeconds * 0.02)) throw new HttpInputError(400, 'SOCIAL_VIDEO_NORMALIZATION_INCOMPLETE', 'No se pudo procesar el video completo de forma segura.')
}

export type ReceivedSocialMedia = { media: SocialPostMedia; body: string; audience: 'public' | 'friends' | 'private' }
export async function receiveSocialPostMedia(req: IncomingMessage, ownerId: string, kind: 'photo' | 'video', options: { collection?: 'social-posts' | 'social-stories'; maxVideoDurationSeconds?: number } = {}): Promise<ReceivedSocialMedia> {
  if (req.headers['content-type']?.split(';')[0]?.toLowerCase() !== 'multipart/form-data') throw new HttpInputError(415, 'MULTIPART_REQUIRED', 'Se requiere una carga multipart.')
  const maxFile = kind === 'photo' ? socialPhotoMaxBytes : socialVideoMaxBytes
  const maxRequest = maxFile + 128 * 1024
  if (Number(req.headers['content-length'] || 0) > maxRequest) throw new HttpInputError(413, 'SOCIAL_MEDIA_TOO_LARGE', 'El archivo excede el tamaño permitido.')
  const id = randomUUID()
  const temporary = join(config.uploadDirectory, `.social-${id}.tmp`)
  const sanitizedTemporary = join(config.uploadDirectory, `.social-sanitized-${id}.tmp.mp4`)
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
    const collection = options.collection ?? 'social-posts'
    const storageKey = `${collection}/${safeOwner(ownerId)}/${id}`
    const destination = artworkPath(config.uploadDirectory, storageKey)
    await mkdir(join(destination, '..'), { recursive: true })
    let mimeType: SocialPostMedia['mimeType'] | undefined
    if (kind === 'photo') {
      const bytes = await readFile(temporary)
      let normalized
      try { normalized = await normalizeImageUpload(bytes, declaredMime, { maxBytes: maxFile, minSide: 256, maxSide: 8000 }) }
      catch (error) {
        if (error instanceof HttpInputError && error.status === 413) throw new HttpInputError(413, 'SOCIAL_MEDIA_TOO_LARGE', 'La imagen procesada excede el tamaño permitido.')
        throw new HttpInputError(400, 'SOCIAL_MEDIA_INVALID', 'La imagen JPG, PNG, WebP o AVIF debe decodificarse correctamente y no superar 16 megapixeles.')
      }
      mimeType = normalized.mimeType
      await writeFile(temporary, normalized.bytes)
      sizeBytes = normalized.bytes.length
    } else {
      const handle = await open(temporary, 'r')
      try { const header = Buffer.alloc(32); const { bytesRead } = await handle.read(header, 0, header.length, 0); mimeType = detectMedia(header.subarray(0, bytesRead), declaredMime) }
      finally { await handle.close() }
      if (mimeType !== 'video/mp4') throw new HttpInputError(400, 'SOCIAL_MEDIA_INVALID', 'El archivo no es un contenedor MP4 válido.')
      const sourceMetadata = await ffprobeSocialVideo(temporary, options.maxVideoDurationSeconds)
      const sourceDuration = Number(sourceMetadata.format?.duration)
      if (!Number.isFinite(sourceDuration) || sourceDuration <= 0) throw new HttpInputError(400, 'SOCIAL_MEDIA_INVALID', 'El video no tiene una duración válida.')
      await runMediaProcess(config.ffmpegPath, ['-nostdin', '-hide_banner', '-loglevel', 'error', '-xerror', '-protocol_whitelist', 'file', '-enable_drefs', '0', '-use_absolute_path', '0', '-threads', '2', '-i', temporary, '-map', '0:v:0', '-t', `${socialVideoMaxDurationSeconds + 1}`, '-f', 'null', '-'])
      await sanitizeSocialVideo(temporary, sanitizedTemporary, options.maxVideoDurationSeconds ?? socialVideoMaxDurationSeconds, sourceDuration)
      await unlink(temporary)
      await rename(sanitizedTemporary, temporary)
      sizeBytes = (await stat(temporary)).size
    }
    await rename(temporary, destination)
    const hash = createHash('sha256')
    for await (const chunk of createReadStream(destination)) hash.update(chunk as Buffer)
    return { media: { storageKey, mimeType: mimeType!, sizeBytes, sha256: hash.digest('hex') }, body: body.trim(), audience: audience as 'public' | 'friends' | 'private' }
  } catch (error) {
    await unlink(temporary).catch(() => undefined)
    await unlink(sanitizedTemporary).catch(() => undefined)
    await unlink(artworkPath(config.uploadDirectory, `${options.collection ?? 'social-posts'}/${safeOwner(ownerId)}/${id}`)).catch(() => undefined)
    throw error
  }
}

function runMediaProcess(executable: string, args: string[], timeoutMs = mediaProcessTimeoutMs) {
  return new Promise<void>((resolvePromise, reject) => {
    const child = spawn(executable, args, { shell: false, windowsHide: true, stdio: ['ignore', 'ignore', 'ignore'] })
    let timedOut = false
    let settled = false
    const finish = (error?: HttpInputError) => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      if (error) reject(error)
      else resolvePromise()
    }
    const timeout = setTimeout(() => { timedOut = true; child.kill('SIGKILL') }, timeoutMs)
    child.once('error', () => finish(new HttpInputError(503, 'MEDIA_PROCESSOR_UNAVAILABLE', 'El validador multimedia no está disponible.')))
    child.once('close', code => finish(timedOut
      ? new HttpInputError(400, 'SOCIAL_MEDIA_DECODE_TIMEOUT', 'No se pudo validar el archivo dentro del tiempo permitido.')
      : code === 0 ? undefined : new HttpInputError(400, 'SOCIAL_MEDIA_DECODE_FAILED', 'El archivo multimedia está incompleto o dañado.')))
  })
}

export async function removeSocialPostMedia(post: Pick<SocialPost | SocialStory, 'media'>) {
  if (!post.media) return
  await unlink(artworkPath(config.uploadDirectory, post.media.storageKey)).catch(() => undefined)
}

export async function readSocialPostMedia(post: Pick<SocialPost | SocialStory, 'id' | 'media'>) {
  if (!post.media) return undefined
  const path = artworkPath(config.uploadDirectory, post.media.storageKey)
  try {
    const info = await stat(path)
    if (!info.isFile() || info.size !== post.media.sizeBytes || info.size <= 0) return undefined
    return { path, size: info.size, mimeType: post.media.mimeType }
  } catch { return undefined }
}

export async function preserveStoryReportEvidence(reportId: string, story: SocialStory) {
  if (!story.media) return undefined
  if (!/^[a-f0-9-]{36}$/i.test(reportId) || !new RegExp(`^social-stories/${safeOwner(story.authorId)}/[a-f0-9-]{36}$`, 'i').test(story.media.storageKey)) throw new Error('SOCIAL_STORY_EVIDENCE_INVALID')
  const source = await readSocialPostMedia(story)
  if (!source) throw new Error('SOCIAL_STORY_EVIDENCE_MISSING')
  const key = `moderation-evidence/stories/${reportId}`
  const target = artworkPath(config.uploadDirectory, key)
  await mkdir(join(target, '..'), { recursive: true })
  await copyFile(source.path, target, constants.COPYFILE_EXCL)
  try {
    const digest = createHash('sha256')
    await new Promise<void>((resolve, reject) => {
      const stream = createReadStream(target)
      stream.on('data', chunk => digest.update(chunk))
      stream.once('error', reject)
      stream.once('end', resolve)
    })
    const info = await stat(target)
    if (info.size !== story.media.sizeBytes || digest.digest('hex') !== story.media.sha256) throw new Error('SOCIAL_STORY_EVIDENCE_INVALID')
    return { storageKey: key, mimeType: story.media.mimeType, sizeBytes: info.size }
  } catch (error) { await unlink(target).catch(() => undefined); throw error }
}

export async function removeStoryReportEvidence(report: Pick<import('./social-stories').SocialStoryReport, 'evidenceStorageKey'>) {
  if (!report.evidenceStorageKey || !/^moderation-evidence\/stories\/[a-f0-9-]{36}$/i.test(report.evidenceStorageKey)) return
  try { await unlink(artworkPath(config.uploadDirectory, report.evidenceStorageKey)) }
  catch (error) { if (!(error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT')) throw error }
}

export async function deleteExpiredSocialStoryReportEvidence(repo: ServerRepository, now = new Date().toISOString()) {
  const expired = await repo.listExpiredSocialStoryEvidence(now, 100)
  for (const report of expired) {
    await removeStoryReportEvidence(report)
    await repo.clearSocialStoryEvidence(report.id, now)
  }
  return expired.length
}

export async function reconcileSocialStoryReportEvidence(repo: ServerRepository, now = new Date().toISOString()) {
  await deleteExpiredSocialStoryReportEvidence(repo, now)
  const root = join(config.uploadDirectory, 'moderation-evidence', 'stories')
  const names = await readdir(root).catch(error => {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') return []
    throw error
  })
  const referenced = new Set(await repo.listSocialStoryEvidenceStorageKeys())
  let removed = 0
  for (const name of names) {
    if (!/^[a-f0-9-]{36}$/i.test(name)) continue
    const key = `moderation-evidence/stories/${name}`
    if (referenced.has(key)) continue
    const path = artworkPath(config.uploadDirectory, key)
    const info = await stat(path).catch(error => {
      if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') return undefined
      throw error
    })
    if (!info?.isFile() || Date.parse(now) - info.mtimeMs < 60 * 60 * 1000) continue
    await removeStoryReportEvidence({ evidenceStorageKey: key })
    removed += 1
  }
  return removed
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
    if (!/^\.social-(?:sanitized-)?[a-f0-9-]{36}\.tmp(?:\.mp4)?$/i.test(name)) continue
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

export async function reconcileSocialStoryMedia(repo: ServerRepository) {
  await deleteExpiredSocialStoryMedia(repo)
  const root = join(config.uploadDirectory, 'social-stories')
  const entries = await readdir(root, { withFileTypes: true }).catch(() => [])
  const referenced = new Set<string>()
  const pageSize = 1000
  let cursor: SocialStoryCursor | undefined
  while (true) {
    const stories = await repo.listSocialStories({ limit: pageSize, ...(cursor ? { cursor } : {}) })
    for (const story of stories) if (story.media) referenced.add(story.media.storageKey)
    if (stories.length < pageSize) break
    const last = stories.at(-1)
    if (!last || last.createdAt === cursor?.createdAt && last.id === cursor.id) throw new Error('SOCIAL_STORY_RECONCILIATION_CURSOR_STALLED')
    cursor = { createdAt: last.createdAt, id: last.id }
  }
  for (const owner of entries) {
    if (!owner.isDirectory() || !/^[a-zA-Z0-9_-]{1,80}$/.test(owner.name)) continue
    for (const file of await readdir(join(root, owner.name), { withFileTypes: true }).catch(() => [])) {
      if (!file.isFile() || !/^[a-f0-9-]{36}$/i.test(file.name)) continue
      const key = `social-stories/${owner.name}/${file.name}`
      if (!referenced.has(key)) await unlink(artworkPath(config.uploadDirectory, key)).catch(() => undefined)
    }
  }
}

export async function deleteExpiredSocialStoryMedia(repo: ServerRepository, now = new Date().toISOString()) {
  const expired = await repo.deleteExpiredSocialStories(now)
  for (const story of expired) await removeSocialPostMedia(story)
  return expired.length
}
