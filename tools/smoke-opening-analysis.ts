import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { replayBoardAtMove } from "../src/game/record-replay";
import type { Move } from "../src/game/types";
import { analyzeGameRecordOpenings } from "../src/server/game-record-opening-analysis";
import { filterGameRecordsForExport } from "../src/server/game-record-export";
import { GameRecordStore, type AuthoritativeGameRecord, type GameRecordClientSubmission } from "../src/server/game-records";

async function main(): Promise<void> {
  const workDir = await mkdtemp(path.join(tmpdir(), "gomoku-opening-analysis-"));
  const inputPath = path.join(workDir, "records.jsonl");
  const outputPath = path.join(workDir, "opening-analysis.json");

  try {
    const store = new GameRecordStore({ filePath: inputPath, now: createClock() });
    const firstLine = [
      { col: 7, moveNumber: 1, row: 7, stone: "black" },
      { col: 8, moveNumber: 2, row: 7, stone: "white" },
      { col: 7, moveNumber: 3, row: 8, stone: "black" },
      { col: 8, moveNumber: 4, row: 8, stone: "white" }
    ] satisfies Move[];
    const secondLine = [
      { col: 7, moveNumber: 1, row: 7, stone: "black" },
      { col: 6, moveNumber: 2, row: 7, stone: "white" },
      { col: 7, moveNumber: 3, row: 6, stone: "black" },
      { col: 6, moveNumber: 4, row: 6, stone: "white" }
    ] satisfies Move[];

    submitVerifiedRecord(store, createAuthoritativeRecord("OPEN1-1", firstLine, "black"));
    submitVerifiedRecord(store, createAuthoritativeRecord("OPEN2-1", firstLine, "white"));
    submitVerifiedRecord(store, createAuthoritativeRecord("OPEN3-1", secondLine, "black"));

    const loadedStore = new GameRecordStore({ filePath: inputPath });
    const records = filterGameRecordsForExport(loadedStore.listRecords(100), "verified");
    const analysis = analyzeGameRecordOpenings(records, { minGames: 1, prefixLength: 3 });

    assert(analysis.recordsRead === 3, "analysis should load three verified records");
    assert(analysis.recordsAnalyzed === 3, "analysis should analyze all sufficiently long records");
    assert(analysis.candidates.length === 2, "analysis should group records into two opening candidates");
    assert(analysis.candidates[0].key === "Bhh Wih Bhi", "most common opening prefix should rank first");
    assert(analysis.candidates[0].games === 2, "top opening prefix should have two games");
    assert(analysis.candidates[0].blackWinRate === 0.5, "top opening prefix should preserve win rates");

    await writeFile(outputPath, `${JSON.stringify(analysis, null, 2)}\n`, "utf8");
    const written = await readFile(outputPath, "utf8");

    assert(written.includes("\"key\": \"Bhh Wih Bhi\""), "opening analysis JSON should be writable");
    console.log("Opening analysis smoke");
    console.log(`PASS analyzed saved game records - ${analysis.recordsRead}`);
    console.log(`PASS opening candidates - ${analysis.candidates.length}`);
  } finally {
    await rm(workDir, { force: true, recursive: true });
  }
}

function submitVerifiedRecord(store: GameRecordStore, authoritative: AuthoritativeGameRecord): void {
  store.submit(authoritative, createSubmission(authoritative, authoritative.players[0].playerId));
  store.submit(authoritative, createSubmission(authoritative, authoritative.players[1].playerId));
}

function createClock(): () => number {
  let now = 1_766_666_060_000;

  return () => {
    now += 1_000;
    return now;
  };
}

function createAuthoritativeRecord(gameId: string, moves: Move[], winner: "black" | "white"): AuthoritativeGameRecord {
  return {
    board: replayBoardAtMove(moves, moves.length),
    createdAt: 1_766_666_000_000,
    finishReason: "five",
    finishedAt: 1_766_666_060_000 + Number.parseInt(gameId.slice(4, 5), 10) * 10_000,
    gameId,
    moveSeq: moves.length,
    moves,
    players: [
      { identity: "registered", name: `Black ${gameId}`, playerId: `black-${gameId}`, seat: "black" },
      { identity: "registered", name: `White ${gameId}`, playerId: `white-${gameId}`, seat: "white" }
    ],
    roomCode: gameId.split("-", 1)[0],
    status: "finished",
    visibility: "public",
    winLine: [],
    winner
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
