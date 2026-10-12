import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createProcessedPreview, previewArtifactPath } from './media-preview'
import { config } from './config'
import { hasAudioSignature, normalizedAudioMime } from './uploads'

const directories: string[] = []
const hasFfmpeg = spawnSync(config.ffmpegPath, ['-version'], { windowsHide: true, stdio: 'ignore' }).status === 0
const formatCases = [
  ['wav', 'pcm_s16le', 'wav'],
  ['mp3', 'libmp3lame', 'mp3'],
  ['flac', 'flac', 'flac'],
  ['aac', 'aac', 'adts'],
  ['m4a', 'aac', 'ipod'],
  ['ogg', 'libvorbis', 'ogg'],
  ['webm', 'libopus', 'webm'],
] as const
afterEach(async () => { await Promise.all(directories.splice(0).map(path => rm(path, { recursive: true, force: true }))) })

describe('processed audio previews', () => {
  it('writes a separately addressed MP4 derivative and validates the container signature', async () => {
    const root = await mkdtemp(join(tmpdir(), 'beatvault-preview-test-')); directories.push(root)
    const output = previewArtifactPath(root, 'owner/asset.preview.m4a')
    const media = Buffer.alloc(24); media.writeUInt32BE(media.length, 0); media.write('ftyp', 4); media.write('M4A ', 8)
    const result = await createProcessedPreview('private-original.wav', output, 'owner/asset.preview.m4a', async (_source, destination) => writeFile(destination, media))
    expect(result).toEqual({ storageKey: 'owner/asset.preview.m4a', mimeType: 'audio/mp4', sizeBytes: media.length })
    expect(await readFile(output)).toEqual(media)
    expect((await stat(output)).isFile()).toBe(true)
  })

  it('does not register an invalid output and rejects paths outside the private upload root', async () => {
    const root = await mkdtemp(join(tmpdir(), 'beatvault-preview-test-')); directories.push(root)
    const output = previewArtifactPath(root, 'owner/invalid.preview.m4a')
    await expect(createProcessedPreview('private-original.wav', output, 'owner/invalid.preview.m4a', async (_source, destination) => writeFile(destination, 'not mp4'))).resolves.toBeUndefined()
    await expect(stat(output)).rejects.toThrow()
    expect(() => previewArtifactPath(root, '../outside.m4a')).toThrow('PREVIEW_STORAGE_PATH_INVALID')
  })

  it.skipIf(!hasFfmpeg).each(formatCases)('transcodes valid %s source to the private AAC preview', async (extension, codec, container) => {
    const root = await mkdtemp(join(tmpdir(), 'beatvault-codec-matrix-')); directories.push(root)
    const source = join(root, `source.${extension}`)
    const generated = spawnSync(config.ffmpegPath, ['-nostdin', '-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=0.25', '-c:a', codec, '-f', container, source], { windowsHide: true, encoding: 'utf8' })
    expect(generated.status, generated.stderr).toBe(0)
    const expectedMime = ({ wav: 'audio/wav', mp3: 'audio/mpeg', flac: 'audio/flac', aac: 'audio/aac', m4a: 'audio/mp4', ogg: 'audio/ogg', webm: 'audio/webm' } as const)[extension]
    expect(normalizedAudioMime('', `source.${extension}`)).toBe(expectedMime)
    expect(await hasAudioSignature(source, expectedMime)).toBe(true)
    const key = `owner/${extension}.preview.m4a`
    const output = previewArtifactPath(root, key)
    await expect(createProcessedPreview(source, output, key)).resolves.toMatchObject({ storageKey: key, mimeType: 'audio/mp4', sizeBytes: expect.any(Number) })
    expect((await readFile(output)).toString('ascii', 4, 8)).toBe('ftyp')
  }, 30000)

  it.skipIf(!hasFfmpeg)('rejects a malformed source even when its extension looks supported', async () => {
    const root = await mkdtemp(join(tmpdir(), 'beatvault-invalid-source-')); directories.push(root)
    const source = join(root, 'broken.wav')
    await writeFile(source, 'RIFF but not actual audio data')
    expect(await hasAudioSignature(source, 'audio/wav')).toBe(false)
    const output = previewArtifactPath(root, 'owner/broken.preview.m4a')
    await expect(createProcessedPreview(source, output, 'owner/broken.preview.m4a')).resolves.toBeUndefined()
    await expect(stat(output)).rejects.toThrow()
  }, 30000)
})
