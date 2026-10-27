import { beforeEach, describe, expect, it } from 'vitest';
import { readFavoriteIds, writeFavoriteIds } from './localFavorites';
beforeEach(() => localStorage.clear());
describe('account-scoped library favorites', () => {
  it('does not assign legacy or another account favorites to a user', () => {
    writeFavoriteIds(new Set(['legacy']));
    writeFavoriteIds(new Set(['a']), 'account-a');
    writeFavoriteIds(new Set(['b']), 'account-b');
    expect(readFavoriteIds('account-a')).toEqual(new Set(['a']));
    expect(readFavoriteIds('account-b')).toEqual(new Set(['b']));
    expect(readFavoriteIds('new-account')).toBeNull();
    expect(readFavoriteIds()).toEqual(new Set(['legacy']));
  });
  it('encodes scope boundaries and tolerates malformed browser data', () => {
    writeFavoriteIds(new Set(['a']), 'account:a');
    expect(localStorage.getItem('beatvault:library-favorites:account%3Aa')).toBe('["a"]');
    localStorage.setItem('beatvault:library-favorites:broken', '{invalid');
    expect(readFavoriteIds('broken')).toBeNull();
  });
});
