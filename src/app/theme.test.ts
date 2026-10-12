import { describe, expect, it } from "vitest";
import { contrastRatio, customThemeStyle, defaultCustomTheme, defaultTheme, isHexColor, parseCustomTheme, parseTheme, readableAccent, readableText, readStoredTheme, toRgb } from "./theme";

describe("theme preferences", () => {
  it.each(["dark", "light", "custom"])("accepts %s", value => {
    expect(parseTheme(value)).toBe(value);
  });

  it("maps legacy presets to the supported modes", () => {
    expect(parseTheme("ivory")).toBe("light");
    expect(parseTheme("classic")).toBe("dark");
    expect(parseTheme("ember")).toBe("dark");
    expect(parseTheme("verdant")).toBe("dark");
  });

  it.each([null, "", "invalid", 42, {}, ["light"]])("falls back for %s", value => {
    expect(parseTheme(value)).toBe(defaultTheme);
  });

  it("validates RGB picker colors and falls back per invalid field", () => {
    expect(isHexColor("#12aBef")).toBe(true);
    expect(isHexColor("red")).toBe(false);
    expect(parseCustomTheme({ background: "#ffffff", card: "invalid" })).toEqual({ ...defaultCustomTheme, background: "#ffffff" });
    expect(toRgb("#12abef")).toBe("rgb(18 171 239)");
  });

  it("handles unavailable storage and reads legacy values", () => {
    expect(readStoredTheme(undefined)).toBe(defaultTheme);
    expect(readStoredTheme({ getItem: () => { throw new Error("blocked"); } } as unknown as Storage)).toBe(defaultTheme);
    expect(readStoredTheme({ getItem: () => "ivory" } as unknown as Storage)).toBe("light");
  });

  it.each([
    { background: "#000000", card: "#ffffff", button: "#ffff00", link: "#ffffff" },
    { background: "#ffffff", card: "#000000", button: "#ff00ff", link: "#000000" },
    { background: "#f00000", card: "#00f000", button: "#0000ff", link: "#111111" },
  ])("keeps foreground colors readable for extreme palette %o", palette => {
    const style = customThemeStyle(palette);
    const effectiveColor = (rgb: string) => `#${rgb.match(/[\d.]+/g)!.slice(0, 3).map(value => Number(value).toString(16).padStart(2, "0")).join("")}`;
    const background = effectiveColor(style["--bg"]);
    const card = effectiveColor(style["--surface"]);
    expect(contrastRatio(style["--text"], background)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(style["--surface-text"], card)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(style["--on-primary"], palette.button)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(style["--link"], background)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(style["--surface-link"], card)).toBeGreaterThanOrEqual(4.5);
    for (const token of ["success", "warning", "error", "info", "violet"]) {
      expect(contrastRatio(style[`--${token}`], background)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(style[`--surface-${token}`], card)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("does not alter a link color when it already passes contrast", () => {
    expect(readableAccent("#174f9b", ["#e9eef2", "#ffffff"])).toBe("#174f9b");
    expect(contrastRatio(readableText("#ffffff"), "#ffffff")).toBeGreaterThanOrEqual(4.5);
  });

  it("softens neon surface colors and pulls clashing card hues toward the background", () => {
    const style = customThemeStyle({ background: "#f00000", card: "#00f000", button: "#0000ff", link: "#ffffff" });
    expect(style["--bg"]).not.toBe(toRgb("#f00000"));
    expect(style["--surface"]).not.toBe(toRgb("#00f000"));
    expect(style["--primary"]).toBe(toRgb("#0000ff"));
  });
});
