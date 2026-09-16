import { describe, expect, it } from "vitest";
import { createBoard } from "@/game/board";
import type { Move } from "@/game/types";
import {
  computeAiThinkingSeconds,
  createAiCountdownScheduler,
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

  it("computes countdown seconds accurately, bounds upper limits, and handles non-finite inputs", () => {
    // 5000ms total limit
    expect(computeAiThinkingSeconds(5000, 0)).toBe(5);
    expect(computeAiThinkingSeconds(5000, 500)).toBe(5);
    expect(computeAiThinkingSeconds(5000, 1000)).toBe(4);
    expect(computeAiThinkingSeconds(5000, 1001)).toBe(4);
    expect(computeAiThinkingSeconds(5000, 2500)).toBe(3);
    expect(computeAiThinkingSeconds(5000, 3999)).toBe(2);
    expect(computeAiThinkingSeconds(5000, 4000)).toBe(1);
    expect(computeAiThinkingSeconds(5000, 4800)).toBe(1);

    // Over-time or elapsed beyond limit clamps to 1 until turn ends
    expect(computeAiThinkingSeconds(5000, 5000)).toBe(1);
    expect(computeAiThinkingSeconds(5000, 6000)).toBe(1);

    // Negative elapsed (wall clock step back) does not exceed max seconds (P3-5 fix)
    expect(computeAiThinkingSeconds(5000, -1)).toBe(5);
    expect(computeAiThinkingSeconds(5000, -2500)).toBe(5);
    expect(computeAiThinkingSeconds(5000, -60000)).toBe(5);

    // Non-finite and boundary values
    expect(computeAiThinkingSeconds(Number.NaN, 0)).toBe(1);
    expect(computeAiThinkingSeconds(5000, Number.NaN)).toBe(5);
    expect(computeAiThinkingSeconds(Number.POSITIVE_INFINITY, 0)).toBe(1);
    expect(computeAiThinkingSeconds(5000, Number.POSITIVE_INFINITY)).toBe(1);

    // 1000ms normal limit
    expect(computeAiThinkingSeconds(1000, 0)).toBe(1);
    expect(computeAiThinkingSeconds(1000, 500)).toBe(1);

    // 30000ms insane limit
    expect(computeAiThinkingSeconds(30000, 0)).toBe(30);
    expect(computeAiThinkingSeconds(30000, 1000)).toBe(29);
  });

  it("manages countdown timer lifecycle, ticks, and guards against supersession", () => {
    let currentTime = 1000;
    let nextHandle = 1;
    const activeTimers = new Map<number, () => void>();
    const clearedHandles: number[] = [];
    const samplingIntervals: number[] = [];

    const mockSetInterval = (cb: () => void, ms: number): number => {
      samplingIntervals.push(ms);
      const handle = nextHandle++;
      activeTimers.set(handle, cb);
      return handle;
    };

    const mockClearInterval = (handle: number): void => {
      clearedHandles.push(handle);
      activeTimers.delete(handle);
    };

    const scheduler = createAiCountdownScheduler({
      setInterval: mockSetInterval,
      clearInterval: mockClearInterval,
      now: () => currentTime,
      samplingIntervalMs: 250
    });

    const ticks: number[] = [];
    const req1 = scheduler.start(5000, (sec) => ticks.push(sec));

    expect(scheduler.isRunning()).toBe(true);
    expect(ticks).toEqual([5]);
    expect(samplingIntervals).toEqual([250]);
    expect(activeTimers.size).toBe(1);
    const handle1 = [...activeTimers.keys()][0];

    // Tick at 250ms (same second -> no duplicate tick)
    currentTime += 250;
    activeTimers.get(handle1)!();
    expect(ticks).toEqual([5]);

    // Advance 1000ms from start -> second changes to 4
    currentTime = 2000;
    activeTimers.get(handle1)!();
    expect(ticks).toEqual([5, 4]);

    // Supersession: start request 2 before request 1 finishes
    const ticks2: number[] = [];
    currentTime = 2100;
    const req2 = scheduler.start(3000, (sec) => ticks2.push(sec));

    expect(ticks2).toEqual([3]);
    expect(clearedHandles).toContain(handle1);
    expect(activeTimers.size).toBe(1);
    const handle2 = [...activeTimers.keys()][0];

    // Stale request 1 attempts to stop: must be a no-op and NOT kill request 2's timer (P3-3 guard)
    scheduler.stop(req1);
    expect(scheduler.isRunning()).toBe(true);
    expect(activeTimers.has(handle2)).toBe(true);

    // Request 2 continues to tick successfully
    currentTime += 1000;
    activeTimers.get(handle2)!();
    expect(ticks2).toEqual([3, 2]);

    // Active request 2 stops: timer is cleared and scheduler stops
    scheduler.stop(req2);
    expect(scheduler.isRunning()).toBe(false);
    expect(activeTimers.size).toBe(0);
    expect(clearedHandles).toContain(handle2);
  });
});
