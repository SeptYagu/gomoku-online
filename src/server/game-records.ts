import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import type { PlayerIdentityKind } from "./accounts";
import type { Board, Move, Point, Stone } from "../game/types";

export type GameRecordStatus = "partial" | "verified" | "conflicted";
export type GameRecordFinishReason = "five" | "draw" | "resign" | "disconnect" | "abandoned";

export type GameRecordPlayer = {
  identity: PlayerIdentityKind;
  name: string;
  playerId: string;
  seat: Stone;
};

export type GameRecordClientSubmission = {
  board: Board;
  finishReason: GameRecordFinishReason;
  gameId: string;
  moveSeq: number;
  moves: Move[];
  playerId: string;
  roomCode: string;
  status: "finished" | "abandoned";
  winner: Stone | null;
};

export type AuthoritativeGameRecord = {
  board: Board;
  createdAt: number;
  finishReason: GameRecordFinishReason;
  finishedAt: number;
  gameId: string;
  moveSeq: number;
  moves: Move[];
  players: GameRecordPlayer[];
  roomCode: string;
  status: "finished" | "abandoned";
  winLine: Point[];
  winner: Stone | null;
};

export type GameRecordSubmissionSummary = {
  consistency: "consistent" | "conflicted";
  playerId: string;
  seat: Stone;
  submittedAt: number;
};

export type GameRecordConflict = {
  playerId: string;
  reason: string;
  submittedAt: number;
};

export type SavedGameRecord = AuthoritativeGameRecord & {
  firstSubmittedAt: number;
  id: string;
  recordStatus: GameRecordStatus;
  submissions: GameRecordSubmissionSummary[];
  conflicts: GameRecordConflict[];
  updatedAt: number;
};

export type GameRecordSubmitResult = {
  duplicate: boolean;
  record: SavedGameRecord;
};

export type PlayerGameRecordResult = "win" | "loss" | "draw" | "abandoned";

export type PlayerGameRecordSummary = {
  board: Board;
  finishReason: GameRecordFinishReason;
  finishedAt: number;
  gameId: string;
  moveSeq: number;
  moves: Move[];
  opponentName: string;
  playerSeat: Stone;
  recordStatus: GameRecordStatus;
  result: PlayerGameRecordResult;
  roomCode: string;
  winner: Stone | null;
};

export type PlayerProfileSnapshot = {
  displayName: string;
  generatedAt: number;
  identity: PlayerIdentityKind;
  playerId: string;
  recentRecords: PlayerGameRecordSummary[];
  stats: {
    conflicted: number;
    draws: number;
    games: number;
    losses: number;
    partial: number;
    verified: number;
    wins: number;
  };
};

export type LeaderboardScope = "overall" | "daily" | "streak";

export type LeaderboardQuery = {
  limit?: number;
  scope?: LeaderboardScope;
};

export type LeaderboardEntry = {
  currentStreak: number;
  dailyWins: number;
  displayName: string;
  draws: number;
  games: number;
  identity: "guest" | "registered";
  lastPlayedAt: number;
  losses: number;
  maxStreak: number;
  playerId: string;
  rank: number;
  rating: number;
  wins: number;
};

export type LeaderboardSnapshot = {
  entries: LeaderboardEntry[];
  generatedAt: number;
  scope: LeaderboardScope;
  version: number;
};

type GameRecordStoreOptions = {
  filePath?: false | string;
  now?: () => number;
};

type PersistedGameRecordEntry = {
  record: SavedGameRecord;
  type: "game-record";
  writtenAt: number;
};

export class GameRecordStore {
  private readonly filePath: false | string;
  private readonly now: () => number;
  private readonly records = new Map<string, SavedGameRecord>();

  constructor(options: GameRecordStoreOptions = {}) {
    this.filePath = options.filePath === undefined ? false : options.filePath === false ? false : resolve(options.filePath);
    this.now = options.now ?? Date.now;

    this.loadFromFile();
  }

  listRecords(limit = 50): SavedGameRecord[] {
    return [...this.records.values()]
      .sort((left, right) => right.updatedAt - left.updatedAt)
      .slice(0, Math.max(1, Math.min(200, Math.floor(limit))));
  }

