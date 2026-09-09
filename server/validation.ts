import type { CreateProjectInput, ProjectStatus, ProjectRecord } from '../src/domains/core/contracts'
import type { CatalogEntry } from '../src/domains/catalog/types'
import type { ContentType, PublicationStatus } from '../src/domains/content/types'

const contentTypes: ContentType[] = ['sample', 'beat', 'loop', 'vocal', 'midi', 'preset', 'pack', 'stem', 'template']
const statuses: ProjectStatus[] = ['draft', 'working', 'demo', 'ready', 'released']
const publicationStatuses: PublicationStatus[] = ['draft', 'pending-review', 'published', 'rejected', 'archived']

export class ValidationError extends Error { constructor(public readonly field: string, message: string) { super(message) } }

export function validateCreateProject(value: unknown): CreateProjectInput {
  if (!value || typeof value !== 'object') throw new ValidationError('body', 'El cuerpo debe ser un objeto JSON.')
  const body = value as Record<string, unknown>
  if (typeof body.title !== 'string' || body.title.trim().length < 1 || body.title.length > 160) throw new ValidationError('title', 'title debe tener entre 1 y 160 caracteres.')
  if (body.contentType !== undefined && (typeof body.contentType !== 'string' || !contentTypes.includes(body.contentType as ContentType))) throw new ValidationError('contentType', 'contentType no es válido.')
  return { ownerId: '', title: body.title.trim(), contentType: body.contentType as ContentType | undefined }
}

export function validateProjectId(value: string | undefined): string {
  if (!value || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) throw new ValidationError('id', 'id debe ser un UUID válido.')
  return value
}

export function validateUpdateProject(value: unknown): Pick<ProjectRecord, 'title' | 'status'> {
  if (!value || typeof value !== 'object') throw new ValidationError('body', 'El cuerpo debe ser un objeto JSON.')
  const body = value as Record<string, unknown>
  if (typeof body.title !== 'string' || body.title.trim().length < 1 || body.title.length > 160) throw new ValidationError('title', 'title debe tener entre 1 y 160 caracteres.')
  if (typeof body.status !== 'string' || !statuses.includes(body.status as ProjectStatus)) throw new ValidationError('status', 'status no es válido.')
  if ('ownerId' in body) throw new ValidationError('ownerId', 'ownerId no puede modificarse.')
  return { title: body.title.trim(), status: body.status as ProjectStatus }
}

export function validateProjectRecord(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false
  const item = value as Record<string, unknown>
  return typeof item.id === 'string' && typeof item.ownerId === 'string' && typeof item.title === 'string' && statuses.includes(item.status as ProjectStatus) && typeof item.updatedAt === 'string'
}

export function validateCatalogEntry(value: unknown): value is CatalogEntry {
  if (!value || typeof value !== 'object') return false
  const item = value as Record<string, unknown>
  return typeof item.contentId === 'string' && typeof item.title === 'string' && typeof item.creatorId === 'string' && typeof item.type === 'string' && contentTypes.includes(item.type as ContentType) && Array.isArray(item.tagIds) && item.tagIds.every(tag => typeof tag === 'string') && Array.isArray(item.previewIds) && publicationStatuses.includes(item.publicationStatus as PublicationStatus)
}

function toContentType(value: unknown): ContentType {
  if (typeof value !== 'string' || !value.trim()) throw new ValidationError('type', 'type no es válido.')
  const normalized = value.trim().toLowerCase()
  if (contentTypes.includes(normalized as ContentType)) return normalized as ContentType
  if (['808', 'one-shot', 'oneshot', 'fx'].includes(normalized)) return 'sample'
  throw new ValidationError('type', 'type no es válido.')
}

export function validateCreateCatalog(value: unknown): Pick<CatalogEntry, 'title' | 'type' | 'tagIds' | 'publicationStatus'> {
  if (!value || typeof value !== 'object') throw new ValidationError('body', 'El cuerpo debe ser un objeto JSON.')
  const body = value as Record<string, unknown>
  if (typeof body.title !== 'string' || body.title.trim().length < 1 || body.title.length > 160) throw new ValidationError('title', 'title debe tener entre 1 y 160 caracteres.')
  if ('creatorId' in body || 'ownerId' in body) throw new ValidationError('ownerId', 'ownerId no puede enviarse desde el cliente.')
  const tagIds = Array.isArray(body.tagIds) ? body.tagIds.filter((tag): tag is string => typeof tag === 'string' && tag.trim().length > 0).map(tag => tag.trim()).slice(0, 24) : []
  const publicationStatus = typeof body.publicationStatus === 'string' && publicationStatuses.includes(body.publicationStatus as PublicationStatus) ? body.publicationStatus as PublicationStatus : 'pending-review'
  return { title: body.title.trim(), type: toContentType(body.type), tagIds, publicationStatus }
}

export function validateUpdateCatalog(value: unknown): Pick<CatalogEntry, 'title' | 'type' | 'tagIds' | 'publicationStatus'> {
  return validateCreateCatalog(value)
}

export function validateCatalogId(value: string | undefined): string {
  return validateProjectId(value)
}
