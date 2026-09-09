import { describe, expect, it } from "vitest";
import { usagePercent, usageStatus } from "./plans";
describe("plan usage", () => {
  it("caps percentages and classifies limits", () => {
    expect(usagePercent({ used: 12, limit: 10 })).toBe(100);
    expect(usageStatus({ used: 8, limit: 10 })).toBe("attention");
    expect(usageStatus({ used: 10, limit: 10 })).toBe("full");
  });
});
