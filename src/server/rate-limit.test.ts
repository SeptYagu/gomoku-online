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
});
