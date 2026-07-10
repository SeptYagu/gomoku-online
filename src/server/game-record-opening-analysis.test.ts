import { describe, expect, it } from "vitest";

import { replayBoardAtMove } from "../game/record-replay";
import type { Move } from "../game/types";
import { analyzeGameRecordOpenings } from "./game-record-opening-analysis";
import type { SavedGameRecord } from "./game-records";

describe("game record opening analysis", () => {
  it("aggregates verified finished records by opening prefix", () => {
    const firstLine = [
      { col: 7, moveNumber: 1, row: 7, stone: "black" },
      { col: 8, moveNumber: 2, row: 7, stone: "white" },
      { col: 7, moveNumber: 3, row: 8, stone: "black" }
    ] satisfies Move[];
    const secondLine = [
      { col: 7, moveNumber: 1, row: 7, stone: "black" },
      { col: 6, moveNumber: 2, row: 7, stone: "white" },
      { col: 7, moveNumber: 3, row: 6, stone: "black" }
    ] satisfies Move[];
    const analysis = analyzeGameRecordOpenings(
      [
        createRecord({ gameId: "A-1", moves: firstLine, winner: "black" }),
        createRecord({ gameId: "A-2", moves: firstLine, winner: "white", finishedAt: 1_766_666_070_000 }),
        createRecord({ gameId: "B-1", moves: secondLine, winner: "black", finishedAt: 1_766_666_080_000 }),
        createRecord({ gameId: "SHORT-1", moves: firstLine.slice(0, 2), winner: "black" }),
        createRecord({ gameId: "PARTIAL-1", moves: firstLine, recordStatus: "partial", winner: "black" })
      ].filter((record) => record.recordStatus === "verified"),
      { minGames: 1, prefixLength: 3 }
    );

    expect(analysis).toMatchObject({
      minGames: 1,
      prefixLength: 3,
      recordsAnalyzed: 3,
      recordsRead: 4,
      recordsSkipped: 1
    });
    expect(analysis.candidates).toHaveLength(2);
    expect(analysis.candidates[0]).toMatchObject({
      blackWinRate: 0.5,
      blackWins: 1,
      gameIds: ["A-1", "A-2"],
      games: 2,
      key: "Bhh Wih Bhi",
      whiteWinRate: 0.5,
      whiteWins: 1
    });
    expect(analysis.candidates[1]).toMatchObject({
      blackWinRate: 1,
      games: 1,
      key: "Bhh Wgh Bhg"
    });
  });

  it("applies the minimum game threshold", () => {
    const moves = [
      { col: 7, moveNumber: 1, row: 7, stone: "black" },
      { col: 8, moveNumber: 2, row: 7, stone: "white" },
      { col: 7, moveNumber: 3, row: 8, stone: "black" }
    ] satisfies Move[];
    const analysis = analyzeGameRecordOpenings(
      [
        createRecord({ gameId: "A-1", moves, winner: "black" }),
        createRecord({ gameId: "A-2", moves, winner: "white" })
      ],
      { minGames: 3, prefixLength: 3 }
    );

    expect(analysis.recordsAnalyzed).toBe(2);
    expect(analysis.candidates).toEqual([]);
  });
});

function createRecord(
  overrides: Partial<Pick<SavedGameRecord, "finishedAt" | "gameId" | "moves" | "recordStatus" | "winner">> = {}
): SavedGameRecord {
  const moves =
    overrides.moves ??
    ([
      { col: 7, moveNumber: 1, row: 7, stone: "black" },
      { col: 8, moveNumber: 2, row: 7, stone: "white" },
      { col: 7, moveNumber: 3, row: 8, stone: "black" }
    ] satisfies Move[]);

  return {
    authoritative: true,
    board: replayBoardAtMove(moves, moves.length),
    conflicts: [],
    createdAt: 1_766_666_000_000,
    finishReason: "five",
    finishedAt: overrides.finishedAt ?? 1_766_666_060_000,
    firstSubmittedAt: 1_766_666_061_000,
    gameId: overrides.gameId ?? "ROOM01-1",
    id: overrides.gameId ?? "ROOM01-1",
    moveSeq: moves.length,
    moves,
    players: [
      { identity: "registered", name: "Alice", playerId: "acct_alice", seat: "black" },
      { identity: "registered", name: "Bob", playerId: "acct_bob", seat: "white" }
    ],
    recordStatus: overrides.recordStatus ?? "verified",
    roomCode: "ROOM01",
    status: "finished",
    submissions: [
      { consistency: "consistent", playerId: "acct_alice", seat: "black", submittedAt: 1_766_666_061_000 },
      { consistency: "consistent", playerId: "acct_bob", seat: "white", submittedAt: 1_766_666_062_000 }
    ],
    updatedAt: 1_766_666_062_000,
    winLine: [],
    winner: overrides.winner ?? "black"
  };
}
