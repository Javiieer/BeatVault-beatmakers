import type { EntityId, ISODateString } from "../core/types";
export type StorageProviderKind = "beatvault" | "mediafire" | "s3-compatible" | "other";
export type StorageSyncState = "indexed" | "queued" | "syncing" | "synced" | "missing" | "revoked" | "error";
export type StorageAssetKind = "audio" | "image" | "video" | "document";
export interface StorageProviderAccount { id: EntityId; ownerId: EntityId; kind: StorageProviderKind; displayName: string; connectedAt: ISODateString; syncState: StorageSyncState }
export interface FileReference { providerAccountId: EntityId; remoteId: string; path?: string; name: string; kind: StorageAssetKind; mimeType: string; sizeBytes: number; modifiedAt?: ISODateString }
export interface PreviewReference { url: string; expiresAt: ISODateString; mimeType: string; durationSeconds?: number }
export interface IndexedStorageAsset { id: EntityId; ownerId: EntityId; file: FileReference; preview?: PreviewReference; syncState: StorageSyncState }
export interface StorageProviderCapabilities { list: boolean; previews: boolean; downloads: boolean; folders: boolean }
export interface StorageProviderAdapter { readonly kind: StorageProviderKind; readonly capabilities: StorageProviderCapabilities }
