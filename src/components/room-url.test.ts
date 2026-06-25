import { describe, expect, it } from "vitest";
import { clearRoomUrlFromHref, getRoomUrlFromHref } from "./room-url";

describe("room URL helpers", () => {
  it("adds a normalized room code while preserving the locale path", () => {
    expect(getRoomUrlFromHref("https://gomoku.example/en", " ab12cd ")).toBe("https://gomoku.example/en?room=AB12CD");
  });

  it("updates an existing room code and preserves unrelated query params", () => {
    expect(getRoomUrlFromHref("https://gomoku.example/en?theme=dark&room=OLD", "new777")).toBe(
      "https://gomoku.example/en?theme=dark&room=NEW777"
    );
  });

  it("clears the room code without changing other query params", () => {
    expect(clearRoomUrlFromHref("https://gomoku.example/en?theme=dark&room=AB12CD")).toBe(
      "https://gomoku.example/en?theme=dark"
    );
  });
});
