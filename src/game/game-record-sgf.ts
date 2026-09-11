import type { PlayerGameRecordSummary } from "../server/game-records";
import type { Point, Stone } from "./types";

export function serializeProfileRecordToSgf(record: PlayerGameRecordSummary, playerName: string): string {
  const blackName = record.playerSeat === "black" ? playerName : record.opponentName;
  const whiteName = record.playerSeat === "white" ? playerName : record.opponentName;
  const rootProperties = [
    "FF[4]",
    "GM[4]",
    `SZ[${record.board.length || 15}]`,
    "CA[UTF-8]",
    "AP[gomoku-online:profile-record]",
    `GN[${escapeSgfValue(record.gameId)}]`,
    `EV[${escapeSgfValue(record.roomCode)}]`,
    `DT[${formatSgfDate(record.finishedAt)}]`,
    `PB[${escapeSgfValue(blackName || "Black")}]`,
    `PW[${escapeSgfValue(whiteName || "White")}]`,
    `RE[${escapeSgfValue(formatSgfResult(record.winner, record.finishReason))}]`,
    `C[${escapeSgfValue(
      [
        `recordStatus=${record.recordStatus}`,
        `finishReason=${record.finishReason}`,
        `moveSeq=${record.moveSeq}`,
        `playerSeat=${record.playerSeat}`,
        `result=${record.result}`
      ].join("; ")
    )}]`
  ].join("");
  const moveNodes = record.moves.map((move) => `;${move.stone === "black" ? "B" : "W"}[${toSgfPoint(move)}]`);

  return `(;${rootProperties}${moveNodes.join("")})\n`;
}

export function createSgfDataUrl(sgf: string): string {
  return `data:application/x-go-sgf;charset=utf-8,${encodeURIComponent(sgf)}`;
}

export function getProfileRecordSgfFileName(record: PlayerGameRecordSummary): string {
  const safeGameId = sanitizeFileNamePart(record.gameId) || "game";

  return `gomoku-${safeGameId}.sgf`;
}

function formatSgfDate(timestamp: number): string {
  return new Date(timestamp).toISOString().slice(0, 10);
}

function formatSgfResult(winner: Stone | null, finishReason: PlayerGameRecordSummary["finishReason"]): string {
  if (!winner) {
    return finishReason === "abandoned" ? "Void" : "0";
  }

  const prefix = winner === "black" ? "B" : "W";

  if (finishReason === "five") {
    return `${prefix}+5`;
  }

  if (finishReason === "resign") {
    return `${prefix}+R`;
  }

  if (finishReason === "disconnect") {
    return `${prefix}+D`;
  }

  return `${prefix}+`;
}

export function toSgfPoint(point: Point): string {
  return `${String.fromCharCode(97 + point.col)}${String.fromCharCode(97 + point.row)}`;
}

/**
 * Escapes a value for use inside an SGF property (`PB[...]`).
 *
 * Per SGF FF[4] only `\`, `]` and line breaks are special *inside* a property
 * value — `(` `)` `;` are structural only outside values, so escaping them
 * would just inject stray backslashes into player-visible text. Control
 * characters have no representation at all, so they are dropped instead of
 * being emitted raw.
 */
export function escapeSgfValue(value: string): string {
  return stripControlCharacters(
    value.replace(/\\/g, "\\\\").replace(/\]/g, "\\]").replace(/\r\n?|\n/g, "\\n")
  );
}

function stripControlCharacters(value: string): string {
  return [...value]
    .filter((character) => {
      const code = character.codePointAt(0) ?? 0;

      return code >= 0x20 && code !== 0x7f;
    })
    .join("");
}

function sanitizeFileNamePart(value: string): string {
  return value.trim().replace(/[<>:"/\\|?*\u0000-\u001f]+/g, "-").replace(/\s+/g, "-").slice(0, 80);
}
