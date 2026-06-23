import type { Board, Cell, Point, Stone } from "./types";

export const BOARD_SIZE = 15;

const DIRECTIONS: Point[] = [
  { row: 0, col: 1 },
  { row: 1, col: 0 },
  { row: 1, col: 1 },
  { row: 1, col: -1 }
];

export function createBoard(size = BOARD_SIZE): Board {
  return Array.from({ length: size }, () => Array<Cell>(size).fill(null));
}

export function cloneBoard(board: Board): Board {
  return board.map((row) => [...row]);
}

export function isInBounds(board: Board, point: Point): boolean {
  return (
    point.row >= 0 &&
    point.col >= 0 &&
    point.row < board.length &&
    point.col < (board[point.row]?.length ?? 0)
  );
}

export function getCell(board: Board, point: Point): Cell {
  if (!isInBounds(board, point)) {
    return null;
  }

  return board[point.row][point.col];
}

export function placeStone(board: Board, point: Point, stone: Stone): Board {
  if (!isInBounds(board, point)) {
    throw new Error("Move is outside the board.");
  }

  if (board[point.row][point.col] !== null) {
    throw new Error("Move targets an occupied point.");
  }

  const nextBoard = cloneBoard(board);
  nextBoard[point.row][point.col] = stone;
  return nextBoard;
}

export function getOpponent(stone: Stone): Stone {
  return stone === "black" ? "white" : "black";
}

export function isBoardFull(board: Board): boolean {
  return board.every((row) => row.every(Boolean));
}

export function checkWin(board: Board, lastMove: Point, stone: Stone): Point[] | null {
  for (const direction of DIRECTIONS) {
    const forward = collectLine(board, lastMove, stone, direction);
    const backward = collectLine(board, lastMove, stone, {
      row: -direction.row,
      col: -direction.col
    });
    const line = [...backward.reverse(), lastMove, ...forward];

    if (line.length >= 5) {
      return line.slice(0, 5);
    }
  }

  return null;
}

function collectLine(board: Board, origin: Point, stone: Stone, step: Point): Point[] {
  const line: Point[] = [];
  let point = {
    row: origin.row + step.row,
    col: origin.col + step.col
  };

  while (isInBounds(board, point) && getCell(board, point) === stone) {
    line.push(point);
    point = {
      row: point.row + step.row,
      col: point.col + step.col
    };
  }

  return line;
}
