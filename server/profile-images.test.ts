import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { validateProfileImageUpload } from './profile-images'

const fixture = () => readFile(resolve(process.cwd(), 'server/fixtures/beat-upload-cover.jpg'))

describe('profile image validation', () => {
  it('accepts image bytes whose actual JPEG type and dimensions match the declared type', async () => {
    const bytes = await fixture()
    expect(validateProfileImageUpload(bytes, 'image/jpeg', 'avatar')).toMatchObject({ mimeType: 'image/jpeg', width: 4000, height: 4000 })
    expect(validateProfileImageUpload(bytes, 'image/jpeg', 'cover').width).toBe(4000)
  })

  it('rejects spoofed MIME, malformed image data, and unsafe avatar dimensions', async () => {
    const bytes = await fixture()
    expect(() => validateProfileImageUpload(bytes, 'image/png', 'avatar')).toThrow('Usa una imagen JPEG o PNG valida')
    expect(() => validateProfileImageUpload(Buffer.from('<svg onload="alert(1)"/>'), 'image/svg+xml', 'avatar')).toThrow('Usa una imagen JPEG o PNG valida')
    expect(() => validateProfileImageUpload(bytes.subarray(0, bytes.length - 32), 'image/jpeg', 'avatar')).toThrow('Usa una imagen JPEG o PNG valida')
    const distortedDimensions = Buffer.from(bytes)
    const sof = distortedDimensions.indexOf(Buffer.from([0xff, 0xc0]))
    expect(sof).toBeGreaterThanOrEqual(0)
    distortedDimensions.writeUInt16BE(3000, sof + 7)
    expect(() => validateProfileImageUpload(distortedDimensions, 'image/jpeg', 'avatar')).toThrow('La foto de perfil debe ser cuadrada')
    expect(validateProfileImageUpload(distortedDimensions, 'image/jpeg', 'cover').width).toBe(3000)
  })

  it('rejects images over the profile byte limit before processing', async () => {
    const bytes = await fixture()
    expect(() => validateProfileImageUpload(Buffer.alloc(8 * 1024 * 1024 + 1), 'image/jpeg', 'cover')).toThrow('La imagen debe pesar como maximo 8 MB.')
    expect(bytes.length).toBeLessThan(8 * 1024 * 1024)
  })
})
