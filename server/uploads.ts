import Busboy from 'busboy'
import { createReadStream, createWriteStream } from 'node:fs'
import { mkdir, rename, unlink, readdir, stat } from 'node:fs/promises'
import { isAbsolute, join, relative, resolve, sep } from 'node:path'
import { createHash, randomUUID } from 'node:crypto'
import type { IncomingMessage } from 'node:http'
import { config } from './config'
import type { AssetRecord, ServerRepository } from './store'

const validName = (name: string): string => name.replace(/[\\/\0]/g, '_').slice(0, 255) || 'unnamed'
const mimeAliases: Record<string, string> = {
  'audio/aac': 'audio/aac', 'audio/x-aac': 'audio/aac',
  'audio/flac': 'audio/flac', 'audio/x-flac': 'audio/flac',
  'audio/mpeg': 'audio/mpeg', 'audio/mp3': 'audio/mpeg',
  'audio/m4a': 'audio/mp4', 'audio/mp4': 'audio/mp4', 'audio/x-m4a': 'audio/mp4',
  'audio/ogg': 'audio/ogg', 'application/ogg': 'audio/ogg',
  'audio/wav': 'audio/wav', 'audio/wave': 'audio/wav', 'audio/x-wav': 'audio/wav', 'audio/vnd.wave': 'audio/wav',
  'audio/webm': 'audio/webm',
}
const mimeForExtension: Record<string, string> = {
  aac: 'audio/aac', flac: 'audio/flac', mp3: 'audio/mpeg', m4a: 'audio/mp4',
  ogg: 'audio/ogg', wav: 'audio/wav', webm: 'audio/webm',
}
const normalizedMime = (mime: string, filename: string): string | undefined => {
  const value = mime.trim().toLowerCase().split(';')[0]
  if (!value || value === 'application/octet-stream') return mimeForExtension[filename.toLowerCase().split('.').pop() ?? '']
  return mimeAliases[value]
}
const signature = (file: string, mime: string): Promise<boolean> => new Promise((resolve, reject) => {
  const stream = createReadStream(file, { start: 0, end: 15 }); const chunks: Buffer[] = []
  stream.on('data', chunk => chunks.push(Buffer.from(chunk))).on('error', reject).on('end', () => {
    const b = Buffer.concat(chunks)
    const matches: Record<string, boolean> = {
      'audio/aac': b.length >= 2 && b[0] === 0xff && (b[1] & 0xf6) === 0xf0,
      'audio/flac': b.subarray(0, 4).toString('ascii') === 'fLaC',
      'audio/mpeg': b.subarray(0, 3).toString('ascii') === 'ID3' || (b.length >= 2 && b[0] === 0xff && (b[1] & 0xe0) === 0xe0),
      'audio/mp4': b.length >= 12 && b.toString('ascii', 4, 8) === 'ftyp',
      'audio/ogg': b.subarray(0, 4).toString('ascii') === 'OggS',
      'audio/wav': b.length >= 12 && b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WAVE',
      'audio/webm': b.length >= 4 && b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3,
    }
    resolve(matches[mime] ?? false)
  })
})
export type UploadResult = { asset: AssetRecord; duplicate?: boolean }
export async function receiveUpload(req: IncomingMessage, ownerId: string, repo: ServerRepository): Promise<UploadResult> {
  if (req.headers['content-type']?.split(';')[0] !== 'multipart/form-data') throw new Error('UPLOAD_CONTENT_TYPE')
  const declaredLength = Number(req.headers['content-length'] || 0); if (declaredLength > config.uploadLimits.requestBytes) throw new Error('UPLOAD_LIMIT')
  await mkdir(config.uploadDirectory, { recursive: true }); const id = randomUUID(); const owner = ownerId.replace(/[^a-zA-Z0-9_-]/g, '_'); const temporary = join(config.uploadDirectory, `.tmp-${id}`); let originalName = ''; let mimeType = ''; let sizeBytes = 0; let fileSeen = false; let aborted = false
  const cleanup = async () => { try { await unlink(temporary) } catch { /* already removed */ } }
  try {
    await new Promise<void>((resolve, reject) => {
      const bb = Busboy({ headers: req.headers, limits: { fileSize: config.uploadLimits.fileBytes, files: config.uploadLimits.files, fields: config.uploadLimits.fields, parts: config.uploadLimits.files + config.uploadLimits.fields } }); let output: ReturnType<typeof createWriteStream> | undefined
      bb.on('file', (_field, stream, info) => { if (fileSeen) { stream.resume(); return }; fileSeen = true; originalName = validName(info.filename); mimeType = info.mimeType; output = createWriteStream(temporary, { flags: 'wx' }); stream.on('data', chunk => { sizeBytes += Buffer.byteLength(chunk); }).on('limit', () => reject(new Error('UPLOAD_LIMIT'))).on('error', reject); stream.pipe(output); output.on('error', reject) })
      bb.on('field', () => undefined).on('filesLimit', () => reject(new Error('UPLOAD_LIMIT'))).on('fieldsLimit', () => reject(new Error('UPLOAD_LIMIT'))).on('partsLimit', () => reject(new Error('UPLOAD_LIMIT'))).on('error', reject).on('finish', () => { if (!fileSeen) reject(new Error('UPLOAD_FILE_REQUIRED')); else if (output) output.on('close', () => resolve()); else reject(new Error('UPLOAD_FILE_REQUIRED')) })
      req.on('aborted', () => { aborted = true; reject(new Error('UPLOAD_ABORTED')) }).on('error', reject).pipe(bb)
    })
    if (aborted || sizeBytes < 1) throw new Error('UPLOAD_EMPTY')
    const canonicalMime = normalizedMime(mimeType, originalName)
    if (!canonicalMime) throw new Error('UPLOAD_MIME')
    if (!(await signature(temporary, canonicalMime))) throw new Error('UPLOAD_SIGNATURE')
    const contentHash = await new Promise<string>((resolve, reject) => { const hash = createHash('sha256'); createReadStream(temporary).on('data', chunk => hash.update(chunk)).on('error', reject).on('end', () => resolve(hash.digest('hex'))) })
    const duplicate = await repo.findDuplicateAsset({ ownerId, contentHash })
    if (duplicate) {
      const exists = await stat(assetPath(duplicate)).then(info => info.isFile(), () => false)
      if (exists) { await cleanup(); return { asset: duplicate, duplicate: true } }
      await repo.updateAssetState(duplicate.id, 'missing')
    }
    const storageKey = `${owner}/${id}`; const destination = join(config.uploadDirectory, owner, id); await mkdir(join(config.uploadDirectory, owner), { recursive: true }); await rename(temporary, destination)
    const now = new Date().toISOString(); const asset: AssetRecord = { id, ownerId, originalName, storageKey, mimeType: canonicalMime, sizeBytes, contentHash, state: 'available', createdAt: now, updatedAt: now }
    try { await repo.createAsset(asset) } catch (error) { try { await unlink(destination) } catch { /* cleanup best effort */ }; throw error }
    return { asset }
  } catch (error) { await cleanup(); throw error }
}
export const assetPath = (asset: AssetRecord): string => {
  const root = resolve(config.uploadDirectory)
  const target = resolve(root, asset.storageKey)
  const relativePath = relative(root, target)
  if (!relativePath || relativePath === '..' || relativePath.startsWith(`..${sep}`) || isAbsolute(relativePath)) {
    throw new Error('ASSET_STORAGE_PATH_INVALID')
  }
  return target
}
export async function reconcileUploads(repo: ServerRepository): Promise<void> {
  const assets = await repo.listAssets(); const known = new Set<string>()
  for (const asset of assets) { const path = assetPath(asset); known.add(path); try { await stat(path); if (asset.state === 'missing') await repo.updateAssetState(asset.id, 'available') } catch { if (asset.state === 'available') await repo.updateAssetState(asset.id, 'missing') } }
  let owners: string[]; try { owners = await readdir(config.uploadDirectory) } catch { return }
  for (const owner of owners) { if (owner.startsWith('.tmp-')) continue; let files: string[]; try { files = await readdir(join(config.uploadDirectory, owner)) } catch { continue }; for (const file of files) { const path = join(config.uploadDirectory, owner, file); if (!known.has(path)) { try { if ((await stat(path)).isFile()) await unlink(path) } catch { /* concurrent cleanup */ } } } }
}
