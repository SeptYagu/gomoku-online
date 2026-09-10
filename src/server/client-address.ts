/**
 * Client address resolution for rate limiting.
 *
 * `x-forwarded-for` is attacker-controlled on a direct connection, so trusting
 * it by default lets a client mint a fresh rate-limit key per request and
 * bypass throttling entirely. We therefore only consult XFF when the operator
 * has explicitly declared that the app sits behind a trusted reverse proxy
 * (`GOMOKU_TRUST_PROXY=1`), and even then only when the transport peer is
 * loopback — i.e. the immediate hop really is that proxy.
 */

const TRUST_PROXY_ENV = "GOMOKU_TRUST_PROXY";

export function isLoopbackAddress(address: string): boolean {
  return address === "127.0.0.1" || address === "::1" || address === "::ffff:127.0.0.1";
}

export function shouldTrustProxy(env: Record<string, string | undefined> = process.env): boolean {
  const raw = env[TRUST_PROXY_ENV]?.trim().toLowerCase();

  return raw === "1" || raw === "true" || raw === "yes" || raw === "on";
}

export function resolveClientAddress(input: {
  forwardedFor?: string | string[];
  remoteAddress: string;
  trustProxy: boolean;
}): string {
  const remoteAddress = input.remoteAddress.trim() || "unknown";

  if (!input.trustProxy || !isLoopbackAddress(remoteAddress)) {
    return remoteAddress;
  }

  const forwardedValue = Array.isArray(input.forwardedFor) ? input.forwardedFor[0] : input.forwardedFor;
  // Proxies append to the right, so the last hop is the closest thing to the
  // real client that we can still attribute.
  const forwardedClient = forwardedValue?.split(",").at(-1)?.trim();

  return forwardedClient || remoteAddress;
}
