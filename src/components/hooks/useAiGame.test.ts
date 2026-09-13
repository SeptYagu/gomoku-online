import { describe, expect, it } from "vitest";
import { createBoard } from "@/game/board";
import type { Move } from "@/game/types";
import {
  createInitialGameState,
  createOpeningSeed,
  getAiStone,
  getCenterDistance,
  getHumanStone,
  isBetterAiWorkerResult,
  isDecisiveAiWorkerResult,
  normalizeAiWorkerResult,
  replayMoves,
  type AiWorkerDoneResult
} from "./useAiGame";

describe("useAiGame helpers", () => {
  it("computes human and AI stone colors correctly based on first player", () => {
    expect(getHumanStone("human")).toBe("black");
    expect(getAiStone("human")).toBe("white");

    expect(getHumanStone("ai")).toBe("white");
    expect(getAiStone("ai")).toBe("black");
  });

  it("generates 32-bit unsigned opening seeds", () => {
    const seed = createOpeningSeed();
    expect(Number.isInteger(seed)).toBe(true);
    expect(seed).toBeGreaterThanOrEqual(0);
    expect(seed).toBeLessThan(0x1_0000_0000);
  });

  it("normalizes worker responses with safe defaults", () => {
    const minimal = normalizeAiWorkerResult({
      type: "best",
      point: { row: 7, col: 7 }
    });

    expect(minimal.point).toEqual({ row: 7, col: 7 });
    expect(minimal.score).toBe(Number.NEGATIVE_INFINITY);
    expect(minimal.completedDepth).toBe(0);
    expect(minimal.nodes).toBe(0);
    expect(minimal.source).toBe("none");

    const full = normalizeAiWorkerResult({
      type: "done",
      point: { row: 3, col: 3 },
      score: 100,
      completedDepth: 4,
      nodes: 500,
      source: "search"
    });

    expect(full.point).toEqual({ row: 3, col: 3 });
    expect(full.score).toBe(100);
    expect(full.completedDepth).toBe(4);
    expect(full.nodes).toBe(500);
    expect(full.source).toBe("search");
  });

  it("correctly identifies decisive worker results", () => {
    expect(isDecisiveAiWorkerResult({
      point: null,
      score: 100,
      completedDepth: 4,
      nodes: 100,
      source: "opening"
    })).toBe(false);

    expect(isDecisiveAiWorkerResult({
      point: { row: 7, col: 7 },
      score: 100,
      completedDepth: 4,
      nodes: 100,
      source: "search"
    })).toBe(false);

    expect(isDecisiveAiWorkerResult({
      point: { row: 7, col: 7 },
      score: 100,
      completedDepth: 4,
      nodes: 100,
      source: "none"
    })).toBe(false);

    expect(isDecisiveAiWorkerResult({
      point: { row: 7, col: 7 },
      score: 100,
      completedDepth: 4,
      nodes: 100,
      source: "empty-shard"
    })).toBe(false);

    expect(isDecisiveAiWorkerResult({
      point: { row: 7, col: 7 },
      score: 100,
      completedDepth: 4,
      nodes: 100,
      source: "opening"
    })).toBe(true);
  });

  it("prioritizes better worker results using score, depth, nodes and center distance", () => {
    const board = createBoard();

    const resultA: AiWorkerDoneResult = {
      point: { row: 0, col: 0 },
      score: 50,
      completedDepth: 2,
      nodes: 100,
      source: "search"
    };

    const resultB: AiWorkerDoneResult = {
      point: { row: 1, col: 1 },
      score: 60,
      completedDepth: 2,
      nodes: 100,
      source: "search"
    };

    // Higher score wins
    expect(isBetterAiWorkerResult(resultB, resultA, board)).toBe(true);
    expect(isBetterAiWorkerResult(resultA, resultB, board)).toBe(false);

    // Deeper depth wins on same score
    const resultC: AiWorkerDoneResult = { ...resultA, completedDepth: 3 };
    expect(isBetterAiWorkerResult(resultC, resultA, board)).toBe(true);

    // More nodes on same score & depth
    const resultD: AiWorkerDoneResult = { ...resultA, nodes: 200 };
    expect(isBetterAiWorkerResult(resultD, resultA, board)).toBe(true);

    // Center distance tie-break
    const centerPoint = { row: 7, col: 7 };
    const cornerPoint = { row: 0, col: 0 };
    expect(getCenterDistance(centerPoint, board)).toBe(0);
    expect(getCenterDistance(cornerPoint, board)).toBe(14);

    const resultCenter: AiWorkerDoneResult = { ...resultA, point: centerPoint };
    const resultCorner: AiWorkerDoneResult = { ...resultA, point: cornerPoint };
    expect(isBetterAiWorkerResult(resultCenter, resultCorner, board)).toBe(true);
  });

  it("replays moves onto an empty board accurately", () => {
    const moves: Move[] = [
      { row: 7, col: 7, stone: "black", moveNumber: 1 },
      { row: 7, col: 8, stone: "white", moveNumber: 2 }
    ];

    const board = replayMoves(moves);
    expect(board[7][7]).toBe("black");
    expect(board[7][8]).toBe("white");
    expect(board[0][0]).toBeNull();
  });

  it("creates initial game states for local and AI modes", () => {
    // Local mode: empty board, next player black
    const localState = createInitialGameState("local", "normal", "human", 42);
    expect(localState.moves).toHaveLength(0);
    expect(localState.nextPlayer).toBe("black");
    expect(localState.status.state).toBe("playing");

    // AI mode with human first: empty board, next player black
    const aiHumanFirst = createInitialGameState("ai", "normal", "human", 42);
    expect(aiHumanFirst.moves).toHaveLength(0);
    expect(aiHumanFirst.nextPlayer).toBe("black");

    // AI mode with AI first: AI plays the 1st move (black), next player white
    const aiFirst = createInitialGameState("ai", "normal", "ai", 42);
    expect(aiFirst.moves).toHaveLength(1);
    expect(aiFirst.moves[0].stone).toBe("black");
    expect(aiFirst.nextPlayer).toBe("white");
    expect(aiFirst.status.state).toBe("playing");
  });
});
