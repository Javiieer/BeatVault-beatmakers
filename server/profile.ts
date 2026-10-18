import { isProfileImageFocalPoint, profileCoverIds, type ProfileImageFocalPoint, type ProfileInput } from '../src/domains/profile';
import { ValidationError } from './validation';

export function validateProfile(value: unknown): ProfileInput {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ValidationError('body', 'Perfil no valido.');
  const p = value as Record<string, unknown>;
  const keys = ['displayName', 'bio', 'location', 'website', 'instagram', 'genres', 'coverId', 'avatarId', 'avatarFocalPoint', 'coverFocalPoint', 'publicProfile'];
  if (Object.keys(p).some(key => !keys.includes(key))) throw new ValidationError('body', 'El perfil no permite cambiar datos de acceso ni permisos.');
  const field = (name: string, max: number) => {
    if (typeof p[name] !== 'string' || p[name].length > max) throw new ValidationError(name, `${name}: maximo ${max} caracteres.`);
    return p[name].trim();
  };
  const displayName = field('displayName', 60);
  if (!displayName) throw new ValidationError('displayName', 'Escribe tu nombre artistico.');
  const bio = field('bio', 320), location = field('location', 80), website = field('website', 200);
  if (website) {
    try { const url = new URL(website); if (url.protocol !== 'https:' || url.username || url.password) throw new Error(); }
    catch { throw new ValidationError('website', 'El enlace debe comenzar con https:// y no incluir credenciales.'); }
  }
  const instagram = field('instagram', 31).replace(/^@/, '');
  if (instagram && !/^[a-zA-Z0-9._]{1,30}$/.test(instagram)) throw new ValidationError('instagram', 'Usuario de Instagram no valido.');
  const focalPoint = (name: 'avatarFocalPoint' | 'coverFocalPoint'): ProfileImageFocalPoint | undefined => {
    if (p[name] === undefined) return undefined;
    if (!isProfileImageFocalPoint(p[name])) throw new ValidationError(name, 'El encuadre debe usar coordenadas enteras entre 0 y 100.');
    return p[name];
  };
  const avatarFocalPoint = focalPoint('avatarFocalPoint');
  const coverFocalPoint = focalPoint('coverFocalPoint');
  if (!Array.isArray(p.genres) || p.genres.length > 8 || p.genres.some(g => typeof g !== 'string' || !g.trim() || g.length > 24)) throw new ValidationError('genres', 'Hasta 8 generos de 24 caracteres.');
  if (!(profileCoverIds.includes(p.coverId as typeof profileCoverIds[number]) || p.coverId === 'custom') || !(['initials', ...profileCoverIds].includes(p.avatarId as string) || p.avatarId === 'custom')) throw new ValidationError('coverId', 'Selecciona una imagen disponible.');
  if (typeof p.publicProfile !== 'boolean') throw new ValidationError('publicProfile', 'Visibilidad no valida.');
  return { displayName, bio, location, website, instagram, genres: [...new Set(p.genres.map(g => (g as string).trim()))], coverId: p.coverId as ProfileInput['coverId'], avatarId: p.avatarId as ProfileInput['avatarId'], ...(avatarFocalPoint ? { avatarFocalPoint } : {}), ...(coverFocalPoint ? { coverFocalPoint } : {}), publicProfile: p.publicProfile };
}
