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

  it("escapes hostile property values so they cannot break out of the property", () => {
    // `]` closes a property and `\` is the escape character; both are reachable
    // from a player name or game id, which is enough to inject a whole game tree.
    const hostile = "Bob](;B[aa])\\evil";
    const record = createRecord({ gameId: "ROOM]01\\x", playerSeat: "white", winner: "white" });
    const sgf = serializeProfileRecordToSgf({ ...record, opponentName: hostile, roomCode: "ROOM]01" }, "Alice");

    expect(readSgfProperty(sgf, "PB")).toBe(hostile);
    expect(readSgfProperty(sgf, "GN")).toBe("ROOM]01\\x");
    expect(readSgfProperty(sgf, "EV")).toBe("ROOM]01");
    // Escapes are exactly `\]` and `\\`: `(`/`)`/`;` stay readable inside a value.
    expect(sgf).toContain("PB[Bob\\](;B[aa\\])\\\\evil]");
    // The single game tree still opens and closes once.
    expect(sgf.startsWith("(;FF[4]")).toBe(true);
    expect(sgf.trimEnd().endsWith(")")).toBe(true);
  });

  it("escapes line breaks and drops characters SGF cannot represent", () => {
    const record = createRecord({ playerSeat: "white", winner: "white" });
    const sgf = serializeProfileRecordToSgf({ ...record, opponentName: "Line\r\nBreak\u0007Name" }, "Alice");

    expect(readSgfProperty(sgf, "PB")).toBe("Line\nBreakName");
    // A raw line break inside a property value would terminate the property line.
    expect(sgf.slice(0, -1)).not.toMatch(/[\r\n\u0007]/);
  });
});

/** Minimal SGF property reader: unescapes `\\`/`\]`/`\n` and stops at a bare `]`. */
function readSgfProperty(sgf: string, key: string): string {
  const start = sgf.indexOf(`${key}[`);

  if (start < 0) {
    throw new Error(`SGF is missing property ${key}`);
  }

  let index = start + key.length + 1;
  let value = "";

  while (index < sgf.length) {
    const character = sgf[index];

    if (character === "\\") {
      const next = sgf[index + 1];

      value += next === "n" ? "\n" : next;
      index += 2;
      continue;
    }

    if (character === "]") {
      return value;
    }

    value += character;
    index += 1;
  }

  throw new Error(`SGF property ${key} is unterminated`);
}

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
