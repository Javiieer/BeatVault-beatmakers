import type { CatalogFilter, CatalogPage } from '../catalog/types'
import type { ContentItem, ContentType } from '../content/types'
import type { EntityId, ISODateString } from './types'

/** Stable envelope for future HTTP or desktop transport adapters. */
export interface ApiError {
  code: string
  message: string
  field?: string
  retryable?: boolean
}

export type ApiResult<T> =
  | { ok: true; data: T; requestId?: string }
  | { ok: false; error: ApiError; requestId?: string }

export interface PageRequest {
  cursor?: string
  limit?: number
}

export interface RequestContext {
  requestId: string
  actorId?: EntityId
  locale?: string
}

export type AuthProvider = 'password' | 'oauth'
export type AccountRole = 'creator' | 'admin'

export interface Account {
  id: EntityId
  email: string
  role: AccountRole
  creatorId?: EntityId
}

export interface AuthSession {
  account: Account
  accessToken: string
  expiresAt: ISODateString
}

export interface SignInInput {
  provider: AuthProvider
  email?: string
  credential?: string
  redirectUri?: string
}

export interface AuthService {
  getSession(context: RequestContext): Promise<ApiResult<AuthSession | null>>
  signIn(input: SignInInput, context: RequestContext): Promise<ApiResult<AuthSession>>
  signOut(session: AuthSession, context: RequestContext): Promise<ApiResult<void>>
}

export interface CatalogRepository {
  list(filter: CatalogFilter, page: PageRequest, context: RequestContext): Promise<ApiResult<CatalogPage>>
  getById(contentId: EntityId, context: RequestContext): Promise<ApiResult<ContentItem>>
}

export interface ProjectRecord {
  id: EntityId
  ownerId: EntityId
  title: string
  status: ProjectStatus
  updatedAt: ISODateString
}

export type ProjectStatus = 'draft' | 'working' | 'demo' | 'ready' | 'released'

export interface ProjectRepository {
  list(ownerId: EntityId, page: PageRequest, context: RequestContext): Promise<ApiResult<readonly ProjectRecord[]>>
  create(input: CreateProjectInput, context: RequestContext): Promise<ApiResult<ProjectRecord>>
}

export interface CreateProjectInput {
  ownerId: EntityId
  title: string
  contentType?: ContentType
}

export type MediaKind = 'audio' | 'image' | 'video'

export interface MediaUploadIntent {
  mediaId: EntityId
  kind: MediaKind
  objectKey: string
  uploadUrl: string
  expiresAt: ISODateString
}

export interface MediaObject {
  mediaId: EntityId
  kind: MediaKind
  objectKey: string
  mimeType: string
  sizeBytes: number
}

export interface MediaStorage {
  createUploadIntent(
    input: { ownerId: EntityId; kind: MediaKind; mimeType: string; sizeBytes: number },
    context: RequestContext,
  ): Promise<ApiResult<MediaUploadIntent>>
  completeUpload(mediaId: EntityId, context: RequestContext): Promise<ApiResult<MediaObject>>
}

export interface BackendServices {
  auth: AuthService
  catalog: CatalogRepository
  projects: ProjectRepository
  media: MediaStorage
}

// Browser-local repositories remain the active implementation during the alpha.
