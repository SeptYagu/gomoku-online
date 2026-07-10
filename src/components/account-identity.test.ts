import { describe, expect, it } from "vitest";
import { isAccountIdentityReady } from "./account-identity";

describe("account identity readiness", () => {
  it("blocks room identity actions until stored account restoration finishes", () => {
    expect(isAccountIdentityReady("loading")).toBe(false);
    expect(isAccountIdentityReady("registered")).toBe(true);
    expect(isAccountIdentityReady("guest")).toBe(true);
    expect(isAccountIdentityReady("error")).toBe(true);
  });
});
