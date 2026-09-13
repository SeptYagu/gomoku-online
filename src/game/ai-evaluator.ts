import {
  BOARD_SIZE,
  WIN_STONE_COUNT,
  getOpponent,
  isInBounds,
  isValidMove,
  placeStone
} from "./board";
import type { Board, Point, Stone } from "./types";

export type ThreatSummary = {
  wins: number;
  openFours: number;
  simpleFours: number;
  openThrees: number;
  score: number;
};

export type EvaluationWindow = {
  points: Point[];
};

export const DIRECTIONS: Point[] = [
  { row: 0, col: 1 },
  { row: 1, col: 0 },
  { row: 1, col: 1 },
  { row: 1, col: -1 }
];

export const WIN_SCORE = 1_000_000_000;
export const FORK_SCORE = 6_000_000;
export const OPEN_FOUR_THREAT_SCORE = 7_500_000;
export const SIMPLE_FOUR_THREAT_SCORE = 1_150_000;
export const OPEN_THREE_THREAT_SCORE = 92_000;
export const DOUBLE_THREAT_SCORE = 2_400_000;
export const SIMPLE_FOUR_OPEN_THREE_SCORE = 1_650_000;
export const DOUBLE_OPEN_THREE_SCORE = 850_000;

export const ZOBRIST_STONES = createZobristStoneTable();
export const ZOBRIST_STONES_LOCK = createZobristStoneTable(11_337);
export const ZOBRIST_SIDE_TO_MOVE: Record<Stone, number> = {
  black: splitMix32(8_001),
  white: splitMix32(8_002)
};
export const ZOBRIST_SIDE_TO_MOVE_LOCK: Record<Stone, number> = {
  black: splitMix32(18_001),
  white: splitMix32(18_002)
};

export const SEARCH_WINDOWS = createEvaluationWindows();
export const WINDOWS_BY_CELL = createWindowsByCell(SEARCH_WINDOWS);

export function createZobristStoneTable(initialSeed = 2_025): Record<Stone, number[][]> {
  let seed = initialSeed;
  const table = {
    black: [] as number[][],
    white: [] as number[][]
  };

  for (const stone of ["black", "white"] as const) {
    for (let row = 0; row < BOARD_SIZE; row += 1) {
      const values: number[] = [];

      for (let col = 0; col < BOARD_SIZE; col += 1) {
        seed += 1;
        values.push(splitMix32(seed));
      }

      table[stone].push(values);
    }
  }

  return table;
}

export function splitMix32(seed: number): number {
  let value = (seed + 0x9e3779b9) >>> 0;
  value = Math.imul(value ^ (value >>> 16), 0x85ebca6b) >>> 0;
  value = Math.imul(value ^ (value >>> 13), 0xc2b2ae35) >>> 0;

  return (value ^ (value >>> 16)) >>> 0;
}

export function getBoardHash(board: Board): number {
  let hash = 0;

  for (let rowIndex = 0; rowIndex < board.length; rowIndex += 1) {
    const row = board[rowIndex];

    for (let col = 0; col < row.length; col += 1) {
      const cell = row[col];

      if (cell) {
        hash = (hash ^ (ZOBRIST_STONES[cell][rowIndex]?.[col] ?? 0)) >>> 0;
      }
    }
  }

  return hash;
}

export function addStoneHash(hash: number, point: Point, stone: Stone): number {
  return (hash ^ (ZOBRIST_STONES[stone][point.row]?.[point.col] ?? 0)) >>> 0;
}

export function addStoneHashLock(hash: number, point: Point, stone: Stone): number {
  return (hash ^ (ZOBRIST_STONES_LOCK[stone][point.row]?.[point.col] ?? 0)) >>> 0;
}

export function getTranspositionKey(positionHash: number, currentStone: Stone): number {
  return (positionHash ^ ZOBRIST_SIDE_TO_MOVE[currentStone]) >>> 0;
}

export function getTranspositionLock(positionHash: number, currentStone: Stone): number {
  return (positionHash ^ ZOBRIST_SIDE_TO_MOVE_LOCK[currentStone]) >>> 0;
}

