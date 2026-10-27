import { act, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
const { readPost, readFeed } = vi.hoisted(() => ({ readPost: vi.fn(), readFeed: vi.fn() }));
vi.mock('../data/homePosts', () => ({ readLocalHomePosts: async () => [] }));
vi.mock('./HomeComposer', () => ({ HomeComposer: () => null }));
vi.mock('../data/socialStoryRepository', () => ({ readSocialStories: async () => ({ ok: true, data: { stories: [] } }), deleteSocialStory: vi.fn() }));
vi.mock('../data/socialRepository', () => ({ readCatalogSocial: vi.fn(), createCatalogComment: vi.fn(), toggleCatalogReaction: vi.fn() }));
vi.mock('../data/socialPostRepository', () => ({
  readSocialPost: readPost,
  readSocialFeed: readFeed,
  readProfileSocialPosts: async () => ({ ok: true, data: { posts: [] } }),
  readSocialAccountState: async () => ({ ok: true, data: { followedAccountIds: [], bookmarkedPostIds: [] } }),
  readSocialPostInteractionsBatch: async () => ({ ok: true, data: { items: {} } }),
  setSocialFollow: vi.fn(), setSocialPostBookmark: vi.fn(), createSocialPostComment: vi.fn(), toggleSocialPostReaction: vi.fn(), deleteSocialPost: vi.fn(), reportSocialPost: vi.fn(),
}));
import { Home } from './Home';
const first = '11111111-1111-4111-8111-111111111111';
const second = '22222222-2222-4222-8222-222222222222';
const post = (id: string, body: string) => ({ id, author: { id: 'author', displayName: 'Author' }, kind: 'status', body, audience: 'public', visibility: 'published', createdAt: '2026-10-26T10:00:00Z' });

describe('authorized notification destinations beyond the first feed page', () => {
  beforeEach(() => {
    readPost.mockReset();
    readFeed.mockReset().mockResolvedValue({ ok: true, data: { posts: [] } });
    Object.defineProperty(Element.prototype, 'scrollIntoView', { value: vi.fn(), configurable: true });
    window.location.hash = `#/home?post=${first}`;
  });
  it('fetches the requested post independently and handles another destination on the same Home screen', async () => {
    const firstPage = Array.from({ length: 30 }, (_, index) => post(`a0000000-0000-4000-8000-${String(index).padStart(12, '0')}`, `Recent publication ${index}`));
    readFeed.mockResolvedValue({ ok: true, data: { posts: firstPage, nextCursor: 'older-page' } });
    readPost.mockImplementation(async (id: string) => ({ ok: true, data: post(id, id === first ? 'Older publication' : 'Another publication') }));
    render(<Home uploads={[]} scope="viewer" onPlay={vi.fn()} />);
    expect(await screen.findByText('Recent publication 29')).toBeInTheDocument();
    expect(await screen.findByText('Older publication')).toBeInTheDocument();
    expect(readPost).toHaveBeenCalledWith(first);
    act(() => { window.location.hash = `#/home?post=${second}`; window.dispatchEvent(new HashChangeEvent('hashchange')); });
    expect(await screen.findByText('Another publication')).toBeInTheDocument();
    expect(screen.queryByText('Older publication')).not.toBeInTheDocument();
  });
  it('shows an unavailable destination without revealing a late result belonging to an old account', async () => {
    let finish!: (result: unknown) => void;
    readPost.mockReturnValueOnce(new Promise(resolve => { finish = resolve; })).mockResolvedValue({ ok: false, error: { code: 'POST_NOT_FOUND', message: 'Unavailable' } });
    const view = render(<Home uploads={[]} scope="viewer-a" onPlay={vi.fn()} />);
    await waitFor(() => expect(readPost).toHaveBeenCalledWith(first));
    view.rerender(<Home uploads={[]} scope="viewer-b" onPlay={vi.fn()} />);
    await act(async () => finish({ ok: true, data: post(first, 'Old account secret response') }));
    expect(await screen.findByText('Esta publicación no está disponible o no tienes acceso.')).toBeInTheDocument();
    expect(screen.queryByText('Old account secret response')).not.toBeInTheDocument();
  });
});
