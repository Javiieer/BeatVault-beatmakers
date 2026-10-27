import { spawn } from 'node:child_process'
import { createReadStream } from 'node:fs'
import { mkdtemp, realpath, rm, stat } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { tmpdir } from 'node:os'
import { isAbsolute, join, relative, sep } from 'node:path'
import { config } from './config'
import { assetPath, hasAudioSignature } from './uploads'
import { isPurchaseEntitlement, type PurchaseEntitlement, type PurchaseFormat } from './purchase-entitlements'
import type { BeatOrder, ServerRepository } from './store'

const maxDerivativeBytes = 512 * 1024 * 1024
const maxConversionSeconds = 30 * 60
export type PurchaseFile = { path: string; name: string; mimeType: string; size: number; cleanup: () => Promise<void> }

function run(executable: string, args: string[], timeoutMs: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, { shell: false, windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] })
    let output = ''
    let timedOut = false
    const timer = setTimeout(() => { timedOut = true; child.kill('SIGKILL') }, timeoutMs)
    child.stdout?.on('data', chunk => { output = (output + chunk.toString()).slice(-4096) })
    child.once('error', error => { clearTimeout(timer); reject(error) })
    child.once('close', code => { clearTimeout(timer); if (code === 0 && !timedOut) resolve(output); else reject(new Error('PURCHASE_CONVERSION_FAILED')) })
  })
}

async function duration(path: string) {
  const output = await run(config.ffprobePath, ['-v', 'error', '-protocol_whitelist', 'file,pipe', '-show_entries', 'format=duration', '-of', 'json', path], 10000)
  const value = Number(JSON.parse(output).format?.duration)
  if (!Number.isFinite(value) || value <= 0) throw new Error('PURCHASE_DURATION_INVALID')
  return value
}

export async function verifyPurchaseAvailability(entitlement: PurchaseEntitlement, sellerId: string, repository: ServerRepository) {
  if (!isPurchaseEntitlement(entitlement)) throw new Error('PURCHASE_ENTITLEMENT_UNAVAILABLE')
  const asset = await repository.findAsset(entitlement.assetId, sellerId)
  if (!asset || asset.ownerId !== sellerId || asset.state !== 'available' || asset.contentHash !== entitlement.sourceHash ||
    asset.sizeBytes !== entitlement.sourceSizeBytes || asset.mimeType !== entitlement.sourceMimeType) throw new Error('PURCHASE_SOURCE_UNAVAILABLE')
  const source = await realpath(assetPath(asset))
  const root = await realpath(config.uploadDirectory)
  const within = relative(root, source)
  if (!within || isAbsolute(within) || within === '..' || within.startsWith(`..${sep}`)) throw new Error('PURCHASE_SOURCE_UNAVAILABLE')
  const sourceInfo = await stat(source)
  if (!sourceInfo.isFile() || sourceInfo.size !== entitlement.sourceSizeBytes) throw new Error('PURCHASE_SOURCE_UNAVAILABLE')
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(source)) hash.update(chunk)
  if (hash.digest('hex') !== entitlement.sourceHash) throw new Error('PURCHASE_SOURCE_UNAVAILABLE')
  const converts = entitlement.deliverables.some(format => asset.mimeType !== (format === 'mp3' ? 'audio/mpeg' : 'audio/wav'))
  const sourceDuration = converts ? await duration(source) : undefined
  if (sourceDuration !== undefined && sourceDuration > maxConversionSeconds) throw new Error('PURCHASE_CONVERSION_LIMIT')
  if (converts) await run(config.ffmpegPath, ['-version'], 5000)
  return { asset, source, sourceInfo, sourceDuration }
}

export async function preparePurchaseDownload(order: BeatOrder, repository: ServerRepository, format: PurchaseFormat): Promise<PurchaseFile> {
  const entitlement = order.fulfillment
  if (order.status !== 'paid' || !isPurchaseEntitlement(entitlement) || !entitlement.deliverables.includes(format)) throw new Error('PURCHASE_ENTITLEMENT_UNAVAILABLE')
  const { asset, source, sourceInfo, sourceDuration } = await verifyPurchaseAvailability(entitlement, order.sellerId, repository)
  const mimeType = format === 'mp3' ? 'audio/mpeg' : 'audio/wav'
  const safeName = Array.from(entitlement.sourceName.replace(/\.[^/.]+$/, ''), character => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127 || character === '/' || character === '\\' ? '_' : character).join('').slice(0, 180)
  const name = `${safeName || 'beat'}.${format}`
  if (asset.mimeType === mimeType) return { path: source, name, mimeType, size: sourceInfo.size, cleanup: async () => undefined }
  const directory = await mkdtemp(join(tmpdir(), 'beatvault-purchase-'))
  const destination = join(directory, `beat.${format}`)
  const cleanup = () => rm(directory, { recursive: true, force: true })
  try {
    await run(config.ffmpegPath, ['-nostdin', '-hide_banner', '-loglevel', 'error', '-y', '-protocol_whitelist', 'file,pipe', '-i', source,
      '-map', '0:a:0', '-vn', '-sn', '-dn', '-map_metadata', '-1', '-ac', '2', '-ar', '44100',
      '-c:a', format === 'mp3' ? 'libmp3lame' : 'pcm_s16le', ...(format === 'mp3' ? ['-b:a', '320k'] : []),
      '-fs', String(maxDerivativeBytes), '-f', format, destination], 120000)
    const outputInfo = await stat(destination)
    if (!outputInfo.isFile() || outputInfo.size < 16 || outputInfo.size >= maxDerivativeBytes ||
      !(await hasAudioSignature(destination, mimeType)) || sourceDuration === undefined || Math.abs(await duration(destination) - sourceDuration) > 0.25) throw new Error('PURCHASE_OUTPUT_INVALID')
    return { path: destination, name, mimeType, size: outputInfo.size, cleanup }
  } catch (error) { await cleanup(); throw error }
}
