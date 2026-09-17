import { describe, expect, it } from "vitest";
import type { StoredActiveGame } from "@/lib/game-persistence";
import {
  canRestoreBootGame,
  createBootGameModeReader,
  DEFAULT_GAME_MODE,
  resolveBootGameMode,
  restoreBootActiveGameSnapshot
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

describe("restoreBootActiveGameSnapshot - Full board and status recovery", () => {
  it("restores empty game when moves is empty", () => {
    const emptyGame: StoredActiveGame = {
      mode: "local",
      moves: [],
      updatedAt: Date.now()
    };
    const snapshot = restoreBootActiveGameSnapshot(emptyGame);
    expect(snapshot.moves).toEqual([]);
    expect(snapshot.nextPlayer).toBe("black");
    expect(snapshot.status).toEqual({ state: "playing", nextPlayer: "black" });
    expect(snapshot.board.every(row => row.every(cell => cell === null))).toBe(true);
  });

  it("restores local 3-move game with correct stones and nextPlayer", () => {
    const localGame: StoredActiveGame = {
      mode: "local",
      moves: [
        { row: 7, col: 7, stone: "black", moveNumber: 1 },
        { row: 7, col: 8, stone: "white", moveNumber: 2 },
        { row: 8, col: 7, stone: "black", moveNumber: 3 }
      ],
      updatedAt: Date.now()
    };
    const snapshot = restoreBootActiveGameSnapshot(localGame);
    expect(snapshot.moves).toHaveLength(3);
    expect(snapshot.board[7][7]).toBe("black");
    expect(snapshot.board[7][8]).toBe("white");
    expect(snapshot.board[8][7]).toBe("black");
    expect(snapshot.nextPlayer).toBe("white");
    expect(snapshot.status).toEqual({ state: "playing", nextPlayer: "white" });
  });

  it("restores ai 2-move game with human next turn", () => {
    const aiGame: StoredActiveGame = {
      mode: "ai",
      moves: [
        { row: 7, col: 7, stone: "black", moveNumber: 1 },
        { row: 6, col: 6, stone: "white", moveNumber: 2 }
      ],
      aiDifficulty: "hard",
      firstPlayer: "human",
      openingSeed: 987654,
      updatedAt: Date.now()
    };
    const snapshot = restoreBootActiveGameSnapshot(aiGame);
    expect(snapshot.moves).toHaveLength(2);
    expect(snapshot.board[7][7]).toBe("black");
    expect(snapshot.board[6][6]).toBe("white");
    expect(snapshot.nextPlayer).toBe("black");
    expect(snapshot.status).toEqual({ state: "playing", nextPlayer: "black" });
  });

  it("restores finished game with 5-in-a-row and retains win line and winner", () => {
    const finishedGame: StoredActiveGame = {
      mode: "local",
      moves: [
        { row: 0, col: 0, stone: "black", moveNumber: 1 },
        { row: 1, col: 0, stone: "white", moveNumber: 2 },
        { row: 0, col: 1, stone: "black", moveNumber: 3 },
        { row: 1, col: 1, stone: "white", moveNumber: 4 },
        { row: 0, col: 2, stone: "black", moveNumber: 5 },
        { row: 1, col: 2, stone: "white", moveNumber: 6 },
        { row: 0, col: 3, stone: "black", moveNumber: 7 },
        { row: 1, col: 3, stone: "white", moveNumber: 8 },
        { row: 0, col: 4, stone: "black", moveNumber: 9 } // black 5 in a row!
      ],
      updatedAt: Date.now()
    };
    const snapshot = restoreBootActiveGameSnapshot(finishedGame);
    expect(snapshot.moves).toHaveLength(9);
    expect(snapshot.status.state).toBe("won");
    if (snapshot.status.state === "won") {
      expect(snapshot.status.winner).toBe("black");
      expect(snapshot.status.line).toHaveLength(5);
    }
    expect(snapshot.nextPlayer).toBe("black");
  });
});

describe("canRestoreBootGame - Guard against mode mismatch and invalid restores", () => {
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

  it("permits restore when activeGame mode exactly matches bootMode and moves > 0", () => {
    expect(canRestoreBootGame(activeAiGame, "ai")).toBe(true);
    expect(canRestoreBootGame(activeLocalGame, "local")).toBe(true);
  });

  it("blocks restore when activeGame mode mismatches bootMode (e.g. ?room= link with active AI game)", () => {
    // Crucial isolation: an active AI game must NEVER restore into 'room' or 'local' mode
    expect(canRestoreBootGame(activeAiGame, "room")).toBe(false);
    expect(canRestoreBootGame(activeAiGame, "local")).toBe(false);
    expect(canRestoreBootGame(activeLocalGame, "room")).toBe(false);
    expect(canRestoreBootGame(activeLocalGame, "ai")).toBe(false);
  });

  it("blocks restore when moves array is empty", () => {
    const emptyGame: StoredActiveGame = { ...activeAiGame, moves: [] };
    expect(canRestoreBootGame(emptyGame, "ai")).toBe(false);
  });

  it("blocks restore when activeGame is null or undefined", () => {
    expect(canRestoreBootGame(null, "local")).toBe(false);
    expect(canRestoreBootGame(undefined, "ai")).toBe(false);
  });
});
