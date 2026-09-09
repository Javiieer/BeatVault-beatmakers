import { describe, expect, it } from "vitest";
import { getPathname, getQuery } from "./routing";

describe("hash routing", () => {
  it("defaults an empty hash to the dashboard", () => {
    expect(getPathname("")).toBe("/dashboard");
    expect(getQuery("").toString()).toBe("");
  });

  it("reads normal routes", () => {
    expect(getPathname("#/library")).toBe("/library");
  });

  it("separates a route query", () => {
    expect(getPathname("#/shorts?short=clip-1")).toBe("/shorts");
    expect(getQuery("#/shorts?short=clip-1").get("short")).toBe("clip-1");
  });

  it("decodes URL encoded query values", () => {
    expect(getQuery("#/library?search=dark%20orchestra").get("search")).toBe("dark orchestra");
  });

  it("preserves unknown routes", () => {
    expect(getPathname("#/future-feature")).toBe("/future-feature");
  });
});
