import { afterEach, describe, expect, it } from 'vitest';
import { navigationLabel, tx } from './i18n';

describe('localization messages', () => {
  afterEach(() => { document.documentElement.lang = 'en'; });

  it('uses English as the default and renders Spanish navigation and marketplace strings', () => {
    document.documentElement.lang = 'en';
    expect(navigationLabel('/marketplace', 'Mercado')).toBe('Marketplace');
    expect(tx('market.style')).toBe('Style');
    expect(tx('seller.formTitle')).toBe('Prepare a beat offer');
    document.documentElement.lang = 'es';
    expect(navigationLabel('/marketplace', 'Marketplace')).toBe('Mercado');
    expect(tx('market.style')).toBe('Estilo');
    expect(tx('seller.formTitle')).toBe('Preparar oferta del beat');
  });
});
