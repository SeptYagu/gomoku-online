type FixedWindowRateLimiterOptions = {
  limit: number;
  maxEntries?: number;
  now?: () => number;
  /**
   * Minimum gap between full sweeps for expired entries. Sweeping is pure
   * memory hygiene (an expired entry is already treated as fresh on read), so
   * it does not need to run on every `consume`.
   */
  pruneIntervalMs?: number;
  windowMs: number;
};

type FixedWindowEntry = {
  count: number;
  resetAt: number;
};

export type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  retryAfterMs: number;
};

export class FixedWindowRateLimiter {
  private readonly entries = new Map<string, FixedWindowEntry>();
  private readonly limit: number;
  private readonly maxEntries: number;
  private readonly now: () => number;
  private readonly pruneIntervalMs: number;
  private readonly windowMs: number;
  private nextPruneAt = 0;

  constructor(options: FixedWindowRateLimiterOptions) {
    this.limit = Math.max(1, Math.floor(options.limit));
    this.maxEntries = Math.max(1, Math.floor(options.maxEntries ?? 10_000));
    this.now = options.now ?? Date.now;
    this.windowMs = Math.max(1, options.windowMs);
    this.pruneIntervalMs = Math.max(0, options.pruneIntervalMs ?? this.windowMs);
  }

  consume(key: string): RateLimitResult {
    const now = this.now();
    const normalizedKey = key.trim() || "unknown";

    this.prune(now, normalizedKey);

    const current = this.entries.get(normalizedKey);
    const entry = !current || now >= current.resetAt ? { count: 0, resetAt: now + this.windowMs } : current;

    entry.count += 1;
    this.entries.set(normalizedKey, entry);

    return {
      allowed: entry.count <= this.limit,
      remaining: Math.max(0, this.limit - entry.count),
      retryAfterMs: Math.max(0, entry.resetAt - now)
    };
  }

  private prune(now: number, preservedKey: string): void {
    if (now >= this.nextPruneAt) {
      this.nextPruneAt = now + this.pruneIntervalMs;

      for (const [key, entry] of this.entries) {
        if (now >= entry.resetAt) {
          this.entries.delete(key);
        }
      }
    }

    // The key being consumed is never evicted: it is already tracked, so
    // dropping it would hand the caller a fresh window for free.
    if (this.entries.size < this.maxEntries || this.entries.has(preservedKey)) {
      return;
    }

    let oldestKey: string | null = null;
    let oldestResetAt = Number.POSITIVE_INFINITY;

    for (const [key, entry] of this.entries) {
      if (entry.resetAt < oldestResetAt) {
        oldestResetAt = entry.resetAt;
        oldestKey = key;
      }
    }

    if (oldestKey !== null) {
      this.entries.delete(oldestKey);
    }
  }
}