export function getPointKey(point: Point): string {
  return `${point.row}:${point.col}`;
}

export function getPointIndex(point: Point): number {
  return point.row * BOARD_SIZE + point.col;
}

export function pointFromIndex(index: number): Point {
  return {
    row: Math.floor(index / BOARD_SIZE),
    col: index % BOARD_SIZE
  };
}

export function isInBoundsForSize(point: Point): boolean {
  return point.row >= 0 && point.col >= 0 && point.row < BOARD_SIZE && point.col < BOARD_SIZE;
}

export function getBoardCenter(): Point {
  const center = Math.floor(BOARD_SIZE / 2);
  return { row: center, col: center };
}

export function createEvaluationWindows(): EvaluationWindow[] {
  const windows: EvaluationWindow[] = [];

  for (const direction of DIRECTIONS) {
    for (let row = 0; row < BOARD_SIZE; row += 1) {
      for (let col = 0; col < BOARD_SIZE; col += 1) {
        const points = getWindowPoints({ row, col }, direction);

        if (points) {
          windows.push({ points });
        }
      }
    }
  }

  return windows;
}

export function createWindowsByCell(windows: EvaluationWindow[]): number[][] {
  const map = Array.from({ length: BOARD_SIZE * BOARD_SIZE }, () => [] as number[]);

  windows.forEach((window, index) => {
    for (const point of window.points) {
      map[getPointIndex(point)].push(index);
    }
  });

  return map;
}

export function scoreStonePlacementPoint(point: Point): number {
  const center = Math.floor(BOARD_SIZE / 2);
  const centerDistance = Math.abs(point.row - center) + Math.abs(point.col - center);

  return Math.max(0, 18 - centerDistance);
}

export function scorePattern(stones: number, openEnds: number): number {
  if (stones >= 5) {
    return WIN_SCORE;
  }

  if (stones === 4 && openEnds === 2) {
    return 420_000;
  }

  if (stones === 4 && openEnds === 1) {
    return 96_000;
  }

  if (stones === 4) {
    return 14_000;
  }

  if (stones === 3 && openEnds === 2) {
    return 22_000;
  }

  if (stones === 3 && openEnds === 1) {
    return 2_600;
  }

  if (stones === 3) {
    return 420;
  }

  if (stones === 2 && openEnds === 2) {
    return 850;
  }

  if (stones === 2 && openEnds === 1) {
    return 130;
  }

  return openEnds > 0 ? 12 : 2;
}

export function getWindowPoints(start: Point, direction: Point): Point[] | null {
  const points = Array.from({ length: 5 }, (_, index) => ({
    row: start.row + direction.row * index,
    col: start.col + direction.col * index
  }));

  return points.every((point) => isInBoundsForSize(point)) ? points : null;
}

export function getWindowOpenEnds(board: Board, points: Point[]): number {
  const start = points[0];
  const end = points[points.length - 1];
  const direction = {
    row: points[1].row - points[0].row,
    col: points[1].col - points[0].col
  };
  const before = {
    row: start.row - direction.row,
    col: start.col - direction.col
  };
  const after = {
    row: end.row + direction.row,
    col: end.col + direction.col
  };

  return (
    Number(isInBounds(board, before) && board[before.row][before.col] === null) +
    Number(isInBounds(board, after) && board[after.row][after.col] === null)
  );
}

export function scoreWindow(board: Board, points: Point[], stone: Stone): number {
  const opponent = getOpponent(stone);
  let stones = 0;

  for (const point of points) {
    const cell = board[point.row][point.col];

    if (cell === opponent) {
      return 0;
    }

    if (cell === stone) {
      stones += 1;
    }
  }

  if (stones === 0) {
    return 0;
  }

  const start = points[0];
  const end = points[points.length - 1];
  const direction = {
    row: points[1].row - points[0].row,
    col: points[1].col - points[0].col
  };
  const before = {
    row: start.row - direction.row,
    col: start.col - direction.col
  };
  const after = {
    row: end.row + direction.row,
    col: end.col + direction.col
  };
  const openEnds =
    Number(isInBounds(board, before) && board[before.row][before.col] === null) +
    Number(isInBounds(board, after) && board[after.row][after.col] === null);

  return scorePattern(stones, openEnds);
}

