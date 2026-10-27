import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
const { readFeed, readOwn, readCatalog, fresh } = vi.hoisted(() => ({
  readFeed: vi.fn(), readOwn: vi.fn(), readCatalog: vi.fn(),
  fresh: { id: 'new-post', author: { id: 'creator-1', displayName: 'Creator' }, kind: 'status', body: 'Created while the initial feed was loading', audience: 'private', visibility: 'published', createdAt: '2026-10-26T10:00:00Z' },
}));
vi.mock('./HomeComposer', () => ({ HomeComposer: ({ onPublish }: { onPublish: (post: unknown) => void }) => <button onClick={() => onPublish(fresh)}>Publish test post</button> }));
vi.mock('../data/homePosts', () => ({ readLocalHomePosts: async () => [] }));
vi.mock('../data/socialStoryRepository', () => ({ readSocialStories: async () => ({ ok: true, data: { stories: [] } }), deleteSocialStory: vi.fn() }));
vi.mock('../data/socialRepository', () => ({ readCatalogSocial: readCatalog, createCatalogComment: vi.fn(), toggleCatalogReaction: vi.fn() }));
vi.mock('../data/socialPostRepository', () => ({
  readSocialFeed: readFeed, readProfileSocialPosts: readOwn,
  readSocialAccountState: async () => ({ ok: true, data: { followedAccountIds: [], bookmarkedPostIds: [] } }),
  readSocialPostInteractionsBatch: async () => ({ ok: true, data: { items: {} } }),
  setSocialFollow: vi.fn(), setSocialPostBookmark: vi.fn(), createSocialPostComment: vi.fn(), toggleSocialPostReaction: vi.fn(), deleteSocialPost: vi.fn(), reportSocialPost: vi.fn(),
}));
import { Home } from './Home';
describe('Home initial snapshot race', () => {
  it('retains a newly published own post when older feed snapshots arrive afterward', async () => {
    let finishFeed!: (value: unknown) => void;
    let finishOwn!: (value: unknown) => void;
    readFeed.mockReturnValue(new Promise(resolve => { finishFeed = resolve; }));
    readOwn.mockReturnValue(new Promise(resolve => { finishOwn = resolve; }));
    render(<Home uploads={[]} onPlay={vi.fn()} scope="creator-1" />);
    fireEvent.click(screen.getByRole('button', { name: 'Publish test post' }));
    expect(screen.getByText(fresh.body)).toBeInTheDocument();
    await act(async () => { finishFeed({ ok: true, data: { posts: [] } }); finishOwn({ ok: true, data: { posts: [] } }); });
    await waitFor(() => expect(screen.queryByText('Cargando publicaciones…')).not.toBeInTheDocument());
    expect(screen.getByText(fresh.body)).toBeInTheDocument();
  });
  it('does not refetch already loaded catalog interactions whenever a status is published', async () => {
    readFeed.mockResolvedValue({ ok: true, data: { posts: [] } });
    readOwn.mockResolvedValue({ ok: true, data: { posts: [] } });
    readCatalog.mockReset().mockResolvedValue({ ok: true, data: { comments: [], reactionCount: 1, reactedByMe: true } });
    render(<Home uploads={[{ id: 'catalog-1', name: 'Published audio', type: 'Beat', ownerId: 'creator-1', publicationStatus: 'published', metadata: { duration: '--', size: '--', format: 'WAV' }, color: '#000', favorite: false, waveform: [], tags: [] }]} onPlay={vi.fn()} scope="creator-1" />);
    await screen.findByRole('button', { name: 'Quitar me gusta' });
    const initialReads = readCatalog.mock.calls.length;
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Publish test post' })); });
    expect(screen.getByText(fresh.body)).toBeInTheDocument();
    expect(readCatalog).toHaveBeenCalledTimes(initialReads);
  });
});
