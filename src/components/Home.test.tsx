import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Home } from "./Home";

const { readSocialFeed, readProfileSocialPosts, readSocialPostInteractions, createSocialPostComment, toggleSocialPostReaction } = vi.hoisted(() => ({ readSocialFeed: vi.fn(), readProfileSocialPosts: vi.fn(), readSocialPostInteractions: vi.fn(), createSocialPostComment: vi.fn(), toggleSocialPostReaction: vi.fn() }));
vi.mock("./HomeComposer", () => ({ HomeComposer: () => null }));
vi.mock("../data/homePosts", () => ({ readLocalHomePosts: async () => [] }));
vi.mock("../data/socialPostRepository", () => ({ readSocialFeed, readProfileSocialPosts, readSocialPostInteractions, createSocialPostComment, toggleSocialPostReaction, deleteSocialPost: vi.fn(), reportSocialPost: vi.fn() }));

beforeEach(() => {
  localStorage.clear();
  readSocialFeed.mockReset().mockResolvedValue({ ok: true, data: { posts: [] } });
  readProfileSocialPosts.mockReset().mockResolvedValue({ ok: true, data: { posts: [] } });
  readSocialPostInteractions.mockReset().mockResolvedValue({ ok: true, data: { comments: [], reactionCount: 0, reactedByMe: false } });
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

    expect(await screen.findByText("private-post private")).toBeInTheDocument();
    expect(screen.getByText("friends-post friends")).toBeInTheDocument();
    expect(screen.getByText("pending-post public")).toBeInTheDocument();
    expect(screen.getAllByText("visible-post public")).toHaveLength(1);
    expect(readSocialFeed).toHaveBeenCalled();
    expect(readProfileSocialPosts).toHaveBeenCalledWith("creator-1");
  });
});
