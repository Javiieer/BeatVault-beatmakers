import { describe, expect, it } from 'vitest';
import { creatorType, ownedUploads } from './creatorUploads';
import type { CatalogAsset } from './localCatalog';
import { readCatalog, writeCatalog } from './localCatalog';

const base: CatalogAsset = { id: 'one', name: 'One', type: 'beat', metadata: { duration: '--', size: '--', format: 'WAV' }, tags: [], color: '#000', favorite: false, waveform: [], publicationStatus: 'draft' };
describe('creator uploads', () => {
  it('never restores expired blob URLs after editing metadata', () => {
    writeCatalog([{ ...base, previewUrl: 'blob:expired', downloadUrl: 'blob:expired' }]);
    expect(readCatalog()[0].previewUrl).toBeUndefined();
    expect(readCatalog()[0].downloadUrl).toBeUndefined();
    localStorage.setItem('beatvault:local-catalog', JSON.stringify([{ ...base, previewUrl: 'blob:legacy' }]));
    expect(readCatalog()[0].previewUrl).toBeUndefined();
  });
  it('maps catalog samples to One-shot but does not reclassify loops or packs', () => {
    expect(creatorType('sample')).toBe('One-shot');
    expect(creatorType('Beat')).toBe('Beat');
    for (const type of ['Loop', 'Pack', 'MIDI', 'Vocal']) expect(creatorType(type)).toBeUndefined();
  });
  it('keeps discovery items and another creator out of My uploads', () => {
    const assets = [base, { ...base, id: 'mine', ownerId: 'a' }, { ...base, id: 'other', ownerId: 'b' }, { ...base, id: 'legacy', type: 'Loop' }];
    expect(ownedUploads(assets).map(asset => asset.id)).toEqual(['one']);
    expect(ownedUploads(assets, 'a').map(asset => asset.id)).toEqual(['mine']);
  });
});
