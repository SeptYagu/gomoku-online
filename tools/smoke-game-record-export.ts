import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { replayBoardAtMove } from "../src/game/record-replay";
import type { Move } from "../src/game/types";
import {
  filterGameRecordsForExport,
  serializeGameRecordsToJsonl,
  serializeGameRecordsToSgf
} from "../src/server/game-record-export";
import { GameRecordStore, type AuthoritativeGameRecord, type GameRecordClientSubmission } from "../src/server/game-records";

async function main(): Promise<void> {
  const workDir = await mkdtemp(path.join(tmpdir(), "gomoku-game-record-export-"));
  const inputPath = path.join(workDir, "records.jsonl");
  const sgfPath = path.join(workDir, "records.sgf");

  try {
    const store = new GameRecordStore({ filePath: inputPath, now: createClock() });
    const authoritative = createAuthoritativeRecord();

    store.submit(authoritative, createSubmission(authoritative, "acct_alice"));
    const verified = store.submit(authoritative, createSubmission(authoritative, "guest_bob")).record;

    const loadedStore = new GameRecordStore({ filePath: inputPath });
    const records = filterGameRecordsForExport(loadedStore.listRecords(100), "verified");
    const sgf = serializeGameRecordsToSgf(records);
    const jsonl = serializeGameRecordsToJsonl(records);

    assert(records.length === 1, "export should include one verified record");
    assert(records[0].gameId === verified.gameId, "export should load the verified record from JSONL");
    assert(sgf.includes(";B[hh];W[ih];B[hi]"), "SGF should preserve move order");
    assert(sgf.includes("blackIdentity=registered"), "SGF comment should preserve black identity");
    assert(jsonl.includes("\"recordStatus\":\"verified\""), "JSONL should preserve record status");

    await writeFile(sgfPath, sgf, "utf8");
    const written = await readFile(sgfPath, "utf8");

    assert(written === sgf, "SGF export should be writable for opening analysis");
    console.log("Game record export smoke");
    console.log(`PASS export verified records - ${verified.gameId}`);
    console.log("PASS export SGF and JSONL serialization");
  } finally {
    await rm(workDir, { force: true, recursive: true });
  }
}

function createClock(): () => number {
  let now = 1_766_666_060_000;

  return () => {
    now += 1_000;
    return now;
  };
}

function createAuthoritativeRecord(): AuthoritativeGameRecord {
  const moves: Move[] = [
    { col: 7, moveNumber: 1, row: 7, stone: "black" },
    { col: 8, moveNumber: 2, row: 7, stone: "white" },
    { col: 7, moveNumber: 3, row: 8, stone: "black" }
  ];

  return {
    board: replayBoardAtMove(moves, moves.length),
    createdAt: 1_766_666_000_000,
    finishReason: "resign",
    finishedAt: 1_766_666_060_000,
    gameId: "EXPORT1-1",
    moveSeq: moves.length,
    moves,
    players: [
      { identity: "registered", name: "Alice", playerId: "acct_alice", seat: "black" },
      { identity: "guest", name: "Bob", playerId: "guest_bob", seat: "white" }
    ],
    roomCode: "EXPORT1",
    status: "finished",
    visibility: "public",
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

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

await main();