  getLeaderboard(query: LeaderboardQuery = {}): LeaderboardSnapshot {
    const scope = normalizeLeaderboardScope(query.scope);
    const entries = calculateLeaderboardEntries([...this.records.values()], this.now());
    const sortedEntries = sortLeaderboardEntries(entries, scope)
      .slice(0, clampLeaderboardLimit(query.limit))
      .map((entry, index) => ({
        ...entry,
        rank: index + 1
      }));

    return {
      entries: sortedEntries,
      generatedAt: this.now(),
      scope,
      version: getLeaderboardVersion([...this.records.values()])
    };
  }

  getPlayerProfile(
    playerId: string,
    displayName = "Player",
    limit = 20,
    fallbackIdentity: PlayerIdentityKind = "guest"
  ): PlayerProfileSnapshot {
    const normalizedPlayerId = playerId.trim();
    const records = this.listRecordsForPlayer(normalizedPlayerId, limit);
    const stats = {
      conflicted: 0,
      draws: 0,
      games: records.length,
      losses: 0,
      partial: 0,
      verified: 0,
      wins: 0
    };
    const latestRecordPlayer = records[0]?.players.find((player) => player.playerId === normalizedPlayerId);
    const latestPlayerName = (latestRecordPlayer?.name ?? displayName.trim()) || "Player";

    for (const record of records) {
      if (record.recordStatus === "verified") {
        stats.verified += 1;
      } else if (record.recordStatus === "partial") {
        stats.partial += 1;
      } else {
        stats.conflicted += 1;
      }

      const result = getPlayerResult(record, normalizedPlayerId);

      if (result === "win") {
        stats.wins += 1;
      } else if (result === "loss") {
        stats.losses += 1;
      } else if (result === "draw") {
        stats.draws += 1;
      }
    }

    return {
      displayName: latestPlayerName,
      generatedAt: this.now(),
      identity: latestRecordPlayer?.identity ?? fallbackIdentity,
      playerId: normalizedPlayerId,
      recentRecords: records.map((record) => getPlayerRecordSummary(record, normalizedPlayerId)),
      stats
    };
  }

  listRecordsForPlayer(playerId: string, limit = 50): SavedGameRecord[] {
    const normalizedPlayerId = playerId.trim();
    const clampedLimit = Math.max(1, Math.min(200, Math.floor(limit)));

    return [...this.records.values()]
      .filter((record) => record.players.some((player) => player.playerId === normalizedPlayerId))
      .sort((left, right) => right.updatedAt - left.updatedAt)
      .slice(0, clampedLimit);
  }

  submit(authoritative: AuthoritativeGameRecord, submission: GameRecordClientSubmission): GameRecordSubmitResult {
    const now = this.now();
    const player = authoritative.players.find((candidate) => candidate.playerId === submission.playerId);

    if (!player) {
      throw new Error("Submitter is not a player in this game.");
    }

    const existing = this.records.get(authoritative.gameId);
    const record = existing ?? createSavedGameRecord(authoritative, now);
    const duplicate = record.submissions.some((candidate) => candidate.playerId === submission.playerId);

    if (duplicate) {
      return { duplicate: true, record };
    }

    const conflictReason = getConflictReason(authoritative, submission);
    const consistency = conflictReason ? "conflicted" : "consistent";

    record.submissions.push({
      consistency,
      playerId: submission.playerId,
      seat: player.seat,
      submittedAt: now
    });

    if (conflictReason) {
      record.conflicts.push({
        playerId: submission.playerId,
        reason: conflictReason,
        submittedAt: now
      });
      record.recordStatus = "conflicted";
    } else if (record.recordStatus !== "conflicted" && record.submissions.length >= Math.min(2, authoritative.players.length)) {
      record.recordStatus = "verified";
    }

    record.updatedAt = now;
    this.records.set(record.id, cloneRecord(record));
    this.persist(record);

    return {
      duplicate: false,
      record
    };
  }

  private loadFromFile(): void {
    if (!this.filePath || !existsSync(this.filePath)) {
      return;
    }

    const content = readFileSync(this.filePath, "utf8");

    for (const line of content.split(/\r?\n/)) {
      if (!line.trim()) {
        continue;
      }

      try {
        const entry = JSON.parse(line) as PersistedGameRecordEntry;

        if (entry.type === "game-record" && entry.record?.id) {
          this.records.set(entry.record.id, entry.record);
        }
      } catch {
        // Ignore corrupt historical lines; the next valid line for a record wins.
      }
    }
  }

