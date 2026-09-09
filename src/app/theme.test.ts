import { describe, expect, it } from "vitest";
import { defaultTheme, parseTheme, readStoredTheme } from "./theme";

describe("theme persistence", () => {
  it.each(["classic", "ember", "ivory", "verdant"])("accepts %s", (value) => {
    expect(parseTheme(value)).toBe(value);
  });

  it.each([null, "", "invalid", 42, {}, ["ivory"]])("falls back for %s", (value) => {
    expect(parseTheme(value)).toBe(defaultTheme);
  });

  it("falls back when storage is unavailable or throws", () => {
    expect(readStoredTheme(undefined)).toBe(defaultTheme);
    expect(readStoredTheme({ getItem: () => { throw new Error("blocked"); } } as unknown as Storage)).toBe(defaultTheme);
  });

  it("reads a valid stored theme", () => {
    expect(readStoredTheme({ getItem: () => "ivory" } as unknown as Storage)).toBe("ivory");
  });
});
