import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Home } from "./Home";

const { readSocialFeed, readProfileSocialPosts, readSocialAccountState, setSocialFollow, setSocialPostBookmark, readSocialPostInteractionsBatch, createSocialPostComment, toggleSocialPostReaction } = vi.hoisted(() => ({ readSocialFeed: vi.fn(), readProfileSocialPosts: vi.fn(), readSocialAccountState: vi.fn(), setSocialFollow: vi.fn(), setSocialPostBookmark: vi.fn(), readSocialPostInteractionsBatch: vi.fn(), createSocialPostComment: vi.fn(), toggleSocialPostReaction: vi.fn() }));
vi.mock("./HomeComposer", () => ({ HomeComposer: () => null }));
vi.mock("../data/homePosts", () => ({ readLocalHomePosts: async () => [] }));
vi.mock("../data/socialPostRepository", () => ({ readSocialFeed, readProfileSocialPosts, readSocialAccountState, setSocialFollow, setSocialPostBookmark, readSocialPostInteractionsBatch, createSocialPostComment, toggleSocialPostReaction, deleteSocialPost: vi.fn(), reportSocialPost: vi.fn() }));

beforeEach(() => {
  localStorage.clear();
  readSocialFeed.mockReset().mockResolvedValue({ ok: true, data: { posts: [] } });
  readProfileSocialPosts.mockReset().mockResolvedValue({ ok: true, data: { posts: [] } });
  readSocialAccountState.mockReset().mockResolvedValue({ ok: true, data: { followedAccountIds: [], bookmarkedPostIds: [] } });
  setSocialFollow.mockReset().mockImplementation(async (_id: string, following: boolean) => ({ ok: true, data: { following } }));
  setSocialPostBookmark.mockReset().mockImplementation(async (_id: string, bookmarked: boolean) => ({ ok: true, data: { bookmarked } }));
  readSocialPostInteractionsBatch.mockReset().mockImplementation(async (ids: string[]) => ({ ok: true, data: { items: Object.fromEntries(ids.map(id => [id, { comments: [], reactionCount: 0, reactedByMe: false }])) } }));
  createSocialPostComment.mockReset();
  toggleSocialPostReaction.mockReset();
  Object.defineProperty(HTMLDialogElement.prototype, "showModal", { configurable: true, value: function (this: HTMLDialogElement) { this.open = true; } });
  Object.defineProperty(HTMLDialogElement.prototype, "close", { configurable: true, value: function (this: HTMLDialogElement) {
    this.open = false;
    this.dispatchEvent(new Event("close"));
  } });
});
afterEach(() => { vi.restoreAllMocks(); Reflect.deleteProperty(HTMLDialogElement.prototype, "showModal"); Reflect.deleteProperty(HTMLDialogElement.prototype, "close"); });

describe("home photo viewer", () => {
  it("opens photos with a side comment panel and keeps Shorts as navigation", async () => {
    render(<Home uploads={[]} onPlay={vi.fn()} />);
    expect(screen.queryByRole("heading", { name: "El sonido se mueve aquí." })).not.toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Estados de productores" }).children).toHaveLength(7);
    fireEvent.click(screen.getByRole("button", { name: "Ampliar foto de Ari Sol" }));

    const dialog = await screen.findByRole("dialog", { name: "Foto de Ari Sol" });
    const input = dialog.querySelector<HTMLInputElement>("#viewer-comment-post-photo-1")!;
    fireEvent.change(input, { target: { value: "Me encanta esta textura" } });
    fireEvent.submit(input.closest("form")!);

    await waitFor(() => expect(dialog).toHaveTextContent("Me encanta esta textura"));
    expect(screen.getByRole("link", { name: "Abrir Short de Kade Seven" })).toHaveAttribute("href", "#/shorts");
  });
});