  private persist(record: SavedGameRecord): void {
    if (!this.filePath) {
      return;
    }

    mkdirSync(dirname(this.filePath), { recursive: true });
    appendFileSync(
      this.filePath,
      `${JSON.stringify({
        record,
        type: "game-record",
        writtenAt: this.now()
      } satisfies PersistedGameRecordEntry)}\n`,
      "utf8"
    );
  }
}

function createSavedGameRecord(authoritative: AuthoritativeGameRecord, now: number): SavedGameRecord {
  return {
    ...cloneAuthoritative(authoritative),
    conflicts: [],
    firstSubmittedAt: now,
    id: authoritative.gameId,
    recordStatus: "partial",
    submissions: [],
    updatedAt: now
  };
}

function getConflictReason(authoritative: AuthoritativeGameRecord, submission: GameRecordClientSubmission): string | null {
  if (submission.gameId !== authoritative.gameId) {
    return "game-id-mismatch";
  }

  if (submission.roomCode.trim().toUpperCase() !== authoritative.roomCode) {
    return "room-code-mismatch";
  }

  if (submission.status !== authoritative.status) {
    return "status-mismatch";
  }

  if (submission.finishReason !== authoritative.finishReason) {
    return "finish-reason-mismatch";
  }

  if (submission.winner !== authoritative.winner) {
    return "winner-mismatch";
  }

  if (submission.moveSeq !== authoritative.moveSeq) {
    return "move-seq-mismatch";
  }

  if (stableStringify(submission.moves) !== stableStringify(authoritative.moves)) {
    return "moves-mismatch";
  }

  if (stableStringify(submission.board) !== stableStringify(authoritative.board)) {
    return "board-mismatch";
  }

  return null;
}

function cloneAuthoritative(authoritative: AuthoritativeGameRecord): AuthoritativeGameRecord {
  return JSON.parse(JSON.stringify(authoritative)) as AuthoritativeGameRecord;
}

function cloneRecord(record: SavedGameRecord): SavedGameRecord {
  return JSON.parse(JSON.stringify(record)) as SavedGameRecord;
}

function getPlayerRecordSummary(record: SavedGameRecord, playerId: string): PlayerGameRecordSummary {
  const player = record.players.find((candidate) => candidate.playerId === playerId);
  const opponent = record.players.find((candidate) => candidate.playerId !== playerId);

  if (!player) {
    throw new Error("Player is not in this game record.");
  }

  return {
    board: record.board,
    finishReason: record.finishReason,
    finishedAt: record.finishedAt,
    gameId: record.gameId,
    moveSeq: record.moveSeq,
    moves: record.moves,
    opponentName: opponent?.name ?? "Opponent",
    playerSeat: player.seat,
    recordStatus: record.recordStatus,
    result: getPlayerResult(record, playerId),
    roomCode: record.roomCode,
    winner: record.winner
  };
}

function getPlayerResult(record: SavedGameRecord, playerId: string): PlayerGameRecordResult {
  const player = record.players.find((candidate) => candidate.playerId === playerId);

  if (!player || record.status === "abandoned") {
    return "abandoned";
  }

  if (!record.winner) {
    return "draw";
  }

  return record.winner === player.seat ? "win" : "loss";
}

type MutableLeaderboardEntry = Omit<LeaderboardEntry, "rank">;

function calculateLeaderboardEntries(records: SavedGameRecord[], now: number): LeaderboardEntry[] {
  const entries = new Map<string, MutableLeaderboardEntry>();
  const dayStart = getLocalDayStart(now);
  const verifiedRecords = records
    .filter((record) => record.recordStatus === "verified" && record.status === "finished" && record.players.length >= 2)
    .sort((left, right) => left.finishedAt - right.finishedAt || left.gameId.localeCompare(right.gameId));

  for (const record of verifiedRecords) {
    const players = record.players.slice(0, 2);
    const first = getOrCreateLeaderboardEntry(entries, players[0]);
    const second = getOrCreateLeaderboardEntry(entries, players[1]);
    const firstResult = getPlayerResult(record, players[0].playerId);
    const secondResult = getPlayerResult(record, players[1].playerId);
    const firstScore = getLeaderboardScore(firstResult);
    const secondScore = getLeaderboardScore(secondResult);
    const firstRating = first.rating;
    const secondRating = second.rating;
    const firstDelta = getEloDelta(firstRating, secondRating, firstScore, getKFactor(first.games));
    const secondDelta = getEloDelta(secondRating, firstRating, secondScore, getKFactor(second.games));

    applyLeaderboardResult(first, firstResult, record.finishedAt, record.finishedAt >= dayStart);
    applyLeaderboardResult(second, secondResult, record.finishedAt, record.finishedAt >= dayStart);
    first.rating = Math.round(firstRating + firstDelta);
    second.rating = Math.round(secondRating + secondDelta);
  }

  return [...entries.values()].map((entry) => ({
    ...entry,
    rank: 0
  }));
}

