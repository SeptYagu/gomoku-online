import { describe, expect, it } from "vitest";
import type { StoredActiveGame } from "@/lib/game-persistence";
import {
  createBootGameModeReader,
  DEFAULT_GAME_MODE,
  resolveBootGameMode
} from "./client-boot-state";

describe("resolveBootGameMode - Four-tier priority resolution", () => {
  const activeAiGame: StoredActiveGame = {
    mode: "ai",
    moves: [{ row: 7, col: 7, stone: "black", moveNumber: 1 }],
    aiDifficulty: "hard",
    firstPlayer: "human",
    openingSeed: 12345,
    updatedAt: Date.now()
  };

  const activeLocalGame: StoredActiveGame = {
    mode: "local",
    moves: [{ row: 7, col: 7, stone: "black", moveNumber: 1 }],
    updatedAt: Date.now()
  };

  it("Priority 1: URL ?room= parameter takes highest precedence", () => {
    // Even if active AI game exists and workspace was local, URL ?room= forces room
    expect(resolveBootGameMode("?room=ABC123", activeAiGame, "local")).toBe("room");
    expect(resolveBootGameMode("?other=1&room=XYZ", activeLocalGame, "ai")).toBe("room");
  });

  it("Priority 2: Active game with moves > 0 restores game mode", () => {
    // No room in URL -> active AI game restores to 'ai' even if selected workspace was 'room'
    expect(resolveBootGameMode("", activeAiGame, "room")).toBe("ai");
    expect(resolveBootGameMode("", activeLocalGame, "room")).toBe("local");
  });

  it("Priority 2: Empty active game moves (0 moves) falls through to Priority 3", () => {
    const emptyActiveGame: StoredActiveGame = {
      mode: "ai",
      moves: [],
      aiDifficulty: "normal",
      firstPlayer: "human",
      openingSeed: 1,
      updatedAt: Date.now()
    };
    expect(resolveBootGameMode("", emptyActiveGame, "room")).toBe("room");
    expect(resolveBootGameMode("", emptyActiveGame, "local")).toBe("local");
  });

  it("Priority 3: Selected workspace retains unstarted lobby or AI mode", () => {
    // Online lobby with 0 moves (no room in URL, no active game) stays in 'room'
    expect(resolveBootGameMode("", null, "room")).toBe("room");
    // AI mode with 0 moves stays in 'ai'
    expect(resolveBootGameMode("", null, "ai")).toBe("ai");
    // Local mode stays in 'local'
    expect(resolveBootGameMode("", null, "local")).toBe("local");
  });

  it("Priority 4: Defaults to 'local' when nothing is specified", () => {
    expect(resolveBootGameMode("", null, null)).toBe(DEFAULT_GAME_MODE);
    expect(resolveBootGameMode(undefined, null, null)).toBe(DEFAULT_GAME_MODE);
  });
});

describe("client boot game mode reader caching", () => {
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
