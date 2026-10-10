import { PassThrough } from 'node:stream'
import type { IncomingMessage } from 'node:http'
import { describe, expect, it } from 'vitest'
import { assetPath, receiveUpload } from './uploads'
import { LocalRepository } from './store'
import { randomUUID } from 'node:crypto'

const requestFor = async (file: Blob, name: string): Promise<IncomingMessage> => {
  const boundary = 'test-boundary'; const content = Buffer.from(await file.arrayBuffer()); const body = Buffer.concat([Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${name}"\r\nContent-Type: ${file.type}\r\n\r\n`), content, Buffer.from(`\r\n--${boundary}--\r\n`)]);
  const stream = new PassThrough() as unknown as IncomingMessage
  Object.defineProperty(stream, 'headers', { value: { 'content-type': `multipart/form-data; boundary=${boundary}`, 'content-length': String(body.length) }, configurable: true })
  Object.defineProperty(stream, 'headersDistinct', { value: {}, configurable: true })
  process.nextTick(() => (stream as unknown as PassThrough).end(body))
  return stream
}

describe('persistent upload receiver', () => {
  it('rejects a forged signature and hashes valid content for same-owner duplicates', async () => {
    const repo = new LocalRepository(); const owner = `test-owner-${randomUUID()}`; const forged = await requestFor(new Blob([Buffer.from('not wav')], { type: 'audio/wav' }), 'sample.wav')
    await expect(receiveUpload(forged, owner, repo)).rejects.toThrow('UPLOAD_SIGNATURE')
    const wav = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WAVE'), Buffer.from('data')])
    const request = await requestFor(new Blob([wav], { type: 'audio/wav' }), 'sample.wav'); const result = await receiveUpload(request, owner, repo); expect(assetPath(result.asset)).toContain('uploads'); expect(result.asset.contentHash).toHaveLength(64)
    expect(() => assetPath({ ...result.asset, storageKey: '../../outside.wav' })).toThrow('ASSET_STORAGE_PATH_INVALID')
    const duplicate = await requestFor(new Blob([wav], { type: 'audio/wav' }), 'renamed.wav'); await expect(receiveUpload(duplicate, owner, repo)).resolves.toEqual({ asset: result.asset, duplicate: true })
  })
})
