import { describe, expect, it } from "vitest";
import { clearSessionPreviews, removeSessionPreview, setSessionPreview } from "./sessionPreviewMap";

describe("session preview map", () => {
  it("revokes a replaced preview", () => {
    const revoked: string[] = [];
    const first = setSessionPreview(new Map(), "asset", "blob:first", (url) => revoked.push(url));
    const second = setSessionPreview(first, "asset", "blob:second", (url) => revoked.push(url));
    expect(revoked).toEqual(["blob:first"]);
    expect(second.get("asset")).toBe("blob:second");
  });

  it("cleans one entry and the complete map", () => {
    const revoked: string[] = [];
    const map = setSessionPreview(new Map(), "a", "blob:a", (url) => revoked.push(url));
    const removed = removeSessionPreview(map, "a", (url) => revoked.push(url));
    const cleared = clearSessionPreviews(
      setSessionPreview(removed, "b", "blob:b", (url) => revoked.push(url)),
      (url) => revoked.push(url),
    );
    expect(revoked).toEqual(["blob:a", "blob:b"]);
    expect(cleared.size).toBe(0);
  });
});