function getOrCreateLeaderboardEntry(
  entries: Map<string, MutableLeaderboardEntry>,
  player: GameRecordPlayer
): MutableLeaderboardEntry {
  const existing = entries.get(player.playerId);

  if (existing) {
    existing.displayName = player.name;
    existing.identity = player.identity;
    return existing;
  }

  const entry: MutableLeaderboardEntry = {
    currentStreak: 0,
    dailyWins: 0,
    displayName: player.name,
    draws: 0,
    games: 0,
    identity: player.identity,
    lastPlayedAt: 0,
    losses: 0,
    maxStreak: 0,
    playerId: player.playerId,
    rating: 1200,
    wins: 0
  };

  entries.set(player.playerId, entry);

  return entry;
}

function applyLeaderboardResult(
  entry: MutableLeaderboardEntry,
  result: PlayerGameRecordResult,
  finishedAt: number,
  countsForDaily: boolean
) {
  entry.games += 1;
  entry.lastPlayedAt = Math.max(entry.lastPlayedAt, finishedAt);

  if (result === "win") {
    entry.wins += 1;
    entry.currentStreak += 1;
    entry.maxStreak = Math.max(entry.maxStreak, entry.currentStreak);
    if (countsForDaily) {
      entry.dailyWins += 1;
    }
    return;
  }

  if (result === "loss") {
    entry.losses += 1;
  } else {
    entry.draws += 1;
  }

  entry.currentStreak = 0;
}

function getLeaderboardScore(result: PlayerGameRecordResult): number {
  if (result === "win") {
    return 1;
  }

  if (result === "loss") {
    return 0;
  }

  return 0.5;
}

function getEloDelta(playerRating: number, opponentRating: number, score: number, kFactor: number): number {
  const expected = 1 / (1 + 10 ** ((opponentRating - playerRating) / 400));

  return kFactor * (score - expected);
}

function getKFactor(gamesBefore: number): number {
  return gamesBefore < 10 ? 32 : 24;
}

function sortLeaderboardEntries(entries: LeaderboardEntry[], scope: LeaderboardScope): LeaderboardEntry[] {
  return [...entries].sort((left, right) => {
    if (scope === "daily") {
      return (
        right.dailyWins - left.dailyWins ||
        right.rating - left.rating ||
        right.games - left.games ||
        right.lastPlayedAt - left.lastPlayedAt ||
        left.displayName.localeCompare(right.displayName)
      );
    }

    if (scope === "streak") {
      return (
        right.currentStreak - left.currentStreak ||
        right.maxStreak - left.maxStreak ||
        right.rating - left.rating ||
        right.lastPlayedAt - left.lastPlayedAt ||
        left.displayName.localeCompare(right.displayName)
      );
    }

    return (
      right.rating - left.rating ||
      right.wins - left.wins ||
      right.games - left.games ||
      right.lastPlayedAt - left.lastPlayedAt ||
      left.displayName.localeCompare(right.displayName)
    );
  });
}

function normalizeLeaderboardScope(scope: LeaderboardScope | undefined): LeaderboardScope {
  return scope === "daily" || scope === "streak" || scope === "overall" ? scope : "overall";
}

function clampLeaderboardLimit(limit: number | undefined): number {
  if (limit === undefined || !Number.isFinite(limit)) {
    return 20;
  }

  return Math.min(100, Math.max(1, Math.floor(limit)));
}

function getLocalDayStart(now: number): number {
  const date = new Date(now);

  date.setHours(0, 0, 0, 0);

  return date.getTime();
}

function getLeaderboardVersion(records: SavedGameRecord[]): number {
  return records.reduce((version, record) => Math.max(version, record.updatedAt), records.length);
}

function stableStringify(value: unknown): string {
  return JSON.stringify(value);
}
