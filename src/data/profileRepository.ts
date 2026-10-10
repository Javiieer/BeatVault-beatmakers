import { authClient } from '../api/client';
import { isCreatorProfile, type ProfileInput } from '../domains/profile';
export const readProfile = (id?: string) => authClient.request(id ? `/api/profiles/${encodeURIComponent(id)}` : '/api/profile', { method: 'GET' }, isCreatorProfile);
export const saveProfile = (profile: ProfileInput) => authClient.request('/api/profile', { method: 'PUT', body: JSON.stringify(profile) }, isCreatorProfile);
