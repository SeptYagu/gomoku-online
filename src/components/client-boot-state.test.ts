import { describe, expect, it } from "vitest";
import { createBootGameModeReader, DEFAULT_GAME_MODE } from "./client-boot-state";

describe("client boot game mode", () => {
  it("uses the room mode for an invite URL", () => {
    const readMode = createBootGameModeReader(() => "?room=ABC123");

    expect(readMode()).toBe("room");
  });

  it("keeps the first browser snapshot after the URL changes", () => {
    let search = "?room=ABC123";
    const readMode = createBootGameModeReader(() => search);

    expect(readMode()).toBe("room");
    search = "";
    expect(readMode()).toBe("room");
  });

  it("uses but does not cache the server fallback", () => {
    let isServer = true;
    const readMode = createBootGameModeReader(() => (isServer ? undefined : "?room=ABC123"));

    expect(readMode()).toBe(DEFAULT_GAME_MODE);
    isServer = false;
    expect(readMode()).toBe("room");
  });
});
