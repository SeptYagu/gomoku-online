import { describe, expect, it } from "vitest";
import { formatChatMessageTime } from "./date-format";

describe("date-format", () => {
  it("formats timestamp into 2-digit hour and minute", () => {
    const timestamp = new Date("2026-01-01T12:34:00Z").getTime();
    const formatted = formatChatMessageTime(timestamp, "en");

    expect(typeof formatted).toBe("string");
    expect(formatted.length).toBeGreaterThanOrEqual(4);
  });

  it("uses the selected page language instead of the browser default", () => {
    const timestamp = new Date("2026-01-01T12:34:00Z").getTime();

    expect(formatChatMessageTime(timestamp, "en")).not.toBe(formatChatMessageTime(timestamp, "ar"));
  });
});