export function scoreWindowsThroughPoint(board: Board, point: Point, stone: Stone, direction: Point): number {
  let score = 0;

  for (let offset = -4; offset <= 0; offset += 1) {
    const start = {
      row: point.row + direction.row * offset,
      col: point.col + direction.col * offset
    };
    const points = getWindowPoints(start, direction);

    if (points?.some((candidate) => candidate.row === point.row && candidate.col === point.col)) {
      score += scoreWindow(board, points, stone);
    }
  }

  return score;
}

export function scoreBoardForStone(board: Board, stone: Stone): number {
  let score = 0;

  for (const direction of DIRECTIONS) {
    for (let row = 0; row < board.length; row += 1) {
      for (let col = 0; col < board[row].length; col += 1) {
        const points = getWindowPoints({ row, col }, direction);

        if (points) {
          score += scoreWindow(board, points, stone);
        }
      }
    }
  }

  return score;
}

export function scoreStonePlacement(board: Board, stone: Stone): number {
  const center = Math.floor(BOARD_SIZE / 2);
  let score = 0;

  for (let row = 0; row < board.length; row += 1) {
    for (let col = 0; col < board[row].length; col += 1) {
      if (board[row][col] !== stone) {
        continue;
      }

      const centerDistance = Math.abs(row - center) + Math.abs(col - center);
      score += Math.max(0, 18 - centerDistance);
    }
  }

  return score;
}

