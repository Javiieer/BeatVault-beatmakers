import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HomeStories } from "./HomeStories";
import type { SocialPostView } from "../data/socialPostRepository";

const post = (overrides: Partial<SocialPostView> = {}): SocialPostView => ({
  id: crypto.randomUUID(),
  author: { id: "producer-1", displayName: "Milo North" },
  kind: "status",
  body: "Una idea nueva para el beat de hoy",
  audience: "public",
  visibility: "published",
  createdAt: new Date().toISOString(),
  ...overrides,
});

afterEach(() => vi.restoreAllMocks());

describe("HomeStories", () => {
  it("shows only published posts from the last 24 hours and opens the viewer", () => {
    const published = post();
    const old = post({ id: "old", author: { id: "old", displayName: "Old producer" }, createdAt: new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString() });
    const pending = post({ id: "pending", author: { id: "pending", displayName: "Pending producer" }, visibility: "pending-review" });
    Object.defineProperty(HTMLDialogElement.prototype, "showModal", { configurable: true, value: function (this: HTMLDialogElement) { this.open = true; } });
    Object.defineProperty(HTMLDialogElement.prototype, "close", { configurable: true, value: function (this: HTMLDialogElement) { this.open = false; this.dispatchEvent(new Event("close")); } });

    render(<HomeStories posts={[published, old, pending]} onCreate={vi.fn()} />);

    expect(screen.getByRole("button", { name: "Ver estado de Milo North" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Ver estado de Old producer" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Ver estado de Pending producer" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Ver estado de Milo North" }));
    expect(screen.getByRole("dialog").textContent).toContain("Una idea nueva para el beat de hoy");
    expect(screen.getByRole("button", { name: "Cerrar estados" })).toBeInTheDocument();
  });

  it("routes the create-state action to the Home composer callback", () => {
    const onCreate = vi.fn();
    render(<HomeStories posts={[]} onCreate={onCreate} />);
    fireEvent.click(screen.getByRole("button", { name: /Crear estado/ }));
    expect(onCreate).toHaveBeenCalledOnce();
    expect(screen.getByText("No hay estados recientes. Comparte algo desde Home.")).toBeInTheDocument();
  });
});
