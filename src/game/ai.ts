import {
  BOARD_SIZE,
  getGameResult,
  getLegalMoves,
  getNearbyMoves,
  getOpponent,
  isValidMove,
  placeStone
} from "./board";
import type { Board, Point, Stone } from "./types";

export type AiDifficulty = "easy" | "normal";

type ChooseAiMoveOptions = {
  difficulty: AiDifficulty;
  random?: () => number;
};

const DIRECTIONS: Point[] = [
  { row: 0, col: 1 },
  { row: 1, col: 0 },
  { row: 1, col: 1 },
  { row: 1, col: -1 }
];

export function chooseAiMove(
  board: Board,
  aiStone: Stone,
  { difficulty, random = Math.random }: ChooseAiMoveOptions
): Point | null {
  const candidates = getCandidateMoves(board);

  if (candidates.length === 0) {
    return null;
  }

  const opponent = getOpponent(aiStone);
  const winningMove = findImmediateWin(board, candidates, aiStone);

  if (winningMove) {
    return winningMove;
  }

  const blockingMove = findImmediateWin(board, candidates, opponent);

  if (blockingMove) {
    return blockingMove;
  }

  if (difficulty === "easy") {
    return candidates[Math.floor(random() * candidates.length) % candidates.length];
  }

  return chooseBestScoredMove(board, candidates, aiStone);
}

export function scoreAiMove(board: Board, point: Point, aiStone: Stone): number {
  if (!isValidMove(board, point)) {
    return Number.NEGATIVE_INFINITY;
  }

  const opponent = getOpponent(aiStone);
  const center = Math.floor(BOARD_SIZE / 2);
  const centerDistance = Math.abs(point.row - center) + Math.abs(point.col - center);

  return (
    scorePointForStone(board, point, aiStone) +
    scorePointForStone(board, point, opponent) * 1.15 +
    Math.max(0, 18 - centerDistance)
  );
}

function getCandidateMoves(board: Board): Point[] {
  const nearbyMoves = getNearbyMoves(board, 2);

  if (nearbyMoves.length > 0) {
    return nearbyMoves;
  }

  return getLegalMoves(board);
}

function findImmediateWin(board: Board, candidates: Point[], stone: Stone): Point | null {
  for (const point of candidates) {
    if (!isValidMove(board, point)) {
      continue;
    }

    const result = getGameResult(placeStone(board, point, stone), point, stone);

    if (result.state === "won") {
      return point;
    }
  }

  return null;
}

function chooseBestScoredMove(board: Board, candidates: Point[], aiStone: Stone): Point {
  return candidates.reduce((best, point) => {
    const score = scoreAiMove(board, point, aiStone);
    const bestScore = scoreAiMove(board, best, aiStone);

    if (score > bestScore) {
      return point;
    }

    if (score === bestScore && comparePointsByCenter(point, best) < 0) {
      return point;
    }

    return best;
  }, candidates[0]);
}

function scorePointForStone(board: Board, point: Point, stone: Stone): number {
  return DIRECTIONS.reduce((score, direction) => {
    const forward = countDirection(board, point, stone, direction);
    const backward = countDirection(board, point, stone, {
      row: -direction.row,
      col: -direction.col
    });
    const total = forward.count + backward.count + 1;
    const openEnds = Number(forward.open) + Number(backward.open);

    return score + scorePattern(total, openEnds);
  }, 0);
}

function countDirection(
  board: Board,
  origin: Point,
  stone: Stone,
  step: Point
): { count: number; open: boolean } {
  let count = 0;
  let point = { row: origin.row + step.row, col: origin.col + step.col };

  while (point.row >= 0 && point.col >= 0 && point.row < board.length && point.col < board[0].length) {
    const cell = board[point.row][point.col];

    if (cell === stone) {
      count += 1;
      point = { row: point.row + step.row, col: point.col + step.col };
      continue;
    }

    return { count, open: cell === null };
  }

  return { count, open: false };
}

function scorePattern(stones: number, openEnds: number): number {
  if (stones >= 5) {
    return 100000;
  }

  if (stones === 4 && openEnds === 2) {
    return 14000;
  }

  if (stones === 4 && openEnds === 1) {
    return 5000;
  }

  if (stones === 3 && openEnds === 2) {
    return 1300;
  }

  if (stones === 3 && openEnds === 1) {
    return 260;
  }

  if (stones === 2 && openEnds === 2) {
    return 120;
  }

  if (stones === 2 && openEnds === 1) {
    return 30;
  }

  return openEnds > 0 ? 4 : 0;
}

function comparePointsByCenter(a: Point, b: Point): number {
  const center = Math.floor(BOARD_SIZE / 2);
  const aDistance = Math.abs(a.row - center) + Math.abs(a.col - center);
  const bDistance = Math.abs(b.row - center) + Math.abs(b.col - center);

  return aDistance - bDistance || a.row - b.row || a.col - b.col;
}