export function countDirection(
  board: Board,
  origin: Point,
  stone: Stone,
  step: Point
): { count: number; open: boolean } {
  let count = 0;
  let point = { row: origin.row + step.row, col: origin.col + step.col };

  while (isInBounds(board, point)) {
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

export function scorePointForPlacedStone(board: Board, point: Point, stone: Stone): number {
  return DIRECTIONS.reduce((score, direction) => {
    const forward = countDirection(board, point, stone, direction);
    const backward = countDirection(board, point, stone, {
      row: -direction.row,
      col: -direction.col
    });
    const total = forward.count + backward.count + 1;
    const openEnds = Number(forward.open) + Number(backward.open);

    return score + scorePattern(total, openEnds) * 1.4 + scoreWindowsThroughPoint(board, point, stone, direction);
  }, 0);
}

export function scorePointForStone(board: Board, point: Point, stone: Stone): number {
  if (!isValidMove(board, point)) {
    return Number.NEGATIVE_INFINITY;
  }

  const nextBoard = placeStone(board, point, stone);

  return scorePointForPlacedStone(nextBoard, point, stone);
}

export function createThreatSummary(): ThreatSummary {
  return {
    wins: 0,
    openFours: 0,
    simpleFours: 0,
    openThrees: 0,
    score: 0
  };
}

export function hasForcingThreat(summary: ThreatSummary): boolean {
  return summary.wins > 0 || summary.openFours > 0 || summary.simpleFours > 0 || summary.openThrees > 0;
}

export function getThreatScore(summary: ThreatSummary): number {
  const forcingThreats = summary.openFours + summary.simpleFours;
  let score =
    summary.wins * WIN_SCORE +
    summary.openFours * OPEN_FOUR_THREAT_SCORE +
    summary.simpleFours * SIMPLE_FOUR_THREAT_SCORE +
    summary.openThrees * OPEN_THREE_THREAT_SCORE;

  if (forcingThreats >= 2) {
    score += DOUBLE_THREAT_SCORE;
  }

  if (summary.simpleFours > 0 && summary.openThrees > 0) {
    score += SIMPLE_FOUR_OPEN_THREE_SCORE;
  }

  if (summary.openThrees >= 2) {
    score += DOUBLE_OPEN_THREE_SCORE;
  }

  return score;
}

export function getCappedThreatScore(summary: ThreatSummary): number {
  return Math.min(summary.score, OPEN_FOUR_THREAT_SCORE * 2);
}

export function addWindowThreat(board: Board, points: Point[], stone: Stone, summary: ThreatSummary): void {
  const opponent = getOpponent(stone);
  let stones = 0;
  let empties = 0;

  for (const point of points) {
    const cell = board[point.row][point.col];

    if (cell === opponent) {
      return;
    }

    if (cell === stone) {
      stones += 1;
    } else {
      empties += 1;
    }
  }

  if (stones >= 5) {
    return;
  }

  const openEnds = getWindowOpenEnds(board, points);

  if (stones === 4 && empties === 1) {
    if (openEnds === 2) {
      summary.openFours += 1;
    } else {
      summary.simpleFours += 1;
    }
    return;
  }

  if (stones === 3 && empties === 2 && openEnds === 2) {
    summary.openThrees += 1;
  }
}

export function addWindowThreatsThroughPoint(
  board: Board,
  point: Point,
  stone: Stone,
  direction: Point,
  summary: ThreatSummary
): void {
  for (let offset = -4; offset <= 0; offset += 1) {
    const start = {
      row: point.row + direction.row * offset,
      col: point.col + direction.col * offset
    };
    const points = getWindowPoints(start, direction);

    if (!points?.some((candidate) => candidate.row === point.row && candidate.col === point.col)) {
      continue;
    }

    addWindowThreat(board, points, stone, summary);
  }
}

export function getThreatSummaryForPlacedStone(board: Board, point: Point, stone: Stone): ThreatSummary {
  const summary = createThreatSummary();

  for (const direction of DIRECTIONS) {
    const forward = countDirection(board, point, stone, direction);
    const backward = countDirection(board, point, stone, {
      row: -direction.row,
      col: -direction.col
    });
    const total = forward.count + backward.count + 1;
    const openEnds = Number(forward.open) + Number(backward.open);

    if (total >= WIN_STONE_COUNT) {
      summary.wins += 1;
    } else if (total === 4 && openEnds === 2) {
      summary.openFours += 1;
    } else if (total === 4 && openEnds === 1) {
      summary.simpleFours += 1;
    } else if (total === 3 && openEnds === 2) {
      summary.openThrees += 1;
    }

    addWindowThreatsThroughPoint(board, point, stone, direction, summary);
  }

  summary.score = getThreatScore(summary);

  return summary;
}

export function getThreatSummaryAfterMove(board: Board, point: Point, stone: Stone): ThreatSummary {
  if (!isValidMove(board, point)) {
    return createThreatSummary();
  }

  const nextBoard = placeStone(board, point, stone);

  return getThreatSummaryForPlacedStone(nextBoard, point, stone);
}

export function scoreAiMove(board: Board, point: Point, aiStone: Stone): number {
  if (!isValidMove(board, point)) {
    return Number.NEGATIVE_INFINITY;
  }

  const opponent = getOpponent(aiStone);
  const center = Math.floor(BOARD_SIZE / 2);
  const centerDistance = Math.abs(point.row - center) + Math.abs(point.col - center);
  const attackThreat = getThreatSummaryAfterMove(board, point, aiStone);
  const defenseThreat = getThreatSummaryAfterMove(board, point, opponent);

  return (
    scorePointForStone(board, point, aiStone) * 1.7 +
    scorePointForStone(board, point, opponent) * 1.28 +
    getCappedThreatScore(attackThreat) * 0.045 +
    getCappedThreatScore(defenseThreat) * 0.036 +
    Math.max(0, 28 - centerDistance * 2)
  );
}

export function evaluateBoard(board: Board, aiStone: Stone): number {
  const opponent = getOpponent(aiStone);

  return (
    scoreBoardForStone(board, aiStone) -
    scoreBoardForStone(board, opponent) * 1.12 +
    scoreStonePlacement(board, aiStone) -
    scoreStonePlacement(board, opponent) * 0.8
  );
}
