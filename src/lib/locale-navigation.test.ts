import { describe, expect, it } from "vitest";
import { computeLocaleSwitchHref } from "./locale-navigation";

describe("computeLocaleSwitchHref", () => {
  it("switches root locale from /zh to /en", () => {
    expect(computeLocaleSwitchHref("/zh", "", "en")).toBe("/en");
    expect(computeLocaleSwitchHref("/zh/", "", "en")).toBe("/en");
  });

  it("switches subpath /zh/profile/p1 to /en/profile/p1", () => {
    expect(computeLocaleSwitchHref("/zh/profile/p1", "", "en")).toBe("/en/profile/p1");
  });

  it("preserves query params like /zh?room=ABC to /en?room=ABC", () => {
    expect(computeLocaleSwitchHref("/zh", "?room=ABC", "en")).toBe("/en?room=ABC");
    expect(computeLocaleSwitchHref("/zh", "room=ABC", "en")).toBe("/en?room=ABC");
  });

  it("preserves complex parameters and subpaths /zh/profile/p1?tab=history&room=ABC to /fr", () => {
    expect(
      computeLocaleSwitchHref("/zh/profile/p1", "?tab=history&room=ABC", "fr")
    ).toBe("/fr/profile/p1?tab=history&room=ABC");
  });

  it("handles paths without explicit locale prefix gracefully", () => {
    expect(computeLocaleSwitchHref("/", "", "ja")).toBe("/ja");
    expect(computeLocaleSwitchHref("/profile/p1", "?tab=history", "es")).toBe(
      "/es/profile/p1?tab=history"
    );
  });
});
