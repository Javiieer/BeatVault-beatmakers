import type { CreateProjectInput, ProjectStatus, ProjectRecord } from '../src/domains/core/contracts'
import type { CatalogEntry, CatalogInput } from '../src/domains/catalog/types'
import type { ContentType, PublicationStatus } from '../src/domains/content/types'
import { isBeatListingInput, type BeatListingInput } from '../src/domains/marketplace/sellerListings'

const contentTypes: ContentType[] = ['sample', 'beat', 'loop', 'vocal', 'midi', 'preset', 'pack', 'stem', 'template']
const statuses: ProjectStatus[] = ['draft', 'working', 'demo', 'ready', 'released']
const publicationStatuses: PublicationStatus[] = ['draft', 'pending-review', 'published', 'rejected', 'archived']

export class ValidationError extends Error { constructor(public readonly field: string, message: string) { super(message) } }
export function validateRegister(value: unknown): { email: string; password: string } { if (!value || typeof value !== 'object') throw new ValidationError('body', 'El cuerpo debe ser un objeto JSON.'); const body = value as Record<string, unknown>; if (typeof body.email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email.trim()) || body.email.trim().length > 254) throw new ValidationError('email', 'Introduce un email válido.'); if (typeof body.password !== 'string' || body.password.length < 12 || body.password.length > 128) throw new ValidationError('password', 'La contraseña debe tener entre 12 y 128 caracteres.'); if ('role' in body || 'ownerId' in body) throw new ValidationError('role', 'Los datos de autorización no pueden enviarse.'); return { email: body.email.trim().toLowerCase(), password: body.password } }
export function validateEmail(value: unknown): string { if (!value || typeof value !== 'object' || typeof (value as Record<string, unknown>).email !== 'string') throw new ValidationError('email', 'Introduce un email válido.'); return ((value as Record<string, unknown>).email as string).trim().toLowerCase() }
export function validateTokenPassword(value: unknown): { token: string; password: string } { if (!value || typeof value !== 'object') throw new ValidationError('body', 'Cuerpo inválido.'); const body = value as Record<string, unknown>; if (typeof body.token !== 'string' || body.token.length < 20) throw new ValidationError('token', 'Token inválido.'); if (typeof body.password !== 'string' || body.password.length < 12 || body.password.length > 128) throw new ValidationError('password', 'La contraseña debe tener entre 12 y 128 caracteres.'); return { token: body.token, password: body.password } }
export function validateToken(value: unknown): string { if (!value || typeof value !== 'object' || typeof (value as Record<string, unknown>).token !== 'string') throw new ValidationError('token', 'Token inválido.'); const token = (value as Record<string, unknown>).token as string; if (token.length < 20) throw new ValidationError('token', 'Token inválido.'); return token }

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
  return typeof item.contentId === 'string' && typeof item.title === 'string' && typeof item.creatorId === 'string' && typeof item.type === 'string' && contentTypes.includes(item.type as ContentType) && Array.isArray(item.tagIds) && item.tagIds.every(tag => typeof tag === 'string') && Array.isArray(item.previewIds) && publicationStatuses.includes(item.publicationStatus as PublicationStatus) && (item.reviewNote === undefined || typeof item.reviewNote === 'string' && item.reviewNote.length <= 160)
}

function toContentType(value: unknown): ContentType {
  if (typeof value !== 'string' || !value.trim()) throw new ValidationError('type', 'type no es válido.')
  const normalized = value.trim().toLowerCase()
  if (contentTypes.includes(normalized as ContentType)) return normalized as ContentType
  if (['808', 'one-shot', 'oneshot', 'fx'].includes(normalized)) return 'sample'
  throw new ValidationError('type', 'type no es válido.')
}

