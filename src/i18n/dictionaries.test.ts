import { describe, expect, it } from "vitest";
import { locales } from "./config";
import { dictionaries } from "./dictionaries";

describe("dictionaries", () => {
  const reference = flatten(dictionaries.en);

  it("keeps every locale structurally identical to en", () => {
    const referenceKeys = [...reference.keys()].sort();

    for (const locale of locales) {
      expect([...flatten(dictionaries[locale]).keys()].sort()).toEqual(referenceKeys);
    }
  });

  it("keeps interpolation placeholders in sync so `.replace` cannot silently no-op", () => {
    // `satisfies Dictionary` only checks that keys exist and hold a string; a
    // translation that drops `{count}` renders the literal text instead.
    const mismatches: string[] = [];

    for (const locale of locales) {
      for (const [key, text] of flatten(dictionaries[locale])) {
        const expected = placeholders(reference.get(key) ?? "").join(",");
        const actual = placeholders(text).join(",");

        if (expected !== actual) {
          mismatches.push(`${locale}.${key}: expected {${expected}} but got {${actual}}`);
        }
      }
    }

    expect(mismatches).toEqual([]);
  });

  it("has no empty translations", () => {
    const blanks: string[] = [];

    for (const locale of locales) {
      for (const [key, text] of flatten(dictionaries[locale])) {
        if (!text.trim()) {
          blanks.push(`${locale}.${key}`);
        }
      }
    }

    expect(blanks).toEqual([]);
  });
});

function flatten(value: unknown, prefix = ""): Map<string, string> {
  const entries = new Map<string, string>();

  if (typeof value === "string") {
    entries.set(prefix, value);

    return entries;
  }

  if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      for (const [childKey, childValue] of flatten(child, prefix ? `${prefix}.${key}` : key)) {
        entries.set(childKey, childValue);
      }
    }
  }

  return entries;
}

function placeholders(text: string): string[] {
  return [...text.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort();
}
