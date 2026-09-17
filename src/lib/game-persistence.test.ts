import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Move } from "@/game/types";
import {
  ACTIVE_GAME_STORAGE_KEY,
  clearActiveGame,
  clearSelectedWorkspace,
  isValidActiveGame,
  readActiveGame,
  readSelectedWorkspace,
  saveActiveAiGame,
  saveActiveLocalGame,
  saveSelectedWorkspace,
  SELECTED_WORKSPACE_STORAGE_KEY,
  type StoredAiGameSession,
  type StoredLocalGameSession
} from "./game-persistence";

describe("game-persistence validation", () => {
  const validMoves: Move[] = [
    { row: 7, col: 7, stone: "black", moveNumber: 1 },
    { row: 7, col: 8, stone: "white", moveNumber: 2 },
    { row: 8, col: 8, stone: "black", moveNumber: 3 }
  ];

  it("validates a well-formed local game session", () => {
    const validLocal: StoredLocalGameSession = {
      mode: "local",
      moves: validMoves,
      updatedAt: Date.now()
    };
    expect(isValidActiveGame(validLocal)).toBe(true);
  });

  it("validates a well-formed AI game session", () => {
    const validAi: StoredAiGameSession = {
      mode: "ai",
      moves: validMoves,
      aiDifficulty: "expert",
      firstPlayer: "human",
      openingSeed: 123456,
      updatedAt: Date.now()
    };
    expect(isValidActiveGame(validAi)).toBe(true);
  });

  it("rejects non-object or null data", () => {
    expect(isValidActiveGame(null)).toBe(false);
    expect(isValidActiveGame(undefined)).toBe(false);
    expect(isValidActiveGame("string")).toBe(false);
    expect(isValidActiveGame(123)).toBe(false);
  });

  it("rejects invalid mode or updatedAt", () => {
    expect(isValidActiveGame({ mode: "room", moves: [], updatedAt: Date.now() })).toBe(false);
    expect(isValidActiveGame({ mode: "local", moves: [], updatedAt: "invalid" })).toBe(false);
    expect(isValidActiveGame({ mode: "local", moves: [], updatedAt: Number.NaN })).toBe(false);
  });

  it("rejects coordinates outside 0..14 or non-integers", () => {
    const outOfBounds: StoredLocalGameSession = {
      mode: "local",
      moves: [{ row: -1, col: 7, stone: "black", moveNumber: 1 }],
      updatedAt: Date.now()
    };
    expect(isValidActiveGame(outOfBounds)).toBe(false);

    const outOfBoundsHigh: StoredLocalGameSession = {
      mode: "local",
      moves: [{ row: 15, col: 7, stone: "black", moveNumber: 1 }],
      updatedAt: Date.now()
    };
    expect(isValidActiveGame(outOfBoundsHigh)).toBe(false);

    const floatCoord: StoredLocalGameSession = {
      mode: "local",
      moves: [{ row: 7.5, col: 7, stone: "black", moveNumber: 1 }],
      updatedAt: Date.now()
    };
    expect(isValidActiveGame(floatCoord)).toBe(false);
  });

  it("rejects first move not being black", () => {
    const whiteFirst: StoredLocalGameSession = {
      mode: "local",
      moves: [{ row: 7, col: 7, stone: "white", moveNumber: 1 }],
      updatedAt: Date.now()
    };
    expect(isValidActiveGame(whiteFirst)).toBe(false);
  });

  it("rejects consecutive moves of the same color", () => {
    const sameColorConsecutive: StoredLocalGameSession = {
      mode: "local",
      moves: [
        { row: 7, col: 7, stone: "black", moveNumber: 1 },
        { row: 8, col: 8, stone: "black", moveNumber: 2 }
      ],
      updatedAt: Date.now()
    };
    expect(isValidActiveGame(sameColorConsecutive)).toBe(false);
  });

  it("rejects moves overlapping on the same coordinate", () => {
    const overlapMoves: StoredLocalGameSession = {
      mode: "local",
      moves: [
        { row: 7, col: 7, stone: "black", moveNumber: 1 },
        { row: 7, col: 7, stone: "white", moveNumber: 2 }
      ],
      updatedAt: Date.now()
    };
    expect(isValidActiveGame(overlapMoves)).toBe(false);
  });

  it("rejects non-sequential move numbers", () => {
    const badSequence: StoredLocalGameSession = {
      mode: "local",
      moves: [
        { row: 7, col: 7, stone: "black", moveNumber: 1 },
        { row: 7, col: 8, stone: "white", moveNumber: 3 }
      ],
      updatedAt: Date.now()
    };
    expect(isValidActiveGame(badSequence)).toBe(false);
  });

  it("rejects invalid AI settings", () => {
    const badDiff: Record<string, unknown> = {
      mode: "ai",
      moves: validMoves,
      aiDifficulty: "godlike",
      firstPlayer: "human",
      openingSeed: 12345,
      updatedAt: Date.now()
    };
    expect(isValidActiveGame(badDiff)).toBe(false);

    const badPlayer: Record<string, unknown> = {
      mode: "ai",
      moves: validMoves,
      aiDifficulty: "normal",
      firstPlayer: "spectator",
      openingSeed: 12345,
      updatedAt: Date.now()
    };
    expect(isValidActiveGame(badPlayer)).toBe(false);

    const badSeed: Record<string, unknown> = {
      mode: "ai",
      moves: validMoves,
      aiDifficulty: "normal",
      firstPlayer: "human",
      openingSeed: Number.NaN,
      updatedAt: Date.now()
    };
    expect(isValidActiveGame(badSeed)).toBe(false);
  });
});

