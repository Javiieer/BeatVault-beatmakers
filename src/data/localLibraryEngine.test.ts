import { describe, expect, it } from "vitest";
import { createImportQueue, importErrorMessage, localAvailabilityForImport, metadataFromFile, updateImportItem, validateImportItem } from "./localLibraryEngine";

function file(name: string, size: number, type: string): File {
  return new File([new Uint8Array(size)], name, { type, lastModified: 1 });
}

describe("local library engine", () => {
  it("creates and validates a multiple-file queue", () => {
    const queue = createImportQueue([file("kick.wav", 4, "audio/wav"), file("bad.txt", 4, "text/plain")]);
    expect(queue).toHaveLength(2);
    expect(validateImportItem(queue[0]).status).toBe("validating");
    expect(validateImportItem(queue[1]).status).toBe("rejected");
  });
  it("normalizes metadata without inventing technical values", () => {
    expect(metadataFromFile(file("beat.mp3", 3, "audio/mpeg"), null)).toMatchObject({ name: "beat.mp3", mime: "audio/mpeg", durationSeconds: null, fileReference: "session-only" });
  });
  it("returns an accessible validation message", () => {
    expect(importErrorMessage("too-large")).toContain("500 MB");
  });
  it("deduplicates the same file selected twice", () => {
    const item = file("loop.wav", 4, "audio/wav");
    expect(createImportQueue([item, item])).toHaveLength(1);
  });
  it("updates one queue item without changing the others", () => {
    const queue = createImportQueue([file("a.wav", 4, "audio/wav"), file("b.wav", 4, "audio/wav")]);
    const next = updateImportItem(queue, queue[0].id, { status: "ready" });
    expect(next[0].status).toBe("ready");
    expect(next[1].status).toBe("pending");
  });
  it("maps local availability without claiming durable persistence", () => {
    expect(localAvailabilityForImport("ready", true)).toBe("session-preview");
    expect(localAvailabilityForImport("ready", false)).toBe("metadata-only");
    expect(localAvailabilityForImport("preview-unavailable", false)).toBe("preview-unavailable");
    expect(localAvailabilityForImport("rejected", false)).toBe("rejected");
  });
});
