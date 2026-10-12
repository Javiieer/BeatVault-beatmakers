import { spawn } from 'node:child_process'
import { createReadStream } from 'node:fs'
import { mkdir, rename, stat, unlink } from 'node:fs/promises'
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path'
import { randomUUID } from 'node:crypto'
import { config } from './config'

const maxPreviewBytes = 4 * 1024 * 1024

export const previewStorageKey = (ownerId: string, assetId: string) => `${ownerId}/${assetId}.preview.m4a`

export const previewArtifactPath = (uploadDirectory: string, storageKey: string) => {
  const root = resolve(uploadDirectory)
  const target = resolve(root, storageKey)
  const path = relative(root, target)
  if (!path || path === '..' || path.startsWith(`..${sep}`) || isAbsolute(path)) throw new Error('PREVIEW_STORAGE_PATH_INVALID')
  return target
}

function runFfmpeg(source: string, destination: string): Promise<void> {
  const args = [
    '-nostdin', '-hide_banner', '-loglevel', 'error', '-y', '-i', source,
    '-map', '0:a:0', '-vn', '-sn', '-dn', '-map_metadata', '-1',
    '-t', String(config.previewDurationSeconds), '-ac', '2', '-ar', '44100',
    '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart', '-fs', String(maxPreviewBytes), '-f', 'ipod', destination,
  ]
  return new Promise((resolvePromise, reject) => {
    const child = spawn(config.ffmpegPath, args, { shell: false, windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] })
    let stderr = ''
    const timeout = setTimeout(() => { child.kill('SIGKILL'); reject(new Error('PREVIEW_PROCESS_TIMEOUT')) }, 60000)
    child.stderr?.on('data', chunk => { stderr = (stderr + chunk.toString()).slice(-1000) })
    child.once('error', error => { clearTimeout(timeout); reject(error) })
    child.once('close', code => {
      clearTimeout(timeout)
      if (code === 0) resolvePromise()
      else reject(new Error(code === null ? 'PREVIEW_PROCESS_FAILED' : `PREVIEW_PROCESS_FAILED:${stderr}`))
    })
  })
}

export type ProcessedPreview = { storageKey: string; mimeType: 'audio/mp4'; sizeBytes: number }
export type PreviewRunner = (source: string, destination: string) => Promise<void>

export async function createProcessedPreview(source: string, destination: string, storageKey: string, runner: PreviewRunner = runFfmpeg): Promise<ProcessedPreview | undefined> {
  const temporary = resolve(dirname(destination), `.tmp-preview-${randomUUID()}.m4a`)
  await mkdir(dirname(destination), { recursive: true })
  try {
    await runner(source, temporary)
    const info = await stat(temporary)
    if (!info.isFile() || info.size < 16 || info.size > maxPreviewBytes) throw new Error('PREVIEW_OUTPUT_INVALID')
    const signature = await new Promise<Buffer>((resolvePromise, reject) => {
      const chunks: Buffer[] = []
      createReadStream(temporary, { start: 0, end: 11 }).on('data', chunk => chunks.push(Buffer.from(chunk))).on('error', reject).on('end', () => resolvePromise(Buffer.concat(chunks)))
    })
    if (signature.toString('ascii', 4, 8) !== 'ftyp') throw new Error('PREVIEW_OUTPUT_INVALID')
    await unlink(destination).catch(() => undefined)
    await rename(temporary, destination)
    return { storageKey, mimeType: 'audio/mp4', sizeBytes: info.size }
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('PREVIEW_PROCESS_FAILED:')) console.warn('Audio preview transcoding failed; original remains private.')
    return undefined
  } finally {
    await unlink(temporary).catch(() => undefined)
  }
}
