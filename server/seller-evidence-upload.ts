import Busboy from 'busboy'
import { createWriteStream } from 'node:fs'
import { mkdir, rename, unlink } from 'node:fs/promises'
import { createHash, randomUUID } from 'node:crypto'
import { basename, isAbsolute, join, relative, resolve, sep } from 'node:path'
import type { IncomingMessage } from 'node:http'
import { config } from './config'
import { sellerEvidenceMaxBytes, type SellerEvidenceRecord } from '../src/domains/marketplace/sellerEvidence'

const safeName = (value: string) => basename(value.replace(/[\\/\0\r\n]/g, '_')).replace(/[<>:"|?*]/g, '_').slice(0, 180) || 'evidence'
const signatureMime = (data: Buffer): SellerEvidenceRecord['mimeType'] | undefined => {
  if (data.subarray(0, 5).toString('ascii') === '%PDF-') return 'application/pdf'
  if (data.length >= 8 && data.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return 'image/png'
  if (data.length >= 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) return 'image/jpeg'
}

export const sellerEvidencePath = (record: Pick<SellerEvidenceRecord, 'storageKey'>) => {
  const root = resolve(config.uploadDirectory)
  const target = resolve(root, record.storageKey)
  const relativePath = relative(root, target)
  if (!relativePath || relativePath === '..' || relativePath.startsWith(`..${sep}`) || isAbsolute(relativePath)) throw new Error('EVIDENCE_STORAGE_PATH_INVALID')
  return target
}

export async function receiveSellerEvidence(req: IncomingMessage, contentId: string, ownerId: string): Promise<SellerEvidenceRecord> {
  if (req.headers['content-type']?.split(';')[0] !== 'multipart/form-data') throw new Error('EVIDENCE_CONTENT_TYPE')
  const maxRequest = sellerEvidenceMaxBytes + 64 * 1024
  if (Number(req.headers['content-length'] || 0) > maxRequest) throw new Error('EVIDENCE_TOO_LARGE')
  const id = randomUUID()
  const owner = ownerId.replace(/[^a-zA-Z0-9_-]/g, '_')
  const storageKey = `private-marketplace-evidence/${owner}/${id}`
  const destination = sellerEvidencePath({ storageKey })
  const temporary = join(config.uploadDirectory, `.evidence-${id}.tmp`)
  await mkdir(config.uploadDirectory, { recursive: true })
  let filename = ''
  let declaredMime = ''
  let sizeBytes = 0
  let seen = false
  try {
    await new Promise<void>((resolvePromise, reject) => {
      const parser = Busboy({ headers: req.headers, limits: { fileSize: sellerEvidenceMaxBytes, files: 1, fields: 0, parts: 2 } })
      let output: ReturnType<typeof createWriteStream> | undefined
      let settled = false
      const finish = (error?: Error) => {
        if (settled) return
        settled = true
        if (error && output && !output.closed) { output.destroy(); output.once('close', () => reject(error)); return }
        if (error) reject(error)
        else resolvePromise()
      }
      parser.on('file', (field, stream, info) => {
        if (seen || field !== 'file') { stream.resume(); finish(new Error('EVIDENCE_FILE_REQUIRED')); return }
        seen = true
        filename = safeName(typeof info.filename === 'string' ? info.filename : '')
        declaredMime = typeof info.mimeType === 'string' ? info.mimeType.toLowerCase() : ''
        output = createWriteStream(temporary, { flags: 'wx' })
        stream.on('data', chunk => { sizeBytes += Buffer.byteLength(chunk) }).on('limit', () => finish(new Error('EVIDENCE_TOO_LARGE'))).on('error', error => finish(error))
        output.on('error', error => finish(error))
        stream.pipe(output)
      })
      parser.on('field', () => finish(new Error('EVIDENCE_INVALID_MULTIPART')))
        .on('filesLimit', () => finish(new Error('EVIDENCE_LIMIT'))).on('fieldsLimit', () => finish(new Error('EVIDENCE_INVALID_MULTIPART')))
        .on('partsLimit', () => finish(new Error('EVIDENCE_LIMIT'))).on('error', error => finish(error instanceof Error ? error : new Error('EVIDENCE_PARSE_FAILED')))
        .on('finish', () => { if (!seen || !output) { finish(new Error('EVIDENCE_FILE_REQUIRED')); return }; output.once('close', () => finish()) })
      let bytes = 0
      req.on('data', chunk => { bytes += chunk.length; if (bytes > maxRequest) { req.unpipe(parser); parser.destroy(); req.resume(); finish(new Error('EVIDENCE_TOO_LARGE')) } })
        .on('aborted', () => finish(new Error('EVIDENCE_ABORTED'))).on('error', error => finish(error)).pipe(parser)
    })
    if (!sizeBytes) throw new Error('EVIDENCE_EMPTY')
    const chunks: Buffer[] = []
    const { readFile } = await import('node:fs/promises')
    const file = await readFile(temporary)
    chunks.push(file.subarray(0, 16))
    const actualMime = signatureMime(Buffer.concat(chunks))
    if (!actualMime || (declaredMime !== actualMime && declaredMime !== 'application/octet-stream')) throw new Error('EVIDENCE_SIGNATURE')
    const contentHash = createHash('sha256').update(file).digest('hex')
    await mkdir(resolve(destination, '..'), { recursive: true })
    await rename(temporary, destination)
    return { id, contentId, ownerId, originalName: filename, mimeType: actualMime, sizeBytes, storageKey, contentHash, createdAt: new Date().toISOString() }
  } catch (error) {
    await unlink(temporary).catch(() => undefined)
    throw error
  }
}

export const removeSellerEvidenceFile = async (record: SellerEvidenceRecord) => unlink(sellerEvidencePath(record)).catch(() => undefined)
