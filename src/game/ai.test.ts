import { describe, expect, it } from "vitest";
import { chooseAiMove } from "./ai";
import { createBoard, getLegalMoves, placeStone } from "./board";
import type { Board, Point, Stone } from "./types";

describe("ai", () => {
  it("plays the center on an empty board", () => {
    expect(chooseAiMove(createBoard(), "white", { difficulty: "easy", random: () => 0.9 })).toEqual({
      row: 7,
      col: 7
    });
  });

  it("takes an immediate winning move before random play", () => {
    const board = placeLine(createBoard(), { row: 6, col: 4 }, { row: 0, col: 1 }, 4, "white");

    expect(chooseAiMove(board, "white", { difficulty: "easy", random: () => 0.9 })).toEqual({
      row: 6,
      col: 3
    });
  });

  it("blocks the opponent's open four", () => {
    const board = placeLine(createBoard(), { row: 8, col: 5 }, { row: 0, col: 1 }, 4, "black");

    expect(chooseAiMove(board, "white", { difficulty: "easy", random: () => 0.4 })).toEqual({
      row: 8,
      col: 4
    });
  });

  it("always returns a legal empty point", () => {
    let board = createBoard();
    board = placeStone(board, { row: 7, col: 7 }, "black");
    board = placeStone(board, { row: 7, col: 8 }, "white");
    board = placeStone(board, { row: 8, col: 7 }, "black");

    const move = chooseAiMove(board, "white", { difficulty: "easy", random: () => 0.99 });

    expect(move).not.toBeNull();
    expect(getLegalMoves(board)).toContainEqual(move);
  });

  it("normal difficulty prefers a stronger scored extension", () => {
    let board = createBoard();
    board = placeStone(board, { row: 7, col: 7 }, "white");
    board = placeStone(board, { row: 7, col: 8 }, "white");
    board = placeStone(board, { row: 3, col: 3 }, "black");

    expect(chooseAiMove(board, "white", { difficulty: "normal" })).toEqual({
      row: 7,
      col: 6
    });
  });
});

function placeLine(
  board: Board,
  start: Point,
  step: Point,
  count: number,
  stone: Stone
): Board {
  let nextBoard = board;

  for (let offset = 0; offset < count; offset += 1) {
    nextBoard = placeStone(
      nextBoard,
      {
        row: start.row + step.row * offset,
        col: start.col + step.col * offset
      },
      stone
    );
  }

  return nextBoard;
}
