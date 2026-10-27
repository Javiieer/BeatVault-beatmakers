export const imageUploadAccept = 'image/jpeg,image/png,image/webp,image/avif,.jpg,.jpeg,.png,.webp,.avif'

const imageMimes: Record<string, string> = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', avif: 'image/avif' }

/** Browser hints only. The server separately checks signatures and decodes pixels. */
export function imageUploadMime(file: Pick<File, 'name' | 'type'>): string | undefined {
  const declared = file.type.toLowerCase().split(';', 1)[0].trim()
  const extension = file.name.toLowerCase().split('.').pop() || ''
  if (!declared || declared === 'application/octet-stream') return imageMimes[extension]
  if (declared === 'image/jpg') return 'image/jpeg'
  return Object.values(imageMimes).includes(declared) ? declared : undefined
}
