import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ProjectModal } from './ProjectModal'
import type { Project } from '../types'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('ProjectModal', () => {
  it('renders a new project form with its initial values', () => {
    render(<ProjectModal onClose={vi.fn()} onSave={vi.fn()} />)

    expect(screen.getByRole('dialog', { name: 'New project' })).toBeInTheDocument()
    expect(screen.getByLabelText('Name')).toHaveValue('')
    expect(screen.getByLabelText('BPM')).toHaveValue(120)
    expect(screen.getByLabelText('Status')).toHaveValue('Draft')
  })

  it('shows required validation errors and does not save an incomplete form', () => {
    const onSave = vi.fn()
    render(<ProjectModal onClose={vi.fn()} onSave={onSave} />)

    fireEvent.click(screen.getByRole('button', { name: 'Create project' }))

    expect(screen.getByText('Name is required.')).toBeInTheDocument()
    expect(screen.getByText('Genre is required.')).toBeInTheDocument()
    expect(screen.getByText('Key is required.')).toBeInTheDocument()
    expect(onSave).not.toHaveBeenCalled()
  })

  it('saves a valid project with normalized form values', () => {
    const onSave = vi.fn<(project: Project) => void>()
    render(<ProjectModal onClose={vi.fn()} onSave={onSave} />)

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: '  Midnight Theory  ' } })
    fireEvent.change(screen.getByLabelText('Genre'), { target: { value: ' Dark Trap ' } })
    fireEvent.change(screen.getByLabelText('Key'), { target: { value: ' F minor ' } })
    fireEvent.change(screen.getByLabelText('BPM'), { target: { value: '140' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create project' }))

    expect(onSave).toHaveBeenCalledOnce()
    expect(onSave.mock.calls[0][0]).toMatchObject({
      name: 'Midnight Theory',
      genre: 'Dark Trap',
      bpm: 140,
      key: 'F minor',
      status: 'Draft',
      modified: 'Just now',
    })
  })

  it('closes when Escape is pressed', () => {
    const onClose = vi.fn()
    const view = render(<ProjectModal onClose={onClose} onSave={vi.fn()} />)

    fireEvent.keyDown(window, { key: 'Escape' })

    expect(onClose).toHaveBeenCalledOnce()
    view.unmount()
  })
})
