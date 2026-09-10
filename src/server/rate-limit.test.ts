import { describe, expect, it } from "vitest";
import { FixedWindowRateLimiter } from "./rate-limit";

describe("FixedWindowRateLimiter", () => {
  it("limits one key without blocking other keys and resets after the window", () => {
    let now = 1_780_000_000_000;
    const limiter = new FixedWindowRateLimiter({ limit: 2, now: () => now, windowMs: 1_000 });

    expect(limiter.consume("client-a")).toMatchObject({ allowed: true, remaining: 1 });
    expect(limiter.consume("client-a")).toMatchObject({ allowed: true, remaining: 0 });
    expect(limiter.consume("client-a")).toMatchObject({ allowed: false, remaining: 0, retryAfterMs: 1_000 });
    expect(limiter.consume("client-b")).toMatchObject({ allowed: true, remaining: 1 });

    now += 1_001;

    expect(limiter.consume("client-a")).toMatchObject({ allowed: true, remaining: 1 });
  });

  it("does not evict and reset the key currently being checked when the map is full", () => {
    const limiter = new FixedWindowRateLimiter({ limit: 2, maxEntries: 2, windowMs: 1_000 });

    expect(limiter.consume("oldest").allowed).toBe(true);
    expect(limiter.consume("other").allowed).toBe(true);
    expect(limiter.consume("oldest")).toMatchObject({ allowed: true, remaining: 0 });
    expect(limiter.consume("oldest")).toMatchObject({ allowed: false, remaining: 0 });
  });

  it("evicts the entry closest to expiry when a new key arrives at capacity", () => {
    let now = 1_780_000_000_000;
    const limiter = new FixedWindowRateLimiter({
      limit: 1,
      maxEntries: 2,
      now: () => now,
      // Never sweep during this test, so eviction is the only thing that frees slots.
      pruneIntervalMs: 1_000_000,
      windowMs: 1_000
    });

    expect(limiter.consume("early").allowed).toBe(true);
    now += 400;
    expect(limiter.consume("late").allowed).toBe(true);
    now += 100;

    expect(limiter.consume("third").allowed).toBe(true);
    // "late" kept its slot (and its count); "early" was the closest to expiry.
    expect(limiter.consume("late")).toMatchObject({ allowed: false, remaining: 0 });
    expect(limiter.consume("early")).toMatchObject({ allowed: true, remaining: 0 });
  });

  it("defers the expired-entry sweep to the prune interval without changing results", () => {
    let now = 1_780_000_000_000;
    const limiter = new FixedWindowRateLimiter({
      limit: 1,
      now: () => now,
      pruneIntervalMs: 5_000,
      windowMs: 1_000
    });

    expect(limiter.consume("a")).toMatchObject({ allowed: true, remaining: 0 });
    expect(limiter.consume("a")).toMatchObject({ allowed: false, remaining: 0 });

    now += 1_000;
    // The window has rolled over even though the sweep has not run yet.
    expect(limiter.consume("a")).toMatchObject({ allowed: true, remaining: 0 });

    now += 5_000;
    expect(limiter.consume("b")).toMatchObject({ allowed: true, remaining: 0 });
  });

  it("stays bounded when a flood of distinct keys arrives", () => {
    const limiter = new FixedWindowRateLimiter({
      limit: 1,
      maxEntries: 3,
      pruneIntervalMs: 1_000_000,
      windowMs: 1_000
    });

    for (let index = 0; index < 200; index += 1) {
      limiter.consume(`flood-${index}`);
    }

    // The map is capped at maxEntries, so an early key was evicted and restarts fresh.
    expect(limiter.consume("flood-0")).toMatchObject({ allowed: true, remaining: 0 });
  });
});
