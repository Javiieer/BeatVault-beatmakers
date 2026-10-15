import { unlink } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
import { config } from '../server/config'
import { artworkExists, artworkPath, persistArtworkThumbnail, type ArtworkRecord } from '../server/artwork'
import { createRepository } from '../server/repository'
import { getEffectiveStorageLimit, getPlanCatalog } from '../server/plans'
import type { ServerRepository } from '../server/store'

type BackfillOptions = { apply: boolean; ownerId?: string }

export async function backfillArtworkThumbnails(repo: ServerRepository, options: BackfillOptions) {
  const records = (await repo.listCatalogArtwork()).filter(record => !options.ownerId || record.ownerId === options.ownerId)
  const summary = { scanned: records.length, alreadyOptimized: 0, missingOriginal: 0, candidates: 0, created: 0, skipped: 0 }

  for (const record of records) {
    if (record.thumbnailStorageKey && record.thumbnailSizeBytes) {
      summary.alreadyOptimized += 1
      continue
    }
    if (!(await artworkExists(record.storageKey))) {
      summary.missingOriginal += 1
      continue
    }
    summary.candidates += 1
    if (!options.apply) continue

    const generated = await persistArtworkThumbnail(record.storageKey)
    const thumbnail = generated.thumbnail
    if (!generated.decoded || !thumbnail?.thumbnailStorageKey || !thumbnail.thumbnailSizeBytes) {
      summary.skipped += 1
      continue
    }
    const updated: ArtworkRecord = { ...record, ...thumbnail, updatedAt: new Date().toISOString() }
    try {
      const account = await repo.findAccountById(record.ownerId)
      const accountLimit = await repo.getStorageQuota(record.ownerId)
      const planLimit = getPlanCatalog(config).find(plan => plan.id === (account?.planId || 'free'))?.storageLimitBytes
      const limitBytes = getEffectiveStorageLimit({ accountLimit, planLimit, serverLimit: config.storageQuotaBytes }).limitBytes ?? undefined
      await repo.saveCatalogArtwork(updated, limitBytes)
      summary.created += 1
    } catch (error) {
      const thumbnailPath = artworkPath(config.uploadDirectory, thumbnail.thumbnailStorageKey)
      await unlink(thumbnailPath).catch(() => undefined)
      if (error instanceof Error && error.message === 'STORAGE_QUOTA_EXCEEDED') {
        summary.skipped += 1
        continue
      }
      throw error
    }
  }
  return summary
}

function parseOptions(args: string[]): BackfillOptions {
  const apply = args.includes('--apply')
  if (args.includes('--apply') && args.includes('--dry-run')) throw new Error('Usa --apply o --dry-run, no ambos.')
  const ownerIndex = args.indexOf('--owner')
  const ownerId = ownerIndex >= 0 ? args[ownerIndex + 1] : undefined
  if (ownerIndex >= 0 && (!ownerId || ownerId.startsWith('--') || ownerId.length > 100)) throw new Error('Indica un ID de cuenta válido después de --owner.')
  const unknown = args.filter((arg, index) => !['--apply', '--dry-run', '--owner'].includes(arg) && !(ownerIndex >= 0 && index === ownerIndex + 1))
  if (unknown.length) throw new Error(`Argumento no reconocido: ${unknown[0]}`)
  return { apply, ...(ownerId ? { ownerId } : {}) }
}

async function main() {
  const options = parseOptions(process.argv.slice(2))
  const runtime = createRepository()
  try {
    const result = await backfillArtworkThumbnails(runtime.repository, options)
    console.log(`${options.apply ? 'Aplicación' : 'Dry run'} completado: ${JSON.stringify(result)}`)
    if (!options.apply) console.log('No se modificó ningún archivo. Usa --apply después de respaldar datos y uploads para generar miniaturas.')
  } finally {
    await runtime.close()
  }
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  main().catch(error => {
    console.error(error instanceof Error ? error.message : 'Falló el backfill de artwork.')
    process.exitCode = 1
  })
}
