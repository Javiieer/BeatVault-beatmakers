import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { createSocialStory } = vi.hoisted(() => ({ createSocialStory: vi.fn() }))
vi.mock('../data/socialStoryRepository', () => ({ createSocialStory }))

import { HomeStoryComposer } from './HomeStoryComposer'

const createdStory = {
  id: 'story-1', author: { id: 'creator-1', displayName: 'Creator' }, kind: 'status' as const,
  body: 'Studio update', audience: 'private' as const, createdAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 86400000).toISOString(),
}
const originalCreateObjectUrl = Object.getOwnPropertyDescriptor(URL, 'createObjectURL')

beforeEach(() => {
  createSocialStory.mockReset().mockResolvedValue({ ok: true, data: createdStory })
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', { configurable: true, value: function (this: HTMLDialogElement) { this.open = true } })
  Object.defineProperty(HTMLDialogElement.prototype, 'close', { configurable: true, value: function (this: HTMLDialogElement) { this.open = false; this.dispatchEvent(new Event('close')) } })
  Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: vi.fn(() => 'blob:story-preview') })
})

afterEach(() => {
  vi.restoreAllMocks()
  Reflect.deleteProperty(HTMLDialogElement.prototype, 'showModal')
  Reflect.deleteProperty(HTMLDialogElement.prototype, 'close')
  if (originalCreateObjectUrl) Object.defineProperty(URL, 'createObjectURL', originalCreateObjectUrl)
  else Reflect.deleteProperty(URL, 'createObjectURL')
})

describe('HomeStoryComposer', () => {
  it('publishes an independent private text story', async () => {
    const onPublish = vi.fn()
    const onClose = vi.fn()
    render(<HomeStoryComposer open onClose={onClose} onPublish={onPublish} />)
    fireEvent.change(screen.getByLabelText('Texto de la historia'), { target: { value: 'Studio update' } })
    fireEvent.click(screen.getByRole('button', { name: 'Compartir historia' }))

    await waitFor(() => expect(createSocialStory).toHaveBeenCalledWith({ kind: 'status', body: 'Studio update', audience: 'private' }))
    expect(onPublish).toHaveBeenCalledWith(createdStory)
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('uploads a photo story with the chosen audience and optional caption', async () => {
    const photoStory = { ...createdStory, kind: 'photo' as const, body: 'New loop', audience: 'public' as const }
    createSocialStory.mockResolvedValue({ ok: true, data: photoStory })
    const file = new File(['image-bytes'], 'story.jpg', { type: 'image/jpeg' })
    render(<HomeStoryComposer open onClose={vi.fn()} onPublish={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: 'Foto' }))
    fireEvent.change(document.querySelector<HTMLInputElement>('.home-story-kind-tools input[type="file"]')!, { target: { files: [file] } })
    fireEvent.change(screen.getByLabelText('Texto de la historia'), { target: { value: 'New loop' } })
    fireEvent.click(screen.getByRole('button', { name: 'Privacidad de la historia: Solo yo' }))
    fireEvent.click(screen.getByRole('button', { name: 'Público' }))
    fireEvent.click(screen.getByRole('button', { name: 'Compartir historia' }))

    await waitFor(() => expect(createSocialStory).toHaveBeenCalledWith({ kind: 'photo', body: 'New loop', audience: 'public', file }))
  })
})
