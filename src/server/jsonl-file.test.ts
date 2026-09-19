import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { appendJsonlLine, atomicRenameSync, JsonlCompactionTracker, readJsonlFile, rewriteJsonlFile } from "./jsonl-file";

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

  describe("atomicRenameSync", () => {
    it("retries on transient EPERM/EBUSY and succeeds when lock clears", () => {
      let attempts = 0;
      const sleeps: number[] = [];
      const renameFn = vi.fn(() => {
        attempts += 1;
        if (attempts === 1) {
          const err = new Error("EPERM: operation not permitted") as NodeJS.ErrnoException;
          err.code = "EPERM";
          throw err;
        }
      });
      const sleepFn = vi.fn((ms: number) => {
        sleeps.push(ms);
      });

      expect(() =>
        atomicRenameSync("temp.tmp", "target.jsonl", {
          renameFn,
          sleepFn
        })
      ).not.toThrow();

      expect(attempts).toBe(2);
      expect(renameFn).toHaveBeenCalledTimes(2);
      expect(sleeps).toEqual([5]);
    });

    it("fails fast on non-transient errors like EACCES without retrying", () => {
      let attempts = 0;
      const sleepFn = vi.fn();
      const renameFn = vi.fn(() => {
        attempts += 1;
        const err = new Error("EACCES: permission denied") as NodeJS.ErrnoException;
        err.code = "EACCES";
        throw err;
      });

      expect(() =>
        atomicRenameSync("temp.tmp", "target.jsonl", {
          maxAttempts: 3,
          renameFn,
          sleepFn
        })
      ).toThrow("EACCES");

      expect(attempts).toBe(1);
      expect(sleepFn).not.toHaveBeenCalled();
    });

    it("throws after exhausting maxAttempts when EPERM persists and bounds total sleep", () => {
      let attempts = 0;
      const sleeps: number[] = [];
      const renameFn = vi.fn(() => {
        attempts += 1;
        const err = new Error("EPERM: operation not permitted") as NodeJS.ErrnoException;
        err.code = "EPERM";
        throw err;
      });
      const sleepFn = vi.fn((ms: number) => {
        sleeps.push(ms);
      });

      expect(() =>
        atomicRenameSync("temp.tmp", "target.jsonl", {
          maxAttempts: 2,
          renameFn,
          sleepFn
        })
      ).toThrow("EPERM");

      expect(attempts).toBe(2);
      expect(sleeps).toEqual([5]);
      // Total sleep requested is bounded to <= 20ms (1 * 5ms = 5ms)
      expect(sleeps.reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(20);
    });

    it("bounds total synchronous sleep during retries to well below event loop stall thresholds", () => {
      const waitSpy = vi.spyOn(Atomics, "wait");
      const t0 = Date.now();
      let attempts = 0;
      const renameFn = vi.fn(() => {
        attempts += 1;
        const err = new Error("EBUSY: resource busy") as NodeJS.ErrnoException;
        err.code = "EBUSY";
        throw err;
      });

      try {
        expect(() =>
          atomicRenameSync("temp.tmp", "target.jsonl", {
            renameFn
          })
        ).toThrow("EBUSY");

        const elapsed = Date.now() - t0;
        expect(attempts).toBe(2);
        expect(waitSpy).toHaveBeenCalledTimes(1);
        expect(waitSpy).toHaveBeenCalledWith(expect.any(Int32Array), 0, 0, 5);
        expect(elapsed).toBeLessThan(300);
      } finally {
        waitSpy.mockRestore();
      }
    });

    it("treats maxAttempts <= 0 as at least 1 attempt", () => {
      let attempts = 0;
      const renameFn = vi.fn(() => {
        attempts += 1;
        const err = new Error("EPERM: operation not permitted") as NodeJS.ErrnoException;
        err.code = "EPERM";
        throw err;
      });

      expect(() =>
        atomicRenameSync("temp.tmp", "target.jsonl", {
          maxAttempts: 0,
          renameFn
        })
      ).toThrow("EPERM");

      expect(attempts).toBe(1);
    });

    it("cleans up temp file when rewriteJsonlFile fails to rename", () => {
      const tempDir = mkdtempSync(join(tmpdir(), "gomoku-jsonl-fail-"));

      try {
        const targetDir = join(tempDir, "existing-dir");
        mkdirSync(targetDir);

        expect(() => rewriteJsonlFile(targetDir, [{ id: "fail" }])).toThrow();
        expect(existsSync(`${targetDir}.compact.tmp`)).toBe(false);
      } finally {
        rmSync(tempDir, { force: true, recursive: true });
      }
    });
  });
});
