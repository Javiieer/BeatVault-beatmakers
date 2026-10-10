import type { CatalogAsset } from './localCatalog';
import hard808sCover from '../../assets/demo/hard-808s.png';
import orchestraCover from '../../assets/demo/dark-orchestra.png';
import loFiCover from '../../assets/demo/chill-lo-fi.png';

export const creatorTypes = ['Beat', 'One-shot'] as const;
export type CreatorType = typeof creatorTypes[number];
export function creatorType(value: string): CreatorType | undefined {
  if (value.toLowerCase() === 'beat') return 'Beat';
  if (['one-shot', 'oneshot', 'sample'].includes(value.toLowerCase())) return 'One-shot';
  return undefined;
}
export function ownedUploads(assets: CatalogAsset[], ownerId?: string) {
  return assets.filter(asset => creatorType(asset.type) && asset.ownerId === ownerId);
}
export const uploadCovers = [
  { id: '808', name: '808', url: hard808sCover },
  { id: 'orchestra', name: 'Orchestra', url: orchestraCover },
  { id: 'lo-fi', name: 'Lo-fi', url: loFiCover },
] as const;
export const uploadStatusLabels = { draft: 'Borrador', 'pending-review': 'En revisión', published: 'Publicado', rejected: 'Rechazado', archived: 'Archivado' } as const;
