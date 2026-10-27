import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { HomeStories } from './HomeStories'
import type { SocialStoryView } from '../data/socialStoryRepository'

const story = (overrides: Partial<SocialStoryView> = {}): SocialStoryView => ({
  id: crypto.randomUUID(),
  author: { id: 'producer-1', displayName: 'Milo North' },
  kind: 'status',
  body: 'Una idea nueva para el beat de hoy',
  audience: 'public',
  createdAt: new Date().toISOString(),
  expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
  ...overrides,
})

afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers() })

describe('HomeStories', () => {
  it('shows only unexpired stories and opens the viewer', () => {
    const published = story()
    const expired = story({ id: 'expired', author: { id: 'old', displayName: 'Old producer' }, expiresAt: new Date(Date.now() - 1000).toISOString() })
    Object.defineProperty(HTMLDialogElement.prototype, 'showModal', { configurable: true, value: function (this: HTMLDialogElement) { this.open = true } })
    Object.defineProperty(HTMLDialogElement.prototype, 'close', { configurable: true, value: function (this: HTMLDialogElement) { this.open = false; this.dispatchEvent(new Event('close')) } })

    render(<HomeStories stories={[published, expired]} viewerId="viewer-1" onCreate={vi.fn()} onDelete={vi.fn()} />)

    expect(screen.getByRole('button', { name: 'Ver historia de Milo North' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Ver historia de Old producer' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Ver historia de Milo North' }))
    expect(screen.getByRole('dialog', { name: 'Historias' })).toHaveTextContent('Una idea nueva para el beat de hoy')
    expect(screen.getByRole('button', { name: 'Cerrar historias' })).toBeInTheDocument()
  })

  it('opens the dedicated story composer and exposes an empty state', () => {
    const onCreate = vi.fn()
    render(<HomeStories stories={[]} viewerId="viewer-1" onCreate={onCreate} onDelete={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /Crear historia/ }))
    expect(onCreate).toHaveBeenCalledOnce()
    expect(screen.getByText('Aún no hay historias activas.')).toBeInTheDocument()
  })

  it('shows a newly published story even when its timestamp is newer than the initial render', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-18T12:00:00.000Z'))
    const view = render(<HomeStories stories={[]} viewerId="viewer-1" onCreate={vi.fn()} onDelete={vi.fn()} />)
    vi.setSystemTime(new Date('2026-10-18T12:00:05.000Z'))
    const fresh = story({ createdAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() })

    view.rerender(<HomeStories stories={[fresh]} viewerId="viewer-1" onCreate={vi.fn()} onDelete={vi.fn()} />)

    expect(screen.getByRole('button', { name: 'Ver historia de Milo North' })).toBeInTheDocument()
  })

  it('offers delete only for the viewer\'s own story', () => {
    Object.defineProperty(HTMLDialogElement.prototype, 'showModal', { configurable: true, value: function (this: HTMLDialogElement) { this.open = true } })
    const mine = story({ author: { id: 'viewer-1', displayName: 'My profile' } })
    render(<HomeStories stories={[mine]} viewerId="viewer-1" onCreate={vi.fn()} onDelete={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Ver historia de My profile' }))
    expect(screen.getByRole('button', { name: 'Eliminar historia' })).toBeInTheDocument()
  })

  it('lets a viewer report another creator story without showing the report to its author', async () => {
    Object.defineProperty(HTMLDialogElement.prototype, 'showModal', { configurable: true, value: function (this: HTMLDialogElement) { this.open = true } })
    const onReport = vi.fn().mockResolvedValue(true)
    const firstView = render(<HomeStories stories={[story()]} viewerId="viewer-2" onCreate={vi.fn()} onDelete={vi.fn()} onReport={onReport} />)
    fireEvent.click(screen.getByRole('button', { name: 'Ver historia de Milo North' }))
    fireEvent.click(screen.getByRole('button', { name: 'Reportar historia' }))
    fireEvent.change(screen.getByLabelText('Detalles (opcional)'), { target: { value: 'contenido abusivo' } })
    fireEvent.click(screen.getByRole('button', { name: 'Enviar reporte' }))
    await vi.waitFor(() => expect(onReport).toHaveBeenCalledWith(expect.any(String), 'other', 'contenido abusivo'))
    await vi.waitFor(() => expect(screen.getByText('Reporte enviado al equipo de moderación.')).toBeInTheDocument())
    firstView.unmount()
    const ownView = render(<HomeStories stories={[story({ author: { id: 'viewer-2', displayName: 'Me' } })]} viewerId="viewer-2" onCreate={vi.fn()} onDelete={vi.fn()} onReport={onReport} />)
    fireEvent.click(screen.getByRole('button', { name: 'Ver historia de Me' }))
    expect(screen.queryByRole('button', { name: 'Reportar historia' })).not.toBeInTheDocument()
    ownView.unmount()
  })
})
