import { useLayoutEffect, useRef, useState } from 'react';
import { safeMercadoPagoUrl } from '../api/client';
import { createBeatCheckout } from './beatPurchases';

export function safeCheckoutUrl(value: string): string | undefined {
  return safeMercadoPagoUrl(value);
}

/** Shared checkout lifetime: a stale session or abandoned screen can never redirect. */
const navigateToCheckout = (destination: string) => window.location.assign(destination);
export function useBeatCheckout(userId?: string, navigate = navigateToCheckout) {
  const [activeOffer, setActiveOffer] = useState<string>();
  const [purchaseError, setPurchaseError] = useState<string>();
  const lifetime = useRef(0);
  const pending = useRef(false);
  const keys = useRef(new Map<string, string>());
  useLayoutEffect(() => {
    let route = window.location.hash;
    const reset = () => {
      lifetime.current += 1; pending.current = false; keys.current.clear();
      setActiveOffer(undefined); setPurchaseError(undefined);
    };
    const routeChanged = () => { if (route !== window.location.hash) { route = window.location.hash; reset(); } };
    reset();
    window.addEventListener('hashchange', routeChanged);
    return () => { lifetime.current += 1; window.removeEventListener('hashchange', routeChanged); };
  }, [userId]);
  const buyBeat = async (contentId: string, offerId: string) => {
    if (!userId) { setPurchaseError('Sign in to purchase this beat.'); return; }
    if (pending.current) return;
    const generation = lifetime.current;
    const hash = window.location.hash;
    const current = () => lifetime.current === generation && hash === window.location.hash;
    const key = `${contentId}:${offerId}`;
    const idempotency = keys.current.get(key) || crypto.randomUUID();
    keys.current.set(key, idempotency); pending.current = true;
    setActiveOffer(key); setPurchaseError(undefined);
    try {
      const result = await createBeatCheckout(contentId, offerId, idempotency);
      if (!current()) return;
      if (result.ok) {
        const destination = safeCheckoutUrl(result.data.url);
        if (!destination) throw new Error('Invalid checkout destination');
        keys.current.delete(key); navigate(destination);
      } else {
        if (!['NETWORK_ERROR', 'TIMEOUT'].includes(result.error.code)) keys.current.delete(key);
        setPurchaseError(result.error.message);
      }
    } catch { if (current()) setPurchaseError('Could not open a secure checkout. Please retry.'); }
    finally { if (current()) { pending.current = false; setActiveOffer(undefined); } }
  };
  return { activeOffer, purchaseError, buyBeat };
}
