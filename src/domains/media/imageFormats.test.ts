import { describe, expect, it } from 'vitest'
import { imageUploadMime } from './imageFormats'

describe('image selection hints', () => {
  it('accepts supported browser formats, including empty MIME from Windows file selection', () => {
    expect(imageUploadMime({ name: 'cover.AVIF', type: '' })).toBe('image/avif')
    expect(imageUploadMime({ name: 'cover.webp', type: 'application/octet-stream' })).toBe('image/webp')
    expect(imageUploadMime({ name: 'portrait.jpg', type: 'image/jpg' })).toBe('image/jpeg')
    expect(imageUploadMime({ name: 'cover.png', type: 'text/html' })).toBeUndefined()
    expect(imageUploadMime({ name: 'cover.svg', type: 'image/svg+xml' })).toBeUndefined()
  })
})
