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

  it("persists a server-authoritative terminal record before any client audit submission", () => {
    const store = new GameRecordStore({ now: createClock() });
    const authoritative = createAuthoritativeGameRecord();
    const saved = store.recordAuthoritative(authoritative);

    expect(saved).toMatchObject({
      authoritative: true,
      gameId: authoritative.gameId,
      recordStatus: "verified",
      submissions: []
    });
    expect(store.getLeaderboard({ identity: "guest" }).entries).toHaveLength(2);

    const conflicted = store.submit(authoritative, {
      ...createSubmission(authoritative, "player-1"),
      winner: "black"
    });

    expect(conflicted.record).toMatchObject({
      authoritative: true,
      recordStatus: "verified",
      winner: "white"
    });
    expect(conflicted.record.conflicts).toEqual([
      expect.objectContaining({ playerId: "player-1", reason: "winner-mismatch" })
    ]);
    expect(store.getLeaderboard({ identity: "guest" }).entries).toHaveLength(2);
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

  it("builds leaderboard rankings from verified online records only", () => {
    const store = new GameRecordStore({ now: createClock() });
    const verifiedRecord = createAuthoritativeGameRecord();
    const partialRecord = createAuthoritativeGameRecord({
      gameId: "ROOM02-1",
      players: [
        { identity: "guest", name: "Alice", playerId: "player-1", seat: "black" },
        { identity: "guest", name: "Cara", playerId: "player-3", seat: "white" }
      ],
      roomCode: "ROOM02",
      winner: "black"
    });

    store.submit(verifiedRecord, createSubmission(verifiedRecord, "player-1"));
    store.submit(verifiedRecord, createSubmission(verifiedRecord, "player-2"));
    store.submit(partialRecord, createSubmission(partialRecord, "player-1"));

    const registered = store.getLeaderboard({ scope: "overall" });
    const overall = store.getLeaderboard({ identity: "guest", scope: "overall" });

    expect(registered.identity).toBe("registered");
    expect(registered.entries).toEqual([]);
    expect(overall.identity).toBe("guest");
    expect(overall.scope).toBe("overall");
    expect(overall.entries).toEqual([
      expect.objectContaining({
        displayName: "Bob",
        games: 1,
        losses: 0,
        rank: 1,
        rating: 1216,
        wins: 1
      }),
      expect.objectContaining({
        displayName: "Alice",
        games: 1,
        losses: 1,
        rank: 2,
        rating: 1184,
        wins: 0
      })
    ]);
    expect(overall.entries.some((entry) => entry.displayName === "Cara")).toBe(false);

    expect(store.getLeaderboard({ identity: "guest", scope: "daily" }).entries[0]).toMatchObject({
      dailyWins: 1,
      displayName: "Bob"
    });
    expect(store.getLeaderboard({ identity: "guest", scope: "streak" }).entries[0]).toMatchObject({
      currentStreak: 1,
      displayName: "Bob",
      maxStreak: 1
    });
  });

  it("separates registered, guest, and all leaderboard audiences", () => {
    const store = new GameRecordStore({ now: createClock() });
    const guestRecord = createAuthoritativeGameRecord();
    const registeredRecord = createAuthoritativeGameRecord({
      gameId: "ROOM03-1",
      players: [
        { identity: "registered", name: "Registered Alice", playerId: "acct_alice", seat: "black" },
        { identity: "registered", name: "Registered Bob", playerId: "acct_bob", seat: "white" }
      ],
      roomCode: "ROOM03"
    });

    store.submit(guestRecord, createSubmission(guestRecord, "player-1"));
    store.submit(guestRecord, createSubmission(guestRecord, "player-2"));
    store.submit(registeredRecord, createSubmission(registeredRecord, "acct_alice"));
    store.submit(registeredRecord, createSubmission(registeredRecord, "acct_bob"));

    const defaultRegistered = store.getLeaderboard();
    const guests = store.getLeaderboard({ identity: "guest" });
    const all = store.getLeaderboard({ identity: "all" });

    expect(defaultRegistered.identity).toBe("registered");
    expect(defaultRegistered.entries.map((entry) => entry.identity)).toEqual(["registered", "registered"]);
    expect(defaultRegistered.entries.map((entry) => entry.playerId)).toEqual(["acct_bob", "acct_alice"]);
    expect(guests.identity).toBe("guest");
    expect(guests.entries.map((entry) => entry.identity)).toEqual(["guest", "guest"]);
    expect(guests.entries.map((entry) => entry.playerId)).toEqual(["player-2", "player-1"]);
    expect(all.identity).toBe("all");
    expect(all.entries).toHaveLength(4);
    expect(new Set(all.entries.map((entry) => entry.identity))).toEqual(new Set(["guest", "registered"]));
  });

  it("supports leaderboard search and offset pagination", () => {
    const store = new GameRecordStore({ now: createClock() });
    const firstRecord = createAuthoritativeGameRecord();
    const secondRecord = createAuthoritativeGameRecord({
      gameId: "ROOM02-1",
      players: [
        { identity: "guest", name: "Delta", playerId: "player-4", seat: "black" },
        { identity: "guest", name: "Echo", playerId: "player-5", seat: "white" }
      ],
      roomCode: "ROOM02",
      winner: "white"
    });

    store.submit(firstRecord, createSubmission(firstRecord, "player-1"));
    store.submit(firstRecord, createSubmission(firstRecord, "player-2"));
    store.submit(secondRecord, createSubmission(secondRecord, "player-4"));
    store.submit(secondRecord, createSubmission(secondRecord, "player-5"));

    const firstPage = store.getLeaderboard({ identity: "guest", limit: 1, offset: 0 });
    const secondPage = store.getLeaderboard({ identity: "guest", limit: 1, offset: 1 });
    const searched = store.getLeaderboard({ identity: "guest", limit: 10, search: " player-4 " });

    expect(firstPage.limit).toBe(1);
    expect(firstPage.offset).toBe(0);
    expect(firstPage.totalEntries).toBe(4);
    expect(firstPage.entries).toHaveLength(1);
    expect(firstPage.entries[0]?.rank).toBe(1);
    expect(secondPage.offset).toBe(1);
    expect(secondPage.entries[0]?.rank).toBe(2);
    expect(searched.search).toBe("player-4");
    expect(searched.totalEntries).toBe(1);
    expect(searched.entries[0]).toMatchObject({
      displayName: "Delta",
      playerId: "player-4",
      rank: 1
    });
  });

  it("reuses one leaderboard revision across filters and refreshes daily values at the next day", () => {
    let now = 1_780_000_002_000;
    const store = new GameRecordStore({ now: () => now });
    const authoritative = createAuthoritativeGameRecord({ finishedAt: now - 1_000 });

    store.recordAuthoritative(authoritative);

    const overall = store.getLeaderboard({ identity: "guest", scope: "overall" });
    const daily = store.getLeaderboard({ identity: "guest", search: "Bob", scope: "daily" });

    expect(daily.version).toBe(overall.version);
    expect(daily.entries[0]).toMatchObject({ dailyWins: 1, displayName: "Bob" });

    now += 24 * 60 * 60 * 1000;

    expect(store.getLeaderboard({ identity: "guest", scope: "daily" }).entries[0]).toMatchObject({
      dailyWins: 0,
      displayName: "Bob"
    });
  });
});

function createAuthoritativeGameRecord(
  overrides: Partial<AuthoritativeGameRecord> = {}
): AuthoritativeGameRecord {
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
    winner: "white",
    ...overrides
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
