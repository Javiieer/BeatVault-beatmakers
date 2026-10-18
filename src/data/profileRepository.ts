import { ApiClient, authClient } from '../api/client';
import { isCreatorProfile, type ProfileImageFocalPoint, type ProfileImageKind, type ProfileInput } from '../domains/profile';
export const readProfile = (id?: string) => authClient.request(id ? `/api/profiles/${encodeURIComponent(id)}` : '/api/profile', { method: 'GET' }, isCreatorProfile);
export const saveProfile = (profile: ProfileInput) => authClient.request('/api/profile', { method: 'PUT', body: JSON.stringify(profile) }, isCreatorProfile);
const profileImageClient = new ApiClient(undefined, 10 * 60 * 1000);
export const uploadProfileImage = (kind: ProfileImageKind, file: File, focalPoint: ProfileImageFocalPoint) => profileImageClient.request(`/api/profile/images/${kind}`, { method: 'POST', body: file, headers: { 'Content-Type': file.type, 'X-Profile-Focal-Point': `${focalPoint.x},${focalPoint.y}` } }, isCreatorProfile);
