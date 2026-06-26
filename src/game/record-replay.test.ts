import { describe, expect, it } from "vitest";

import { clampReplayMove, replayBoardAtMove } from "./record-replay";
import type { Move } from "./types";

describe("record replay", () => {
  const moves: Move[] = [
    { col: 7, moveNumber: 1, row: 7, stone: "black" },
    { col: 8, moveNumber: 2, row: 7, stone: "white" },
    { col: 7, moveNumber: 3, row: 8, stone: "black" }
  ];

  it("replays a saved game record to a requested move", () => {
    const board = replayBoardAtMove(moves, 2);

    expect(board[7][7]).toBe("black");
    expect(board[7][8]).toBe("white");
    expect(board[8][7]).toBeNull();
  });

  it("clamps replay move indexes to the saved move range", () => {
    expect(clampReplayMove(-1, moves)).toBe(0);
    expect(clampReplayMove(99, moves)).toBe(3);
    expect(clampReplayMove(Number.NaN, moves)).toBe(3);
  });
});