function validateCatalogInput(value: unknown): CatalogInput {
  if (!value || typeof value !== 'object') throw new ValidationError('body', 'El cuerpo debe ser un objeto JSON.')
  const body = value as Record<string, unknown>
  if (typeof body.title !== 'string' || body.title.trim().length < 1 || body.title.length > 160) throw new ValidationError('title', 'title debe tener entre 1 y 160 caracteres.')
  if ('creatorId' in body || 'ownerId' in body) throw new ValidationError('ownerId', 'ownerId no puede enviarse desde el cliente.')
  const tagIds = Array.isArray(body.tagIds) ? body.tagIds.filter((tag): tag is string => typeof tag === 'string' && tag.trim().length > 0).map(tag => tag.trim()).slice(0, 24) : []
  const publicationStatus = typeof body.publicationStatus === 'string' && publicationStatuses.includes(body.publicationStatus as PublicationStatus) ? body.publicationStatus as PublicationStatus : 'pending-review'
  const input: CatalogInput = { title: body.title.trim(), type: toContentType(body.type), tagIds, publicationStatus }
  if (body.assetId !== undefined) {
    if (typeof body.assetId !== 'string') throw new ValidationError('assetId', 'Audio no valido.')
    input.assetId = validateCatalogId(body.assetId)
  }
  if (body.coverId !== undefined) {
    if (!['808', 'orchestra', 'lo-fi'].includes(body.coverId as string)) throw new ValidationError('coverId', 'Portada no valida.')
    input.coverId = body.coverId as CatalogInput['coverId']
  }
  return input
}

export function validateCreateCatalog(value: unknown): CatalogInput {
  const input = validateCatalogInput(value)
  if (input.type !== 'beat' && input.type !== 'sample') throw new ValidationError('type', 'Solo se admiten Beats y One-shots.')
  return input
}

export function validateUpdateCatalog(value: unknown): CatalogInput {
  return validateCatalogInput(value)
}

export function validateCatalogId(value: string | undefined): string {
  return validateProjectId(value)
}

export function validateBeatListingInput(value: unknown): BeatListingInput {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ValidationError('body', 'El formulario debe ser un objeto.')
  const body = value as Record<string, unknown>
  if ('ownerId' in body || 'contentId' in body || 'status' in body || 'createdAt' in body || 'updatedAt' in body) throw new ValidationError('ownerId', 'Los datos del servidor no pueden enviarse desde el formulario.')
  if (!body.rights || typeof body.rights !== 'object' || Array.isArray(body.rights) || !Array.isArray(body.offers)) throw new ValidationError('body', 'Completa los datos de derechos y ofertas.')
  const rights = body.rights as Record<string, unknown>
  const collaborators = Array.isArray(rights.collaborators) ? rights.collaborators.map(value => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ValidationError('collaborators', 'Revisa los créditos de colaboradores.')
    const item = value as Record<string, unknown>
    return { name: item.name, role: item.role, compositionShareBps: item.compositionShareBps, masterShareBps: item.masterShareBps }
  }) : rights.collaborators
  const offers = body.offers.map(value => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ValidationError('offers', 'Revisa las ofertas preliminares.')
    const item = value as Record<string, unknown>
    return { id: item.id, label: item.label, amountMinor: item.amountMinor, currency: item.currency, deliverables: item.deliverables, usageSummary: item.usageSummary, termsVersion: item.termsVersion, status: item.status }
  })
  const input = {
    description: typeof body.description === 'string' ? body.description.trim() : body.description,
    genre: typeof body.genre === 'string' ? body.genre.trim() : body.genre,
    ...(body.bpm === undefined ? {} : { bpm: body.bpm }),
    ...(body.musicalKey === undefined ? {} : { musicalKey: body.musicalKey }),
    explicitContent: body.explicitContent,
    rights: {
      sellerCompositionShareBps: rights.sellerCompositionShareBps,
      sellerMasterShareBps: rights.sellerMasterShareBps,
      sampleDisclosure: rights.sampleDisclosure,
      ...(rights.sampleSource === undefined ? {} : { sampleSource: typeof rights.sampleSource === 'string' ? rights.sampleSource.trim() : rights.sampleSource }),
      sampleProofAvailable: rights.sampleProofAvailable,
      collaborators,
      declarationAccepted: rights.declarationAccepted,
    },
    offers,
  }
  if (!isBeatListingInput(input)) throw new ValidationError('listing', 'Revisa los campos, porcentajes individuales, créditos, samples y formatos de las ofertas preliminares.')
  return input
}
