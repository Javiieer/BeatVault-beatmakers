import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
const { request } = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock('./beatPurchases', () => ({ createBeatCheckout: request }));
import { safeCheckoutUrl, useBeatCheckout } from './useBeatCheckout';

describe('checkout lifetime shared across product surfaces', () => {
  beforeEach(() => { request.mockReset(); window.location.hash = '#/marketplace'; });
  it('redirects only to the exact Mercado Pago HTTPS origins', async () => {
    for (const url of ['javascript:alert(1)', 'https://www.mercadopago.com.mx.evil.test/', 'https://sandbox.mercadopago.com.mx.evil.test/', 'https://user:pass@www.mercadopago.com.mx/', 'http://www.mercadopago.com.mx/', 'https://mercadopago.com.mx/']) expect(safeCheckoutUrl(url)).toBeUndefined();
    const navigate = vi.fn();
    request.mockResolvedValue({ ok: true, data: { url: 'https://sandbox.mercadopago.com.mx/checkout/test' } });
    const hook = renderHook(() => useBeatCheckout('buyer', navigate));
    await act(() => hook.result.current.buyBeat('beat', 'offer'));
    expect(navigate).toHaveBeenCalledWith('https://sandbox.mercadopago.com.mx/checkout/test');
  });
  it('ignores a late checkout response after navigating away or switching account', async () => {
    let finish!: (result: unknown) => void;
    request.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    const navigate = vi.fn();
    const hook = renderHook(({ userId }) => useBeatCheckout(userId, navigate), { initialProps: { userId: 'buyer-a' } });
    let operation!: Promise<void>;
    act(() => { operation = hook.result.current.buyBeat('beat', 'offer'); });
    hook.rerender({ userId: 'buyer-b' });
    await act(async () => { finish({ ok: true, data: { url: 'https://www.mercadopago.com.mx/checkout/old' } }); await operation; });
    expect(navigate).not.toHaveBeenCalled();
    expect(hook.result.current.activeOffer).toBeUndefined();
    act(() => { operation = hook.result.current.buyBeat('beat', 'offer'); });
    act(() => { window.location.hash = '#/home'; window.dispatchEvent(new HashChangeEvent('hashchange')); });
    await act(async () => { finish({ ok: true, data: { url: 'https://www.mercadopago.com.mx/checkout/old' } }); await operation; });
    expect(navigate).not.toHaveBeenCalled();
  });
  it('reuses the idempotency key after a lost response and suppresses duplicate clicks', async () => {
    request.mockResolvedValue({ ok: false, error: { code: 'NETWORK_ERROR', message: 'retry' } });
    const hook = renderHook(() => useBeatCheckout('buyer', vi.fn()));
    await act(() => hook.result.current.buyBeat('beat', 'offer'));
    const firstKey = request.mock.calls[0][2];
    await act(() => hook.result.current.buyBeat('beat', 'offer'));
    expect(request.mock.calls[1][2]).toBe(firstKey);
    request.mockReturnValue(new Promise(() => undefined));
    act(() => { void hook.result.current.buyBeat('beat', 'offer'); void hook.result.current.buyBeat('beat', 'offer'); });
    await waitFor(() => expect(request).toHaveBeenCalledTimes(3));
  });
});