class MemoryStorage implements Storage {
  private store = new Map<string, string>();

  get length() {
    return this.store.size;
  }

  clear(): void {
    this.store.clear();
  }

  getItem(key: string): string | null {
    return this.store.get(key) ?? null;
  }

  key(index: number): string | null {
    return Array.from(this.store.keys())[index] ?? null;
  }

  removeItem(key: string): void {
    this.store.delete(key);
  }

  setItem(key: string, value: string): void {
    this.store.set(key, String(value));
  }
}

type GlobalWithOptionalWindow = {
  window?: {
    sessionStorage: Storage;
  };
};

describe("game-persistence storage lifecycle", () => {
  beforeEach(() => {
    const storage = new MemoryStorage();
    (globalThis as GlobalWithOptionalWindow).window = {
      sessionStorage: storage
    };
  });

  afterEach(() => {
    delete (globalThis as GlobalWithOptionalWindow).window;
  });

  it("saves and reads local game correctly, and clears active game", () => {
    const moves: Move[] = [
      { row: 7, col: 7, stone: "black", moveNumber: 1 },
      { row: 8, col: 8, stone: "white", moveNumber: 2 }
    ];

    saveActiveLocalGame(moves);
    const loaded = readActiveGame();

    expect(loaded).not.toBeNull();
    expect(loaded?.mode).toBe("local");
    expect(loaded?.moves).toEqual(moves);

    clearActiveGame();
    expect(readActiveGame()).toBeNull();
  });

  it("saves and reads AI game correctly", () => {
    const moves: Move[] = [{ row: 7, col: 7, stone: "black", moveNumber: 1 }];

    saveActiveAiGame(moves, "hard", "ai", 99999);
    const loaded = readActiveGame();

    expect(loaded).not.toBeNull();
    expect(loaded?.mode).toBe("ai");
    if (loaded?.mode === "ai") {
      expect(loaded.aiDifficulty).toBe("hard");
      expect(loaded.firstPlayer).toBe("ai");
      expect(loaded.openingSeed).toBe(99999);
    }
  });

  it("clears storage when saving empty moves", () => {
    saveActiveLocalGame([{ row: 7, col: 7, stone: "black", moveNumber: 1 }]);
    expect(readActiveGame()).not.toBeNull();

    saveActiveLocalGame([]);
    expect(readActiveGame()).toBeNull();
    expect(window.sessionStorage.getItem(ACTIVE_GAME_STORAGE_KEY)).toBeNull();
  });

  it("recovers silently and cleans up when JSON is corrupted", () => {
    window.sessionStorage.setItem(ACTIVE_GAME_STORAGE_KEY, "{corrupted-json...");
    expect(readActiveGame()).toBeNull();
    expect(window.sessionStorage.getItem(ACTIVE_GAME_STORAGE_KEY)).toBeNull();
  });

  it("recovers silently and cleans up when content fails validation", () => {
    window.sessionStorage.setItem(
      ACTIVE_GAME_STORAGE_KEY,
      JSON.stringify({ mode: "local", moves: [{ row: 99, col: 99 }] })
    );
    expect(readActiveGame()).toBeNull();
    expect(window.sessionStorage.getItem(ACTIVE_GAME_STORAGE_KEY)).toBeNull();
  });

  it("handles selected workspace persistence lifecycle", () => {
    expect(readSelectedWorkspace()).toBeNull();

    saveSelectedWorkspace("room");
    expect(readSelectedWorkspace()).toBe("room");

    saveSelectedWorkspace("ai");
    expect(readSelectedWorkspace()).toBe("ai");

    saveSelectedWorkspace("local");
    expect(readSelectedWorkspace()).toBe("local");

    clearSelectedWorkspace();
    expect(readSelectedWorkspace()).toBeNull();

    // Invalid workspace fallback
    window.sessionStorage.setItem(SELECTED_WORKSPACE_STORAGE_KEY, "invalid-workspace");
    expect(readSelectedWorkspace()).toBeNull();
  });
});
