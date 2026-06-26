import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createBoard, placeStone } from "../game/board";
import { GameRecordStore, type AuthoritativeGameRecord, type GameRecordClientSubmission } from "./game-records";

describe("GameRecordStore", () => {
  it("persists and reloads verified game records from JSONL", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "gomoku-records-"));
    const filePath = join(tempDir, "records.jsonl");

    try {
      const firstStore = new GameRecordStore({ filePath, now: createClock() });
      const authoritative = createAuthoritativeGameRecord();

      firstStore.submit(authoritative, createSubmission(authoritative, "player-1"));
      const verified = firstStore.submit(authoritative, createSubmission(authoritative, "player-2"));

      expect(verified.record.recordStatus).toBe("verified");

      const secondStore = new GameRecordStore({ filePath });

      expect(secondStore.listRecords()).toEqual([
        expect.objectContaining({
          gameId: "ROOM01-1",
          recordStatus: "verified",
          submissions: [
            expect.objectContaining({ playerId: "player-1" }),
            expect.objectContaining({ playerId: "player-2" })
          ]
        })
      ]);
    } finally {
      rmSync(tempDir, { force: true, recursive: true });
    }
  });

  it("builds player profile stats and recent game summaries", () => {
    const store = new GameRecordStore({ now: createClock() });
    const authoritative = createAuthoritativeGameRecord();

    store.submit(authoritative, createSubmission(authoritative, "player-1"));
    store.submit(authoritative, createSubmission(authoritative, "player-2"));

    const aliceProfile = store.getPlayerProfile("player-1", "Alice");
    const bobProfile = store.getPlayerProfile("player-2", "Bob");

    expect(aliceProfile).toMatchObject({
      displayName: "Alice",
      identity: "guest",
      stats: {
        games: 1,
        losses: 1,
        verified: 1,
        wins: 0
      }
    });
    expect(aliceProfile.recentRecords[0]).toMatchObject({
      finishReason: "resign",
      moveSeq: 1,
      opponentName: "Bob",
      playerSeat: "black",
      recordStatus: "verified",
      result: "loss",
      roomCode: "ROOM01",
      winner: "white"
    });
    expect(bobProfile.stats.wins).toBe(1);
    expect(bobProfile.recentRecords[0]?.result).toBe("win");
  });
});

function createAuthoritativeGameRecord(): AuthoritativeGameRecord {
  const board = placeStone(createBoard(), { row: 7, col: 7 }, "black");
  const moves = [{ col: 7, moveNumber: 1, row: 7, stone: "black" as const }];

  return {
    board,
    createdAt: 1_780_000_000_000,
    finishReason: "resign",
    finishedAt: 1_780_000_001_000,
    gameId: "ROOM01-1",
    moveSeq: 1,
    moves,
    players: [
      { identity: "guest", name: "Alice", playerId: "player-1", seat: "black" },
      { identity: "guest", name: "Bob", playerId: "player-2", seat: "white" }
    ],
    roomCode: "ROOM01",
    status: "finished",
    winLine: [],
    winner: "white"
  };
}

function createSubmission(
  authoritative: AuthoritativeGameRecord,
  playerId: string
): GameRecordClientSubmission {
  return {
    board: authoritative.board,
    finishReason: authoritative.finishReason,
    gameId: authoritative.gameId,
    moveSeq: authoritative.moveSeq,
    moves: authoritative.moves,
    playerId,
    roomCode: authoritative.roomCode,
    status: authoritative.status,
    winner: authoritative.winner
  };
}

function createClock(): () => number {
  let now = 1_780_000_002_000;

  return () => {
    now += 1;
    return now;
  };
}
