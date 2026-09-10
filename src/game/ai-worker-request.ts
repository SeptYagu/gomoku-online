import type { AiDifficulty, AiMoveSource, AiRootCandidateShard } from "./ai";
import { BOARD_SIZE } from "./board";
import type { Board, Move, Point, Stone } from "./types";

export type AiWorkerRequest = {
  board: Board;
  moves: Move[];
  aiStone: Stone;
  difficulty: AiDifficulty;
  timeLimitMs: number;
  rootCandidateShard?: AiRootCandidateShard;
  openingSeed?: number;
};

export type AiWorkerResponse = {
  type: "best" | "done" | "error";
  point: Point | null;
  message?: string;
  score?: number;
  completedDepth?: number;
  nodes?: number;
  source?: AiMoveSource;
};

export const AI_WORKER_DIFFICULTIES: readonly AiDifficulty[] = ["normal", "hard", "expert", "insane"];

const MAX_MOVE_COUNT = BOARD_SIZE * BOARD_SIZE;
const MAX_TIME_LIMIT_MS = 10 * 60 * 1000;

/**
 * Validates a `postMessage` payload before it reaches the search code. A
 * malformed board or stone would otherwise throw deep inside the search, or
 * worse, quietly produce a nonsense move.
 *
 * Returns a human-readable reason, or `null` when the payload is well-formed.
 */
export function describeInvalidAiWorkerRequest(value: unknown): string | null {
  if (!value || typeof value !== "object") {
    return "request must be an object";
  }

  const request = value as Partial<AiWorkerRequest>;

  if (!isBoard(request.board)) {
    return `board must be a ${BOARD_SIZE}x${BOARD_SIZE} grid of black/white/null`;
  }

  if (!Array.isArray(request.moves) || request.moves.length > MAX_MOVE_COUNT || !request.moves.every(isMove)) {
    return "moves must be an array of {row, col, stone, moveNumber}";
  }

  if (request.aiStone !== "black" && request.aiStone !== "white") {
    return "aiStone must be black or white";
  }

  if (!AI_WORKER_DIFFICULTIES.includes(request.difficulty as AiDifficulty)) {
    return `difficulty must be one of ${AI_WORKER_DIFFICULTIES.join(", ")}`;
  }

  if (!isFiniteDuration(request.timeLimitMs, MAX_TIME_LIMIT_MS)) {
    return "timeLimitMs must be a positive finite number";
  }

  if (request.rootCandidateShard !== undefined && !isRootCandidateShard(request.rootCandidateShard)) {
    return "rootCandidateShard must be {index, total} with 0 <= index < total";
  }

  if (request.openingSeed !== undefined && !Number.isInteger(request.openingSeed)) {
    return "openingSeed must be an integer";
  }

  return null;
}

function isBoard(value: unknown): value is Board {
  return (
    Array.isArray(value) &&
    value.length === BOARD_SIZE &&
    value.every(
      (row) =>
        Array.isArray(row) &&
        row.length === BOARD_SIZE &&
        row.every((cell) => cell === null || cell === "black" || cell === "white")
    )
  );
}

function isMove(value: unknown): value is Move {
  if (!value || typeof value !== "object") {
    return false;
  }

  const move = value as Partial<Move>;

  return (
    isBoardIndex(move.row) &&
    isBoardIndex(move.col) &&
    (move.stone === "black" || move.stone === "white") &&
    Number.isInteger(move.moveNumber) &&
    (move.moveNumber as number) >= 1
  );
}

function isRootCandidateShard(value: unknown): value is AiRootCandidateShard {
  if (!value || typeof value !== "object") {
    return false;
  }

  const shard = value as Partial<AiRootCandidateShard>;

  return (
    Number.isInteger(shard.index) &&
    (shard.index as number) >= 0 &&
    Number.isInteger(shard.total) &&
    (shard.total as number) >= 1 &&
    (shard.index as number) < (shard.total as number)
  );
}

function isBoardIndex(value: unknown): boolean {
  return Number.isInteger(value) && (value as number) >= 0 && (value as number) < BOARD_SIZE;
}

function isFiniteDuration(value: unknown, max: number): boolean {
  return typeof value === "number" && Number.isFinite(value) && value > 0 && value <= max;
}
