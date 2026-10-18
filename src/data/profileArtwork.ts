import electronic from '../../assets/profile/studio-electronic.webp';
import acoustic from '../../assets/profile/studio-acoustic.webp';
import vinyl from '../../assets/profile/studio-vinyl.webp';
import type { ProfileCover } from '../domains/profile';

export const profileCovers: { id: ProfileCover; name: string; url: string }[] = [
  { id: '808', name: '808', url: electronic },
  { id: 'orchestra', name: 'Orchestra', url: acoustic },
  { id: 'lo-fi', name: 'Lo-fi', url: vinyl },
];

export const profileCoverUrl = (id: ProfileCover) => profileCovers.find(cover => cover.id === id)?.url || vinyl;
