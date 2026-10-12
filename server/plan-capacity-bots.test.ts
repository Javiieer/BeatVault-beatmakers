import { describe, expect, it } from 'vitest'
import { AUDIO_SIZE_MODEL, LOAD_BOT_COHORT, simulatePlanLoad } from '../scripts/plan-capacity-bots'

describe('deterministic package capacity bots', () => {
  it('calculates an uncompressed three-minute stereo WAV accurately', () => {
    expect(AUDIO_SIZE_MODEL.beatBytes).toBe(47_628_000)
  })

  it('simulates separate user cohorts and keeps every modeled account under quota', () => {
    const result = simulatePlanLoad()
    expect(result.users).toBe(1000)
    expect(result.plans.map(({ planId }) => planId)).toEqual(['free', 'creator', 'studio'])
    expect(result.plans.every(plan => plan.fits)).toBe(true)
    expect(result.plans.every(plan => plan.beatCapacityRange[0] < plan.beatCapacityRange[1] && plan.oneShotCapacityRange[0] < plan.oneShotCapacityRange[1])).toBe(true)
    expect(result.plans.every(plan => plan.cohortBytes === plan.usedBytesPerUser * LOAD_BOT_COHORT[plan.planId].users)).toBe(true)
    expect(result.storedBytes).toBe(result.plans.reduce((total, plan) => total + plan.cohortBytes, 0))
  })
})
