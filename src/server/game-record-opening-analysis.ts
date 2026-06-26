import type { Move, Point } from "../game/types";
import type { SavedGameRecord } from "./game-records";

export type GameRecordOpeningAnalysisOptions = {
  minGames?: number;
  prefixLength?: number;
};

export type GameRecordOpeningCandidate = {
  abandoned: number;
  blackWinRate: number;
  blackWins: number;
  draws: number;
  firstPlayedAt: number;
  gameIds: string[];
  games: number;
  key: string;
  lastPlayedAt: number;
  moves: Move[];
  whiteWinRate: number;
  whiteWins: number;
};

export type GameRecordOpeningAnalysis = {
  candidates: GameRecordOpeningCandidate[];
  minGames: number;
  prefixLength: number;
  recordsAnalyzed: number;
  recordsRead: number;
  recordsSkipped: number;
};

type MutableOpeningCandidate = Omit<GameRecordOpeningCandidate, "blackWinRate" | "whiteWinRate">;

const DEFAULT_PREFIX_LENGTH = 8;
const DEFAULT_MIN_GAMES = 1;
const MAX_PREFIX_LENGTH = 225;

export function analyzeGameRecordOpenings(
  records: SavedGameRecord[],
  options: GameRecordOpeningAnalysisOptions = {}
): GameRecordOpeningAnalysis {
  const prefixLength = clampInteger(options.prefixLength, DEFAULT_PREFIX_LENGTH, 1, MAX_PREFIX_LENGTH);
  const minGames = clampInteger(options.minGames, DEFAULT_MIN_GAMES, 1, Number.MAX_SAFE_INTEGER);
  const candidates = new Map<string, MutableOpeningCandidate>();
  let recordsSkipped = 0;

  for (const record of records) {
    if (record.status !== "finished" || record.moves.length < prefixLength) {
      recordsSkipped += 1;
      continue;
    }

    const moves = record.moves.slice(0, prefixLength);
    const key = formatOpeningKey(moves);
    const candidate =
      candidates.get(key) ??
      ({
        abandoned: 0,
        blackWins: 0,
        draws: 0,
        firstPlayedAt: record.finishedAt,
        gameIds: [],
        games: 0,
        key,
        lastPlayedAt: record.finishedAt,
        moves,
        whiteWins: 0
      } satisfies MutableOpeningCandidate);

    candidate.games += 1;
    candidate.firstPlayedAt = Math.min(candidate.firstPlayedAt, record.finishedAt);
    candidate.lastPlayedAt = Math.max(candidate.lastPlayedAt, record.finishedAt);
    candidate.gameIds.push(record.gameId);

    if (record.finishReason === "abandoned") {
      candidate.abandoned += 1;
    } else if (record.winner === "black") {
      candidate.blackWins += 1;
    } else if (record.winner === "white") {
      candidate.whiteWins += 1;
    } else {
      candidate.draws += 1;
    }

    candidates.set(key, candidate);
  }

  const rankedCandidates = [...candidates.values()]
    .filter((candidate) => candidate.games >= minGames)
    .map(finalizeCandidate)
    .sort(compareOpeningCandidates);

  return {
    candidates: rankedCandidates,
    minGames,
    prefixLength,
    recordsAnalyzed: [...candidates.values()].reduce((total, candidate) => total + candidate.games, 0),
    recordsRead: records.length,
    recordsSkipped
  };
}

function finalizeCandidate(candidate: MutableOpeningCandidate): GameRecordOpeningCandidate {
  return {
    ...candidate,
    blackWinRate: roundRate(candidate.blackWins / candidate.games),
    whiteWinRate: roundRate(candidate.whiteWins / candidate.games)
  };
}

function compareOpeningCandidates(first: GameRecordOpeningCandidate, second: GameRecordOpeningCandidate): number {
  return (
    second.games - first.games ||
    second.blackWinRate - first.blackWinRate ||
    second.lastPlayedAt - first.lastPlayedAt ||
    first.key.localeCompare(second.key)
  );
}

function formatOpeningKey(moves: Move[]): string {
  return moves.map((move) => `${move.stone === "black" ? "B" : "W"}${toSgfPoint(move)}`).join(" ");
}

function toSgfPoint(point: Point): string {
  return `${String.fromCharCode(97 + point.col)}${String.fromCharCode(97 + point.row)}`;
}

function roundRate(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}

function clampInteger(value: number | undefined, fallback: number, min: number, max: number): number {
  if (value === undefined || !Number.isFinite(value)) {
    return fallback;
  }

  return Math.min(max, Math.max(min, Math.floor(value)));
}
