export const DEFAULT_PLAN_STORAGE_BYTES = {
  free: 5 * 1024 ** 3,
  creator: 50 * 1024 ** 3,
  studio: 250 * 1024 ** 3,
} as const

export const REFERENCE_MEDIA_BYTES = {
  threeMinuteWav: 44_100 * 6 * 180,
  oneShot: 4 * 1024 ** 2,
} as const

export function estimateStorageCapacity(limitBytes: number | null) {
  if (limitBytes === null) return undefined
  return {
    threeMinuteWavs: Math.floor(limitBytes / REFERENCE_MEDIA_BYTES.threeMinuteWav),
    oneShots: Math.floor(limitBytes / REFERENCE_MEDIA_BYTES.oneShot),
  }
}
