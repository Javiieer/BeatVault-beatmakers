import { beforeEach, describe, expect, it } from 'vitest';
import { emptyProfile } from '../domains/profile';
import { clearProfileDraft, readProfileDraft, writeProfileDraft } from './profileDraft';

describe('session-scoped profile draft recovery', () => {
  beforeEach(() => sessionStorage.clear());
  it('retains unsaved metadata only for its owner and explicitly records files requiring reselection', () => {
    const initial = emptyProfile('owner');
    const draft = { ...initial, displayName: 'Not saved yet', bio: 'My new biography' };
    expect(writeProfileDraft('owner', initial, draft, true)).toBe(true);
    expect(readProfileDraft('owner')).toMatchObject({ draft: { displayName: draft.displayName }, pendingImages: true });
    expect(readProfileDraft('other')).toBeUndefined();
    clearProfileDraft('owner');
    expect(readProfileDraft('owner')).toBeUndefined();
  });
  it('does not restore corrupted or expired drafts', () => {
    sessionStorage.setItem('beatvault:profile-draft:owner', '{bad json');
    expect(readProfileDraft('owner')).toBeUndefined();
    sessionStorage.setItem('beatvault:profile-draft:owner', JSON.stringify({ baseline: '{}', draft: emptyProfile('owner'), pendingImages: false, savedAt: Date.now() - 86400001 }));
    expect(readProfileDraft('owner')).toBeUndefined();
  });
});
