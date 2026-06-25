import type { Board, Cell, GameStatus, Point, Stone } from "./types";

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

export function isValidMove(board: Board, point: Point): boolean {
  return isInBounds(board, point) && board[point.row][point.col] === null;
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

export function getEmptyCells(board: Board): Point[] {
  const cells: Point[] = [];

  for (let row = 0; row < board.length; row += 1) {
    for (let col = 0; col < board[row].length; col += 1) {
      const point = { row, col };

      if (isValidMove(board, point)) {
        cells.push(point);
      }
    }
  }

  return cells;
}

export function getLegalMoves(board: Board): Point[] {
  return getEmptyCells(board);
}

export function getNearbyMoves(board: Board, radius = 2): Point[] {
  const normalizedRadius = Math.max(0, Math.floor(radius));
  const occupiedCells: Point[] = [];
  const candidates = new Map<string, Point>();

  for (let row = 0; row < board.length; row += 1) {
    for (let col = 0; col < board[row].length; col += 1) {
      if (board[row][col] !== null) {
        occupiedCells.push({ row, col });
      }
    }
  }

  if (occupiedCells.length === 0) {
    const center = {
      row: Math.floor(board.length / 2),
      col: Math.floor((board[0]?.length ?? 0) / 2)
    };

    return isValidMove(board, center) ? [center] : [];
  }

  for (const origin of occupiedCells) {
    for (let rowOffset = -normalizedRadius; rowOffset <= normalizedRadius; rowOffset += 1) {
      for (let colOffset = -normalizedRadius; colOffset <= normalizedRadius; colOffset += 1) {
        const point = {
          row: origin.row + rowOffset,
          col: origin.col + colOffset
        };

        if (isValidMove(board, point)) {
          candidates.set(`${point.row}:${point.col}`, point);
        }
      }
    }
  }

  return [...candidates.values()].sort((a, b) => a.row - b.row || a.col - b.col);
}

export function checkWin(board: Board, lastMove: Point, stone: Stone): Point[] | null {
  return getWinLine(board, lastMove, stone);
}

export function getWinLine(board: Board, lastMove: Point, stone: Stone): Point[] | null {
  if (!isInBounds(board, lastMove) || getCell(board, lastMove) !== stone) {
    return null;
  }

  for (const direction of DIRECTIONS) {
    const forward = collectLine(board, lastMove, stone, direction);
    const backward = collectLine(board, lastMove, stone, {
      row: -direction.row,
      col: -direction.col
    });
    const line = [...backward.reverse(), lastMove, ...forward];

    if (line.length >= 5) {
      return line;
    }
  }

  return null;
}

export function hasWon(board: Board, lastMove: Point, stone: Stone): boolean {
  return getWinLine(board, lastMove, stone) !== null;
}

export function getGameResult(board: Board, lastMove: Point, stone: Stone): GameStatus {
  const line = getWinLine(board, lastMove, stone);

  if (line) {
    return { state: "won", winner: stone, line };
  }

  if (isBoardFull(board)) {
    return { state: "draw" };
  }

  return { state: "playing", nextPlayer: getOpponent(stone) };
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
