import electronic from '../../assets/profile/studio-electronic.png';
import acoustic from '../../assets/profile/studio-acoustic.png';
import vinyl from '../../assets/profile/studio-vinyl.png';
import type { ProfileCover } from '../domains/profile';

export const profileCovers: { id: ProfileCover; name: string; url: string }[] = [
  { id: '808', name: '808', url: electronic },
  { id: 'orchestra', name: 'Orchestra', url: acoustic },
  { id: 'lo-fi', name: 'Lo-fi', url: vinyl },
];

export const profileCoverUrl = (id: ProfileCover) => profileCovers.find(cover => cover.id === id)?.url || vinyl;
