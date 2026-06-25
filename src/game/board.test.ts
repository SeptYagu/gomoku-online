import { describe, expect, it } from "vitest";
import {
  BOARD_SIZE,
  checkWin,
  createBoard,
  getEmptyCells,
  getGameResult,
  getLegalMoves,
  getNearbyMoves,
  getOpponent,
  getWinLine,
  hasWon,
  isValidMove,
  placeStone
} from "./board";
import type { Board, Point, Stone } from "./types";

describe("board", () => {
  it("creates a 15x15 board by default with independent rows", () => {
    const board = createBoard();

    expect(board).toHaveLength(BOARD_SIZE);
    expect(board[0]).toHaveLength(BOARD_SIZE);
    expect(board.flat().every((cell) => cell === null)).toBe(true);

    board[0][0] = "black";
    expect(board[1][0]).toBeNull();
  });

  it("places stones immutably", () => {
    const board = createBoard();
    const nextBoard = placeStone(board, { row: 7, col: 7 }, "black");

    expect(board[7][7]).toBeNull();
    expect(nextBoard[7][7]).toBe("black");
  });

  it("rejects occupied points and out-of-bounds points", () => {
    const board = placeStone(createBoard(), { row: 3, col: 3 }, "black");

    expect(() => placeStone(board, { row: 3, col: 3 }, "white")).toThrow(
      "Move targets an occupied point."
    );
    expect(() => placeStone(board, { row: -1, col: 3 }, "white")).toThrow(
      "Move is outside the board."
    );
    expect(() => placeStone(board, { row: BOARD_SIZE, col: 3 }, "white")).toThrow(
      "Move is outside the board."
    );
  });

  it("validates legal, occupied, and out-of-bounds moves", () => {
    const board = placeStone(createBoard(), { row: 4, col: 4 }, "black");

    expect(isValidMove(board, { row: 4, col: 5 })).toBe(true);
    expect(isValidMove(board, { row: 4, col: 4 })).toBe(false);
    expect(isValidMove(board, { row: -1, col: 4 })).toBe(false);
    expect(isValidMove(board, { row: 4, col: BOARD_SIZE })).toBe(false);
  });

  it("enumerates empty and legal cells in row-major order", () => {
    let board = createBoard();
    board = placeStone(board, { row: 0, col: 0 }, "black");
    board = placeStone(board, { row: 7, col: 7 }, "white");

    const emptyCells = getEmptyCells(board);

    expect(emptyCells).toHaveLength(BOARD_SIZE * BOARD_SIZE - 2);
    expect(emptyCells.slice(0, 3)).toEqual([
      { row: 0, col: 1 },
      { row: 0, col: 2 },
      { row: 0, col: 3 }
    ]);
    expect(emptyCells).not.toContainEqual({ row: 0, col: 0 });
    expect(getLegalMoves(board)).toEqual(emptyCells);
  });

  it("returns center as the only nearby move on an empty board", () => {
    expect(getNearbyMoves(createBoard())).toEqual([{ row: 7, col: 7 }]);
  });

  it("returns deduplicated in-bounds nearby empty moves", () => {
    let board = createBoard();
    board = placeStone(board, { row: 7, col: 7 }, "black");
    board = placeStone(board, { row: 7, col: 8 }, "white");

    const moves = getNearbyMoves(board, 1);
    const uniqueKeys = new Set(moves.map((point) => `${point.row}:${point.col}`));

    expect(uniqueKeys.size).toBe(moves.length);
    expect(moves).not.toContainEqual({ row: 7, col: 7 });
    expect(moves).not.toContainEqual({ row: 7, col: 8 });
    expect(moves).toContainEqual({ row: 6, col: 6 });
    expect(moves).toContainEqual({ row: 8, col: 9 });
    expect(getNearbyMoves(board, 0)).toEqual([]);
  });

  it("clips nearby moves at board edges", () => {
    const board = placeStone(createBoard(), { row: 0, col: 0 }, "black");
    const moves = getNearbyMoves(board, 1);

    expect(moves).toEqual([
      { row: 0, col: 1 },
      { row: 1, col: 0 },
      { row: 1, col: 1 }
    ]);
  });

  it("detects horizontal wins", () => {
    const board = placeLine(createBoard(), { row: 6, col: 3 }, { row: 0, col: 1 }, 5, "black");

    expect(checkWin(board, { row: 6, col: 7 }, "black")).toEqual([
      { row: 6, col: 3 },
      { row: 6, col: 4 },
      { row: 6, col: 5 },
      { row: 6, col: 6 },
      { row: 6, col: 7 }
    ]);
  });

  it("detects vertical wins", () => {
    const board = placeLine(createBoard(), { row: 2, col: 9 }, { row: 1, col: 0 }, 5, "white");

    expect(getWinLine(board, { row: 6, col: 9 }, "white")).toEqual([
      { row: 2, col: 9 },
      { row: 3, col: 9 },
      { row: 4, col: 9 },
      { row: 5, col: 9 },
      { row: 6, col: 9 }
    ]);
  });

  it("detects both diagonal win directions", () => {
    const downRight = placeLine(createBoard(), { row: 4, col: 4 }, { row: 1, col: 1 }, 5, "black");
    const downLeft = placeLine(createBoard(), { row: 4, col: 10 }, { row: 1, col: -1 }, 5, "white");

    expect(hasWon(downRight, { row: 8, col: 8 }, "black")).toBe(true);
    expect(getWinLine(downLeft, { row: 8, col: 6 }, "white")).toEqual([
      { row: 4, col: 10 },
      { row: 5, col: 9 },
      { row: 6, col: 8 },
      { row: 7, col: 7 },
      { row: 8, col: 6 }
    ]);
  });

  it("returns the full long line and keeps lastMove in six-in-a-row wins", () => {
    const board = placeLine(createBoard(), { row: 6, col: 3 }, { row: 0, col: 1 }, 6, "black");
    const line = checkWin(board, { row: 6, col: 8 }, "black");

    expect(line).toHaveLength(6);
    expect(line).toContainEqual({ row: 6, col: 8 });
  });

  it("finds a long win when the last move is in the middle", () => {
    const board = placeLine(createBoard(), { row: 1, col: 1 }, { row: 1, col: 1 }, 6, "white");

    expect(getWinLine(board, { row: 3, col: 3 }, "white")).toEqual([
      { row: 1, col: 1 },
      { row: 2, col: 2 },
      { row: 3, col: 3 },
      { row: 4, col: 4 },
      { row: 5, col: 5 },
      { row: 6, col: 6 }
    ]);
  });

  it("does not report wins for four, gaps, empty origins, or opponent origins", () => {
    const four = placeLine(createBoard(), { row: 2, col: 2 }, { row: 0, col: 1 }, 4, "black");
    let gap = createBoard();
    gap = placeStone(gap, { row: 5, col: 1 }, "white");
    gap = placeStone(gap, { row: 5, col: 2 }, "white");
    gap = placeStone(gap, { row: 5, col: 4 }, "white");
    gap = placeStone(gap, { row: 5, col: 5 }, "white");
    gap = placeStone(gap, { row: 5, col: 6 }, "white");

    expect(getWinLine(four, { row: 2, col: 5 }, "black")).toBeNull();
    expect(getWinLine(gap, { row: 5, col: 6 }, "white")).toBeNull();
    expect(getWinLine(createBoard(), { row: 7, col: 7 }, "black")).toBeNull();
    expect(getWinLine(four, { row: 2, col: 5 }, "white")).toBeNull();
  });

  it("returns won, draw, and playing game results", () => {
    const wonBoard = placeLine(createBoard(), { row: 9, col: 1 }, { row: 0, col: 1 }, 5, "black");
    const drawBoard: Board = [
      ["black", "white", "black"],
      ["white", "black", "white"],
      ["white", "black", "white"]
    ];
    const playingBoard = placeStone(createBoard(), { row: 7, col: 7 }, "white");

    expect(getGameResult(wonBoard, { row: 9, col: 5 }, "black")).toMatchObject({
      state: "won",
      winner: "black"
    });
    expect(getGameResult(drawBoard, { row: 2, col: 2 }, "white")).toEqual({ state: "draw" });
    expect(getGameResult(playingBoard, { row: 7, col: 7 }, "white")).toEqual({
      state: "playing",
      nextPlayer: "black"
    });
  });

  it("gets the opponent stone", () => {
    expect(getOpponent("black")).toBe("white");
    expect(getOpponent("white")).toBe("black");
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
