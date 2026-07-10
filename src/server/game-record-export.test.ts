import { describe, expect, it } from "vitest";

import { replayBoardAtMove } from "../game/record-replay";
import type { Move } from "../game/types";
import {
  filterGameRecordsForExport,
  serializeGameRecordsToJsonl,
  serializeGameRecordsToSgf
} from "./game-record-export";
import type { SavedGameRecord } from "./game-records";

describe("game record export", () => {
  it("filters export records by status", () => {
    const verified = createRecord({ gameId: "ROOM01-1", recordStatus: "verified" });
    const partial = createRecord({ gameId: "ROOM02-1", recordStatus: "partial" });

    expect(filterGameRecordsForExport([partial, verified], "verified").map((record) => record.gameId)).toEqual([
      "ROOM01-1"
    ]);
    expect(filterGameRecordsForExport([partial, verified], "all").map((record) => record.gameId)).toEqual([
      "ROOM01-1",
      "ROOM02-1"
    ]);
  });

  it("serializes saved records to SGF and JSONL for opening analysis", () => {
    const record = createRecord();
    const sgf = serializeGameRecordsToSgf([record]);
    const jsonl = serializeGameRecordsToJsonl([record]);

    expect(sgf).toContain("AP[gomoku-online:game-record-export]");
    expect(sgf).toContain("PB[Alice]");
    expect(sgf).toContain("PW[Bob]");
    expect(sgf).toContain("RE[W+R]");
    expect(sgf).toContain(";B[hh];W[ih];B[hi]");
    expect(jsonl).toContain("\"gameId\":\"ROOM01-1\"");
    expect(jsonl.endsWith("\n")).toBe(true);
  });
});

function createRecord(overrides: Partial<SavedGameRecord> = {}): SavedGameRecord {
  const moves: Move[] = [
    { col: 7, moveNumber: 1, row: 7, stone: "black" },
    { col: 8, moveNumber: 2, row: 7, stone: "white" },
    { col: 7, moveNumber: 3, row: 8, stone: "black" }
  ];

  return {
    authoritative: true,
    board: replayBoardAtMove(moves, moves.length),
    conflicts: [],
    createdAt: 1_766_666_000_000,
    finishReason: "resign",
    finishedAt: 1_766_666_060_000,
    firstSubmittedAt: 1_766_666_061_000,
    gameId: "ROOM01-1",
    id: "ROOM01-1",
    moveSeq: moves.length,
    moves,
    players: [
      { identity: "registered", name: "Alice", playerId: "acct_alice", seat: "black" },
      { identity: "guest", name: "Bob", playerId: "guest_bob", seat: "white" }
    ],
    recordStatus: "verified",
    roomCode: "ROOM01",
    status: "finished",
    submissions: [
      { consistency: "consistent", playerId: "acct_alice", seat: "black", submittedAt: 1_766_666_061_000 },
      { consistency: "consistent", playerId: "guest_bob", seat: "white", submittedAt: 1_766_666_062_000 }
    ],
    updatedAt: 1_766_666_062_000,
    winner: "white",
    winLine: [],
    ...overrides
  };
}
