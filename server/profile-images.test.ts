import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parseProfileImageFocalPoint, validateProfileImageUpload } from './profile-images'

const fixture = () => readFile(resolve(process.cwd(), 'server/fixtures/beat-upload-cover.jpg'))

describe('profile image validation', () => {
  it('accepts image bytes whose actual JPEG type and dimensions match the declared type', async () => {
    const bytes = await fixture()
    expect(validateProfileImageUpload(bytes, 'image/jpeg')).toMatchObject({ mimeType: 'image/jpeg', width: 4000, height: 4000 })
  })

  it('rejects spoofed or malformed images while allowing automatic cropping of portrait and landscape avatars', async () => {
    const bytes = await fixture()
    expect(() => validateProfileImageUpload(bytes, 'image/png')).toThrow('Usa una imagen JPEG o PNG valida')
    expect(() => validateProfileImageUpload(Buffer.from('<svg onload="alert(1)"/>'), 'image/svg+xml')).toThrow('Usa una imagen JPEG o PNG valida')
    expect(() => validateProfileImageUpload(bytes.subarray(0, bytes.length - 32), 'image/jpeg')).toThrow('Usa una imagen JPEG o PNG valida')
    const distortedDimensions = Buffer.from(bytes)
    const sof = distortedDimensions.indexOf(Buffer.from([0xff, 0xc0]))
    expect(sof).toBeGreaterThanOrEqual(0)
    distortedDimensions.writeUInt16BE(3000, sof + 7)
    expect(validateProfileImageUpload(distortedDimensions, 'image/jpeg').width).toBe(3000)
  })

  it('accepts only bounded integer focal points from upload metadata', () => {
    expect(parseProfileImageFocalPoint('18,72')).toEqual({ x: 18, y: 72 })
    expect(parseProfileImageFocalPoint(undefined, { x: 50, y: 44 })).toEqual({ x: 50, y: 44 })
    for (const value of ['101,50', '50,-1', '50,50,20', '50.5,40', ['50,50']]) expect(() => parseProfileImageFocalPoint(value)).toThrow()
  })

  it('rejects images over the profile byte limit before processing', async () => {
    const bytes = await fixture()
    expect(() => validateProfileImageUpload(Buffer.alloc(8 * 1024 * 1024 + 1), 'image/jpeg')).toThrow('La imagen debe pesar como maximo 8 MB.')
    expect(bytes.length).toBeLessThan(8 * 1024 * 1024)
  })
})
