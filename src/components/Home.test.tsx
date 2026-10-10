import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Home } from "./Home";

vi.mock("./HomeComposer", () => ({ HomeComposer: () => null }));
vi.mock("../data/homePosts", () => ({ readLocalHomePosts: async () => [] }));

beforeEach(() => {
  localStorage.clear();
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
