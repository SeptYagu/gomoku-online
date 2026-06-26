import { describe, expect, it } from "vitest";
import { createBoard } from "./board";
import {
  createSgfDataUrl,
  getProfileRecordSgfFileName,
  serializeProfileRecordToSgf
} from "./game-record-sgf";
import type { PlayerGameRecordSummary } from "../server/game-records";

describe("profile game record SGF", () => {
  it("serializes a profile record from the current player's seat", () => {
    const sgf = serializeProfileRecordToSgf(createRecord({ playerSeat: "white", winner: "white" }), "Alice");

    expect(sgf).toContain("AP[gomoku-online:profile-record]");
    expect(sgf).toContain("GN[ROOM01-1]");
    expect(sgf).toContain("EV[ROOM01]");
    expect(sgf).toContain("PB[Bob]");
    expect(sgf).toContain("PW[Alice]");
    expect(sgf).toContain("RE[W+R]");
    expect(sgf).toContain("C[recordStatus=verified; finishReason=resign; moveSeq=3; playerSeat=white; result=win]");
    expect(sgf).toContain(";B[hh];W[ii];B[jj]");
  });

  it("creates a browser data URL and safe SGF filename", () => {
    const record = createRecord({ gameId: 'ROOM:01/1*bad', playerSeat: "black", winner: "black" });
    const sgf = serializeProfileRecordToSgf(record, "Alice");
    const dataUrl = createSgfDataUrl(sgf);

    expect(dataUrl).toMatch(/^data:application\/x-go-sgf;charset=utf-8,/);
    expect(decodeURIComponent(dataUrl.split(",", 2)[1])).toBe(sgf);
    expect(getProfileRecordSgfFileName(record)).toBe("gomoku-ROOM-01-1-bad.sgf");
  });
});

function createRecord(
  overrides: Partial<Pick<PlayerGameRecordSummary, "gameId" | "playerSeat" | "winner">>
): PlayerGameRecordSummary {
  return {
    board: createBoard(),
    finishReason: "resign",
    finishedAt: Date.UTC(2026, 5, 26, 12, 0, 0),
    gameId: overrides.gameId ?? "ROOM01-1",
    moveSeq: 3,
    moves: [
      { col: 7, moveNumber: 1, row: 7, stone: "black" },
      { col: 8, moveNumber: 2, row: 8, stone: "white" },
      { col: 9, moveNumber: 3, row: 9, stone: "black" }
    ],
    opponentName: "Bob",
    playerSeat: overrides.playerSeat ?? "white",
    recordStatus: "verified",
    result: "win",
    roomCode: "ROOM01",
    winner: overrides.winner ?? "white"
  };
}
