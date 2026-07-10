import { describe, expect, it } from "vitest";
import type { Move } from "@/game/types";
import { createTableReplay, getTableReplayFrame, setTableReplayMove } from "./table-replay";

const moves: Move[] = [
  { col: 7, moveNumber: 1, row: 7, stone: "black" },
  { col: 8, moveNumber: 2, row: 7, stone: "white" }
];

describe("table replay", () => {
  it("opens on the final frame without sharing mutable move objects", () => {
    const replay = createTableReplay("ROOM01-1", moves);

    expect(replay.moveNumber).toBe(2);
    expect(replay.moves).not.toBe(moves);
    expect(getTableReplayFrame(replay)).toMatchObject({ lastMove: moves[1], moveNumber: 2 });
  });

  it("clamps previous, next, and slider positions while rebuilding the board", () => {
    const replay = createTableReplay("ROOM01-1", moves);
    const first = getTableReplayFrame(setTableReplayMove(replay, 1));
    const beforeStart = getTableReplayFrame(setTableReplayMove(replay, -20));
    const afterEnd = getTableReplayFrame(setTableReplayMove(replay, 20));

    expect(first.board[7][7]).toBe("black");
    expect(first.board[7][8]).toBeNull();
    expect(beforeStart.moveNumber).toBe(0);
    expect(afterEnd.moveNumber).toBe(2);
  });
});
