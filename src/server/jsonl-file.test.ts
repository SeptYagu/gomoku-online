import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { appendJsonlLine, JsonlCompactionTracker, readJsonlFile, rewriteJsonlFile } from "./jsonl-file";

describe("jsonl-file", () => {
  it("reads valid lines in order and counts corrupt ones instead of throwing", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "gomoku-jsonl-"));

    try {
      const filePath = join(tempDir, "log.jsonl");

      writeFileSync(
        filePath,
        [
          JSON.stringify({ id: "one" }),
          "{ this is not json",
          "",
          JSON.stringify({ id: "two" }),
          JSON.stringify({ nothing: "useful" }),
          "   "
        ].join("\n"),
        "utf8"
      );

      const result = readJsonlFile<{ id: string }>(filePath, (value) =>
        typeof (value as { id?: unknown }).id === "string" ? (value as { id: string }) : null
      );

      expect(result.entries).toEqual([{ id: "one" }, { id: "two" }]);
      expect(result.lineCount).toBe(4);
      expect(result.skipped).toBe(2);
    } finally {
      rmSync(tempDir, { force: true, recursive: true });
    }
  });

  it("treats a missing file as empty rather than an error", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "gomoku-jsonl-missing-"));

    try {
      expect(readJsonlFile(join(tempDir, "nope.jsonl"), () => null)).toEqual({
        entries: [],
        lineCount: 0,
        skipped: 0
      });
    } finally {
      rmSync(tempDir, { force: true, recursive: true });
    }
  });

  it("rewrites the log in place and leaves no temp file behind", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "gomoku-jsonl-rewrite-"));

    try {
      const filePath = join(tempDir, "log.jsonl");

      appendJsonlLine(filePath, { id: "stale" });
      appendJsonlLine(filePath, { id: "stale" });
      rewriteJsonlFile(filePath, [{ id: "fresh" }, { id: "second" }]);

      expect(readFileSync(filePath, "utf8")).toBe(`${JSON.stringify({ id: "fresh" })}\n${JSON.stringify({ id: "second" })}\n`);
      expect(readJsonlFile(filePath, () => null).lineCount).toBe(2);
      expect(() => readFileSync(`${filePath}.compact.tmp`, "utf8")).toThrow();
    } finally {
      rmSync(tempDir, { force: true, recursive: true });
    }
  });

  it("counts appended lines and asks for compaction once the threshold is reached", () => {
    const tracker = new JsonlCompactionTracker({ threshold: 3 });

    expect(tracker.noteAppend()).toBe(false);
    expect(tracker.noteAppend()).toBe(false);
    expect(tracker.noteAppend()).toBe(true);

    tracker.reset(1);

    expect(tracker.noteAppend()).toBe(false);
    expect(tracker.noteAppend()).toBe(true);
  });

  it("never asks for compaction when the threshold is disabled", () => {
    const tracker = new JsonlCompactionTracker({ threshold: 0 });

    for (let i = 0; i < 10; i += 1) {
      expect(tracker.noteAppend()).toBe(false);
    }
  });
});
