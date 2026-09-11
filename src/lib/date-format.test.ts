import { describe, expect, it } from "vitest";
import { formatChatMessageTime } from "./date-format";

describe("date-format", () => {
  it("formats timestamp into 2-digit hour and minute", () => {
    const timestamp = new Date("2026-01-01T12:34:00Z").getTime();
    const formatted = formatChatMessageTime(timestamp);

    expect(typeof formatted).toBe("string");
    expect(formatted.length).toBeGreaterThanOrEqual(4);
  });
});
