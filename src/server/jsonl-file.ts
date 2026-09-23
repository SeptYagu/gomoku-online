import { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

export type JsonlReadResult<T> = {
  entries: T[];
  /** Number of non-empty lines seen (valid entries + skipped lines). */
  lineCount: number;
  /** Number of lines that were corrupt or rejected by the parser. */
  skipped: number;
};

/**
 * Reads a JSONL file line by line. Lines that fail to parse — or that the
 * caller's `parse` rejects by returning `null` — are skipped instead of
 * throwing; the caller decides whether to log `skipped`.
 */
export function readJsonlFile<T>(filePath: string, parse: (value: unknown) => T | null): JsonlReadResult<T> {
  const result: JsonlReadResult<T> = { entries: [], lineCount: 0, skipped: 0 };

  if (!existsSync(filePath)) {
    return result;
  }

  for (const line of readFileSync(filePath, "utf8").split(/\r?\n/)) {
    if (!line.trim()) {
      continue;
    }

    result.lineCount += 1;

    try {
      const entry = parse(JSON.parse(line) as unknown);

      if (entry === null) {
        result.skipped += 1;
      } else {
        result.entries.push(entry);
      }
    } catch {
      result.skipped += 1;
    }
  }

  return result;
}

export function appendJsonlLine(filePath: string, value: unknown): void {
  mkdirSync(dirname(filePath), { recursive: true });
  appendFileSync(filePath, `${JSON.stringify(value)}\n`, "utf8");
}

/**
 * Rewrites the whole file from the given values. This is the compaction path:
 * callers hand over their in-memory state (already the win-by-latest-line
 * projection of the append log), so the rewritten file has exactly one line
 * per live entry.
 *
 * The write goes through a sibling temp file + rename so a crash mid-write
 * cannot truncate the log.
 */
const sleepBuffer = new Int32Array(new SharedArrayBuffer(4));

function sleepSync(ms: number): void {
  Atomics.wait(sleepBuffer, 0, 0, ms);
}

export type AtomicRenameOptions = {
  maxAttempts?: number;
  renameFn?: (source: string, destination: string) => void;
  sleepFn?: (ms: number) => void;
};

/**
 * Attempts atomic replacement of destination with source.
 * On Windows, MoveFileEx may transiently report EPERM/EBUSY if the destination
 * was recently touched by antivirus or indexers. We retry up to maxAttempts (default 4)
 * with fixed 5ms micro-sleeps using Atomics.wait (measured ~15.1ms real elapsed time per sleep
 * under Windows 15.625ms timer quantization on idle systems; higher under CPU saturation),
 * providing a ~45ms recovery window that reliably absorbs 20ms and 30ms transient lock releases
 * and avoiding CPU busy-wait loops.
 * Persistent-lock stall equals (maxAttempts - 1) * single sleep; empirical measurements on idle systems
 * (n=150): p50 ~47ms, p90 ~50ms, with idle tails up to ~95ms; under CPU saturation the tail is unbounded
 * (measured max ~1.0s over n=360) due to OS scheduler preemption.
 * Non-transient errors (such as EACCES or ENOENT) fail fast immediately.
 */
export function atomicRenameSync(
  source: string,
  destination: string,
  options?: AtomicRenameOptions
): void {
  const rawAttempts = options?.maxAttempts;
  const maxAttempts = Number.isFinite(rawAttempts) ? Math.max(1, Math.floor(rawAttempts!)) : 4;
  const rename = options?.renameFn ?? renameSync;
  const sleep = options?.sleepFn ?? sleepSync;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      rename(source, destination);
      return;
    } catch (error: unknown) {
      const code = (error as NodeJS.ErrnoException).code;
      if ((code === "EPERM" || code === "EBUSY") && attempt < maxAttempts) {
        sleep(5);
        continue;
      }
      throw error;
    }
  }
}

export function rewriteJsonlFile(filePath: string, values: unknown[]): void {
  mkdirSync(dirname(filePath), { recursive: true });

  const body = values.length ? `${values.map((value) => JSON.stringify(value)).join("\n")}\n` : "";
  const tempPath = `${filePath}.compact.tmp`;

  writeFileSync(tempPath, body, "utf8");
  try {
    atomicRenameSync(tempPath, filePath);
  } catch (error) {
    try {
      unlinkSync(tempPath);
    } catch {
      // ignore cleanup error
    }
    throw error;
  }
}

/**
 * Counts appended lines and decides when an append-only log should be
 * compacted. Without this, an append-only JSONL log grows with every write,
 * not with the number of live entries.
 */
export class JsonlCompactionTracker {
  private appended: number;
  private readonly threshold: number;

  constructor(options: { threshold?: number; initialLines?: number } = {}) {
    this.threshold = Math.max(0, Math.floor(options.threshold ?? 0));
    this.appended = Math.max(0, Math.floor(options.initialLines ?? 0));
  }

  /** Records one appended line and reports whether compaction is now due. */
  noteAppend(): boolean {
    this.appended += 1;

    return this.threshold > 0 && this.appended >= this.threshold;
  }

  /**
   * Records that the log was rewritten to `liveLines` lines.
   * If `liveLines < threshold`, `appended` tracks total file lines up to `threshold`.
   * If `liveLines >= threshold`, the file cannot be reduced below `liveLines`,
   * so `appended` tracks the incremental growth/churn budget since compaction.
   */
  reset(liveLines: number, totalLines?: number): void {
    const live = Math.max(0, Math.floor(liveLines));
    if (this.threshold <= 0) {
      this.appended = 0;
      return;
    }

    if (live < this.threshold) {
      this.appended = totalLines !== undefined ? Math.max(0, Math.floor(totalLines)) : live;
    } else {
      const deadLines = totalLines !== undefined ? Math.max(0, Math.floor(totalLines - live)) : 0;
      this.appended = deadLines;
    }
  }
}
