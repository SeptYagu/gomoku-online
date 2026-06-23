import { describe, expect, it } from "vitest";
import { BOARD_SIZE, checkWin, createBoard, getOpponent, placeStone } from "./board";

describe("board", () => {
  it("creates a 15x15 board by default", () => {
    const board = createBoard();

    expect(board).toHaveLength(BOARD_SIZE);
    expect(board[0]).toHaveLength(BOARD_SIZE);
    expect(board.flat().every((cell) => cell === null)).toBe(true);
  });

  it("places stones immutably", () => {
    const board = createBoard();
    const nextBoard = placeStone(board, { row: 7, col: 7 }, "black");

    expect(board[7][7]).toBeNull();
    expect(nextBoard[7][7]).toBe("black");
  });

  it("rejects occupied points", () => {
    const board = placeStone(createBoard(), { row: 3, col: 3 }, "black");

    expect(() => placeStone(board, { row: 3, col: 3 }, "white")).toThrow(
      "Move targets an occupied point."
    );
  });

  it("detects horizontal wins", () => {
    let board = createBoard();
    for (let col = 3; col < 8; col += 1) {
      board = placeStone(board, { row: 6, col }, "black");
    }

    expect(checkWin(board, { row: 6, col: 7 }, "black")).toHaveLength(5);
  });

  it("detects vertical wins", () => {
    let board = createBoard();
    for (let row = 2; row < 7; row += 1) {
      board = placeStone(board, { row, col: 9 }, "white");
    }

    expect(checkWin(board, { row: 6, col: 9 }, "white")).toHaveLength(5);
  });

  it("detects diagonal wins", () => {
    let board = createBoard();
    for (let offset = 0; offset < 5; offset += 1) {
      board = placeStone(board, { row: 4 + offset, col: 4 + offset }, "black");
    }

    expect(checkWin(board, { row: 8, col: 8 }, "black")).toHaveLength(5);
  });

  it("gets the opponent stone", () => {
    expect(getOpponent("black")).toBe("white");
    expect(getOpponent("white")).toBe("black");
  });
});