describe("authenticated Home post refresh", () => {
  it("keeps a comment draft when the server rejects the comment", async () => {
    const post = { id: "d276ad36-9d07-4d17-97e6-075ab8a81a0e", author: { id: "creator-2", displayName: "Creator Two" }, kind: "status", body: "Remote post", audience: "public", visibility: "published", createdAt: new Date().toISOString() };
    readSocialFeed.mockResolvedValue({ ok: true, data: { posts: [post] } });
    createSocialPostComment.mockResolvedValue({ ok: false, error: { code: "NETWORK_ERROR", message: "No se pudo publicar" } });
    render(<Home uploads={[]} onPlay={vi.fn()} scope="creator-1" />);

    await screen.findAllByText("Remote post");
    const article = document.getElementById(`feed-post-social-${post.id}`)!;
    const input = await within(article).findByPlaceholderText("Escribe un comentario...");
    fireEvent.change(input, { target: { value: "Mi borrador" } });
    fireEvent.submit(input.closest("form")!);

    await waitFor(() => expect(createSocialPostComment).toHaveBeenCalledWith(post.id, "Mi borrador"));
    expect(input).toHaveValue("Mi borrador");
    expect(await screen.findByText("No se pudo publicar")).toBeInTheDocument();
  });

  it("keeps seeded demo posts out of authenticated account feeds", async () => {
    render(<Home uploads={[]} onPlay={vi.fn()} scope="creator-1" />);
    await waitFor(() => expect(readSocialFeed).toHaveBeenCalled());
    expect(screen.queryByRole("button", { name: "Ampliar foto de Ari Sol" })).not.toBeInTheDocument();
    expect(screen.queryByText("¿Qué le pondrías a este bajo: drums secos o una textura más sucia?")).not.toBeInTheDocument();
  });

  it("reloads owner-only audiences from the profile endpoint and deduplicates feed posts", async () => {
    const author = { id: "creator-1", displayName: "Creator" };
    const post = (id: string, audience: string, visibility = "published") => ({ id, author, kind: "status", body: `${id} ${audience}`, audience, visibility, createdAt: new Date().toISOString() });
    const publicPost = post("visible-post", "public");
    const friendsPost = post("friends-post", "friends");
    const privatePost = post("private-post", "private");
    const pendingPost = post("pending-post", "public", "pending-review");
    readSocialFeed.mockResolvedValue({ ok: true, data: { posts: [publicPost] } });
    readProfileSocialPosts.mockResolvedValue({ ok: true, data: { posts: [publicPost, friendsPost, privatePost, pendingPost] } });
    render(<Home uploads={[]} onPlay={vi.fn()} scope="creator-1" />);
    const feed = within(screen.getByRole("region", { name: "Feed de BeatVault" }));

    expect(await feed.findByText("private-post private")).toBeInTheDocument();
    expect(feed.getByText("friends-post friends")).toBeInTheDocument();
    expect(feed.getByText("pending-post public")).toBeInTheDocument();
    expect(feed.getAllByText("visible-post public")).toHaveLength(1);
    expect(readSocialFeed).toHaveBeenCalled();
    expect(readProfileSocialPosts).toHaveBeenCalledWith("creator-1");
  });

  it("persists follows and bookmarks for social posts by account and post IDs", async () => {
    const author = { id: "creator-2", displayName: "Creator Two" };
    const post = { id: "d276ad36-9d07-4d17-97e6-075ab8a81a0e", author, kind: "status", body: "Remote post", audience: "public", visibility: "published", createdAt: new Date().toISOString() };
    readSocialFeed.mockResolvedValue({ ok: true, data: { posts: [post] } });
    render(<Home uploads={[]} onPlay={vi.fn()} scope="creator-1" />);
    const feed = within(screen.getByRole("region", { name: "Feed de BeatVault" }));
    await feed.findByText("Remote post");
    const article = document.getElementById(`feed-post-social-${post.id}`)!;
    const followButton = await waitFor(() => {
      const button = article.querySelector<HTMLButtonElement>(".home-follow");
      expect(button).toBeEnabled();
      return button!;
    });
    fireEvent.click(followButton);
    fireEvent.click(within(article).getByRole("button", { name: "Guardar publicación" }));

    await waitFor(() => expect(setSocialFollow).toHaveBeenCalledWith(author.id, true));
    await waitFor(() => expect(setSocialPostBookmark).toHaveBeenCalledWith(post.id, true));
    expect(await within(article).findByRole("button", { name: "Quitar de guardados" })).toHaveAttribute("aria-pressed", "true");
    expect(await within(article).findByRole("button", { name: /Siguiendo/ })).toHaveAttribute("aria-pressed", "true");
  });

  it("loads published post interactions in batches of 30 rather than one request per post", async () => {
    const author = { id: "creator-2", displayName: "Creator Two" };
    const posts = Array.from({ length: 31 }, (_, index) => ({ id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`, author, kind: "status", body: `Post ${index}`, audience: "public", visibility: "published", createdAt: new Date(Date.now() - index * 1000).toISOString() }));
    readSocialFeed.mockResolvedValue({ ok: true, data: { posts } });
    render(<Home uploads={[]} onPlay={vi.fn()} scope="creator-1" />);
    await waitFor(() => expect(readSocialPostInteractionsBatch).toHaveBeenCalledTimes(2));
    expect(readSocialPostInteractionsBatch.mock.calls.map(([ids]) => ids.length).sort((a, b) => a - b)).toEqual([1, 30]);
  });

  it("does not reuse another account's cached reactions or comments after switching accounts", async () => {
    const post = { id: "d276ad36-9d07-4d17-97e6-075ab8a81a0e", author: { id: "creator-3", displayName: "Creator Three" }, kind: "status", body: "Shared public post", audience: "public", visibility: "published", createdAt: new Date().toISOString() };
    readSocialFeed.mockResolvedValue({ ok: true, data: { posts: [post] } });
    readSocialPostInteractionsBatch.mockReset()
      .mockResolvedValueOnce({ ok: true, data: { items: { [post.id]: { comments: [{ id: "comment-1", authorId: "creator-1", authorName: "First account", body: "Private account comment state", createdAt: new Date().toISOString() }], reactionCount: 1, reactedByMe: true } } } })
      .mockResolvedValueOnce({ ok: false, error: { code: "NETWORK_ERROR", message: "offline" } });
    const { rerender } = render(<Home uploads={[]} onPlay={vi.fn()} scope="creator-1" />);
    await screen.findAllByText("Shared public post");
    const article = document.getElementById(`feed-post-social-${post.id}`)!;
    expect(await within(article).findByRole("button", { name: "Quitar me gusta" })).toHaveAttribute("aria-pressed", "true");
    expect(within(article).getByText("Private account comment state")).toBeInTheDocument();

    rerender(<Home uploads={[]} onPlay={vi.fn()} scope="creator-2" />);
    await waitFor(() => expect(within(article).getByRole("button", { name: "Me gusta" })).toHaveAttribute("aria-pressed", "false"));
    expect(within(article).queryByText("Private account comment state")).not.toBeInTheDocument();
  });

  it("does not pretend authenticated relationships were saved if loading them fails", async () => {
    readSocialAccountState.mockResolvedValue({ ok: false, error: { code: "NETWORK_ERROR", message: "API local no disponible" } });
    const post = { id: "d276ad36-9d07-4d17-97e6-075ab8a81a0e", author: { id: "creator-2", displayName: "Creator Two" }, kind: "status", body: "Remote post", audience: "public", visibility: "published", createdAt: new Date().toISOString() };
    readSocialFeed.mockResolvedValue({ ok: true, data: { posts: [post] } });
    render(<Home uploads={[]} onPlay={vi.fn()} scope="creator-1" />);
    const feed = within(screen.getByRole("region", { name: "Feed de BeatVault" }));

    expect(await screen.findByText(/No se pudieron sincronizar Seguir y Guardar/)).toHaveAttribute("role", "alert");
    await feed.findByText("Remote post");
    const article = document.getElementById(`feed-post-social-${post.id}`)!;
    expect(article.querySelector(".home-follow")).toBeDisabled();
    expect(within(article).getByRole("button", { name: "Guardar publicación" })).toBeDisabled();
    expect(setSocialFollow).not.toHaveBeenCalled();
    expect(setSocialPostBookmark).not.toHaveBeenCalled();
  });
});
