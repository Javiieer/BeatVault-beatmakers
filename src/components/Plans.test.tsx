import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Plans } from './Plans'

const api = vi.hoisted(() => ({ getAccountPlan: vi.fn(), getAccountStorageUsage: vi.fn() }))
vi.mock('../api/client', () => api)

describe('Plans', () => {
  beforeEach(() => {
    api.getAccountPlan.mockResolvedValue({
      ok: true,
      data: {
        planId: 'free', status: 'local', pricing: 'undecided', billing: 'disabled',
        plan: { id: 'free', name: 'Free', description: 'Starter', storageLimitBytes: 5 * 1024 ** 3 },
        plans: [
          { id: 'free', name: 'Free', description: 'Starter', storageLimitBytes: 5 * 1024 ** 3 },
          { id: 'creator', name: 'Creator', description: 'Creator', storageLimitBytes: 50 * 1024 ** 3 },
          { id: 'studio', name: 'Studio', description: 'Studio', storageLimitBytes: 250 * 1024 ** 3 },
        ],
      },
    })
    api.getAccountStorageUsage.mockResolvedValue({
      ok: true,
      data: { usedBytes: 1024, limitBytes: 5 * 1024 ** 3, availableBytes: 5 * 1024 ** 3 - 1024, quotaSource: 'plan', planId: 'free' },
    })
  })

  it('shows proposed tiers and changes the annual prices', async () => {
    render(<Plans />)
    expect(await screen.findByText('Creator')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Annual' }))
    expect(screen.getByText('$59.00')).toBeInTheDocument()
    expect(screen.getByText('$129.00')).toBeInTheDocument()
    expect(screen.getByText('Save $12.88 per year')).toBeInTheDocument()
  })

  it('shows a checkout summary but never reports a purchase while billing is disabled', async () => {
    render(<Plans />)
    const planButtons = await screen.findAllByRole('button', { name: 'Review plan' })
    expect(planButtons[0]).toBeEnabled()
    fireEvent.click(planButtons[0])
    expect(screen.getByRole('dialog', { name: 'Review your selection' })).toBeInTheDocument()
    expect(screen.getByText('Payments are not connected. No charge or plan activation can happen here.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Continue to payment' })).toBeDisabled()
  })
})
