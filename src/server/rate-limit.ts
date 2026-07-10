type FixedWindowRateLimiterOptions = {
  limit: number;
  maxEntries?: number;
  now?: () => number;
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
  private readonly windowMs: number;

  constructor(options: FixedWindowRateLimiterOptions) {
    this.limit = Math.max(1, Math.floor(options.limit));
    this.maxEntries = Math.max(1, Math.floor(options.maxEntries ?? 10_000));
    this.now = options.now ?? Date.now;
    this.windowMs = Math.max(1, options.windowMs);
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
    for (const [key, entry] of this.entries) {
      if (now >= entry.resetAt) {
        this.entries.delete(key);
      }
    }

    if (this.entries.size < this.maxEntries || this.entries.has(preservedKey)) {
      return;
    }

    const oldest = [...this.entries.entries()].sort((left, right) => left[1].resetAt - right[1].resetAt)[0];

    if (oldest) {
      this.entries.delete(oldest[0]);
    }
  }
}
