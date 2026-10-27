import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { getMercadoPagoSellerStatus, safeMercadoPagoOAuthUrl, startMercadoPagoOAuth } = vi.hoisted(() => ({
  getMercadoPagoSellerStatus: vi.fn(),
  safeMercadoPagoOAuthUrl: vi.fn((url: string) => url.startsWith('https://auth.mercadopago.com.mx/authorization?') ? url : undefined),
  startMercadoPagoOAuth: vi.fn(),
}))
vi.mock('../api/client', () => ({ getMercadoPagoSellerStatus, safeMercadoPagoOAuthUrl, startMercadoPagoOAuth }))

import { MercadoPagoConnectPanel } from './MercadoPagoConnectPanel'

describe('Mercado Pago seller connection panel', () => {
  beforeEach(() => {
    getMercadoPagoSellerStatus.mockReset()
    safeMercadoPagoOAuthUrl.mockClear()
    startMercadoPagoOAuth.mockReset()
  })

  it('explains when Mercado Pago is not configured and disables connection', async () => {
    getMercadoPagoSellerStatus.mockResolvedValue({ ok: true, data: { enabled: false, connected: false } })
    render(<MercadoPagoConnectPanel />)
    expect(await screen.findByRole('heading', { name: 'Connect Mercado Pago' })).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('Mercado Pago is not configured on this local server.')
    expect(screen.getByRole('button', { name: 'Connect Mercado Pago' })).toBeDisabled()
  })

  it('allows reconnecting after the linked authorization expires', async () => {
    getMercadoPagoSellerStatus.mockResolvedValue({ ok: true, data: { enabled: true, connected: true, tokenExpiresAt: '2020-01-01T00:00:00.000Z' } })
    render(<MercadoPagoConnectPanel />)
    expect(await screen.findByText(/This authorization expires on/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Reconnect Mercado Pago' })).toBeEnabled()
  })
})
