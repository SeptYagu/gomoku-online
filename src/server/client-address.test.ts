import { describe, expect, it } from "vitest";
import { isLoopbackAddress, resolveClientAddress, shouldTrustProxy } from "./client-address";

describe("resolveClientAddress", () => {
  it("ignores spoofed x-forwarded-for on a direct (untrusted) connection", () => {
    // The classic bypass: a client dials us directly and rotates a fake XFF
    // value to mint a fresh rate-limit key on every request.
    expect(
      resolveClientAddress({
        forwardedFor: "203.0.113.7",
        remoteAddress: "198.51.100.9",
        trustProxy: false
      })
    ).toBe("198.51.100.9");

    expect(
      resolveClientAddress({
        forwardedFor: "203.0.113.7",
        remoteAddress: "::ffff:127.0.0.1",
        trustProxy: false
      })
    ).toBe("::ffff:127.0.0.1");
  });

  it("uses the last forwarded hop when the proxy hop is a trusted loopback", () => {
    expect(
      resolveClientAddress({
        forwardedFor: "203.0.113.7, 198.51.100.4",
        remoteAddress: "127.0.0.1",
        trustProxy: true
      })
    ).toBe("198.51.100.4");

    // A repeated header arrives as an array; the first value is the one the
    // trusted proxy wrote, and we again take its last hop.
    expect(
      resolveClientAddress({
        forwardedFor: ["198.51.100.4, 203.0.113.7", "10.0.0.1"],
        remoteAddress: "::1",
        trustProxy: true
      })
    ).toBe("203.0.113.7");
  });

  it("keeps the transport peer even with trust enabled when that peer is not loopback", () => {
    // XFF is only meaningful for the hop we actually trust.
    expect(
      resolveClientAddress({
        forwardedFor: "203.0.113.7",
        remoteAddress: "198.51.100.9",
        trustProxy: true
      })
    ).toBe("198.51.100.9");
  });

  it("falls back to the remote address when the forwarded header is empty", () => {
    expect(
      resolveClientAddress({ forwardedFor: " ,  ", remoteAddress: "127.0.0.1", trustProxy: true })
    ).toBe("127.0.0.1");
    expect(resolveClientAddress({ remoteAddress: "   ", trustProxy: true })).toBe("unknown");
  });
});

describe("shouldTrustProxy", () => {
  it("only opts in on an explicit truthy GOMOKU_TRUST_PROXY value", () => {
    expect(shouldTrustProxy({})).toBe(false);
    expect(shouldTrustProxy({ GOMOKU_TRUST_PROXY: "" })).toBe(false);
    expect(shouldTrustProxy({ GOMOKU_TRUST_PROXY: "0" })).toBe(false);
    expect(shouldTrustProxy({ GOMOKU_TRUST_PROXY: "false" })).toBe(false);
    expect(shouldTrustProxy({ GOMOKU_TRUST_PROXY: "1" })).toBe(true);
    expect(shouldTrustProxy({ GOMOKU_TRUST_PROXY: " TRUE " })).toBe(true);
    expect(shouldTrustProxy({ GOMOKU_TRUST_PROXY: "on" })).toBe(true);
  });
});

describe("isLoopbackAddress", () => {
  it("recognizes the loopback forms node reports", () => {
    expect(isLoopbackAddress("127.0.0.1")).toBe(true);
    expect(isLoopbackAddress("::1")).toBe(true);
    expect(isLoopbackAddress("::ffff:127.0.0.1")).toBe(true);
    expect(isLoopbackAddress("198.51.100.9")).toBe(false);
  });
});
