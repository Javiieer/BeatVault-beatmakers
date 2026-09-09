export type ProjectStatus = 'Draft' | 'Working' | 'Demo' | 'Ready' | 'Released'
export interface Tag { label: string; tone?: 'cyan' | 'violet' | 'muted' }
export interface AudioMetadata { bpm?: number; key?: string; duration: string; size: string; format: string }
export type LocalAssetAvailability = "session-preview" | "metadata-only" | "preview-unavailable" | "rejected" | "missing";
export type CatalogProductType = "beat" | "sound-pack" | "sound";
export type CatalogAccessState = "preview-only" | "included-demo" | "owned-metadata-only" | "unavailable";
export interface BundleContent { name: string; type: "kick" | "snare" | "hat" | "808" | "tom" | "other" }
export interface AudioAsset { id: string; name: string; type: string; productType?: CatalogProductType; metadata: AudioMetadata; tags: Tag[]; color: string; favorite: boolean; waveform: number[]; cover?: string; previewUrl?: string; downloadUrl?: string; label?: string; collection?: string; licenseLabel?: string; localAvailability?: LocalAssetAvailability; accessState?: CatalogAccessState; archiveFormat?: "ZIP" | "RAR"; contents?: BundleContent[] }
export interface Project { id: string; name: string; genre: string; bpm: number; key: string; modified: string; status: ProjectStatus; color: string; tracks: number; cover?: string }
export interface Stat { label: string; value: string; change: string }
