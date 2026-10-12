import type { ServerConfig } from './config'
import { DEFAULT_PLAN_STORAGE_BYTES } from '../src/domains/plans'

export const planIds = ['free', 'creator', 'studio'] as const
export type PlanId = typeof planIds[number]
export type PlanDefinition = {
  id: PlanId
  name: string
  description: string
  storageLimitBytes: number | null
}

export function isPlanId(value: unknown): value is PlanId {
  return typeof value === 'string' && planIds.includes(value as PlanId)
}

export function getPlanCatalog(config: ServerConfig): PlanDefinition[] {
  return [
    { id: 'free', name: 'Free', description: 'Acceso inicial a BeatVault.', storageLimitBytes: config.planStorageBytes.free ?? DEFAULT_PLAN_STORAGE_BYTES.free },
    { id: 'creator', name: 'Creator', description: 'Herramientas para un creador independiente.', storageLimitBytes: config.planStorageBytes.creator ?? DEFAULT_PLAN_STORAGE_BYTES.creator },
    { id: 'studio', name: 'Studio', description: 'Capacidades para un espacio de producción.', storageLimitBytes: config.planStorageBytes.studio ?? DEFAULT_PLAN_STORAGE_BYTES.studio },
  ]
}

export function getEffectiveStorageLimit(input: {
  accountLimit?: number
  planLimit?: number | null
  serverLimit?: number
}): { limitBytes: number | null; source: 'account' | 'plan' | 'server' | 'none' } {
  if (input.accountLimit !== undefined) return { limitBytes: input.accountLimit, source: 'account' }
  if (input.planLimit !== undefined && input.planLimit !== null) return { limitBytes: input.planLimit, source: 'plan' }
  if (input.serverLimit !== undefined) return { limitBytes: input.serverLimit, source: 'server' }
  return { limitBytes: null, source: 'none' }
}
