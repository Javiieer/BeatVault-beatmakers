import type { PlanId } from '../server/plans'
import { DEFAULT_PLAN_STORAGE_BYTES, REFERENCE_MEDIA_BYTES } from '../src/domains/plans'

export const AUDIO_SIZE_MODEL = {
  beatBytes: REFERENCE_MEDIA_BYTES.threeMinuteWav,
  oneShotBytes: REFERENCE_MEDIA_BYTES.oneShot,
}

export const LOAD_BOT_COHORT: Record<PlanId, { users: number; beatsPerUser: number; oneShotsPerUser: number }> = {
  free: { users: 700, beatsPerUser: 1, oneShotsPerUser: 20 },
  creator: { users: 250, beatsPerUser: 8, oneShotsPerUser: 80 },
  studio: { users: 50, beatsPerUser: 24, oneShotsPerUser: 250 },
}

export type PlanLoadResult = {
  planId: PlanId
  users: number
  usedBytesPerUser: number
  quotaBytes: number
  fillPercent: number
  fits: boolean
  cohortBytes: number
  beatCapacityRange: readonly [number, number]
  oneShotCapacityRange: readonly [number, number]
}

export function simulatePlanLoad() {
  const plans = (Object.keys(LOAD_BOT_COHORT) as PlanId[]).map(planId => {
    const cohort = LOAD_BOT_COHORT[planId]
    const usedBytesPerUser = cohort.beatsPerUser * AUDIO_SIZE_MODEL.beatBytes + cohort.oneShotsPerUser * AUDIO_SIZE_MODEL.oneShotBytes
    const quotaBytes = DEFAULT_PLAN_STORAGE_BYTES[planId]
    return {
      planId,
      users: cohort.users,
      usedBytesPerUser,
      quotaBytes,
      fillPercent: usedBytesPerUser / quotaBytes * 100,
      fits: usedBytesPerUser <= quotaBytes,
      cohortBytes: usedBytesPerUser * cohort.users,
      beatCapacityRange: [Math.floor(quotaBytes / (44_100 * 6 * 300)), Math.floor(quotaBytes / (44_100 * 6 * 120))] as const,
      oneShotCapacityRange: [Math.floor(quotaBytes / (8 * 1024 ** 2)), Math.floor(quotaBytes / (1 * 1024 ** 2))] as const,
    } satisfies PlanLoadResult
  })
  return { users: plans.reduce((total, plan) => total + plan.users, 0), storedBytes: plans.reduce((total, plan) => total + plan.cohortBytes, 0), plans }
}

if (process.argv[1]?.replaceAll('\\', '/').endsWith('/scripts/plan-capacity-bots.ts')) {
  const result = simulatePlanLoad()
  console.log('BeatVault deterministic capacity bots (virtual users; no files written)')
  console.log(`Audio model: 3 min stereo 44.1kHz/24-bit WAV = ${(AUDIO_SIZE_MODEL.beatBytes / 1024 ** 2).toFixed(1)} MiB; one-shot average = 4 MiB`)
  for (const plan of result.plans) {
    const load = LOAD_BOT_COHORT[plan.planId]
    console.log(`${plan.planId}: ${plan.users} users x ${load.beatsPerUser} beats + ${load.oneShotsPerUser} one-shots = ${(plan.cohortBytes / 1024 ** 3).toFixed(2)} GiB; per-account quota ${(plan.quotaBytes / 1024 ** 3).toFixed(0)} GiB; ${plan.fillPercent.toFixed(2)}% used; ${plan.fits ? 'PASS' : 'OVER QUOTA'}`)
    console.log(`  Capacity range: ${plan.beatCapacityRange[0]}-${plan.beatCapacityRange[1]} WAV beats (5-2 min); ${plan.oneShotCapacityRange[0].toLocaleString()}-${plan.oneShotCapacityRange[1].toLocaleString()} one-shots (8-1 MiB).`)
  }
  console.log(`Total: ${result.users} virtual users; ${(result.storedBytes / 1024 ** 3).toFixed(2)} GiB original audio (previews, replication and backups excluded).`)
}
