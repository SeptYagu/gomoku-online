import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import type { Board, Move, Point, Stone } from "../game/types";

export type GameRecordStatus = "partial" | "verified" | "conflicted";
export type GameRecordFinishReason = "five" | "draw" | "resign" | "disconnect" | "abandoned";

export type GameRecordPlayer = {
  identity: "guest" | "registered";
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

function stableStringify(value: unknown): string {
  return JSON.stringify(value);
}
