import { describe, expect, it, vi } from "vitest";
import { ApiClient } from "../api/client";
import { ProjectRepository } from "./projectRepository";
import type { Project } from "../types";

const project: Project = { id: "local-1", name: "Idea", genre: "Trap", bpm: 120, key: "C", modified: "now", status: "Draft", color: "#fff", tracks: 0 };
describe("ProjectRepository", () => {
  it("falls back when API is unavailable and creates locally", async () => {
    const api = new ApiClient("http://api", 10, vi.fn(() => Promise.reject(new Error("offline"))) as typeof fetch);
    const repository = new ProjectRepository(api);
    expect((await repository.list()).source).toBe("fallback");
    expect((await repository.create(project)).source).toBe("fallback");
  });
  it("creates through the API and returns the mapped project", async () => {
    const fetcher = vi.fn(() => Promise.resolve(new Response(JSON.stringify({ ok: true, data: { id: "p1", ownerId: "o", title: "Idea", status: "draft", updatedAt: "now" } }))));
    const result = await new ProjectRepository(new ApiClient("http://api", 100, fetcher as typeof fetch)).create(project);
    expect(result.source).toBe("api");
    expect(result.project.id).toBe("p1");
  });
});
