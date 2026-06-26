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

function toSgfPoint(point: Point): string {
  return `${String.fromCharCode(97 + point.col)}${String.fromCharCode(97 + point.row)}`;
}

function escapeSgfValue(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/\]/g, "\\]").replace(/\r?\n/g, "\\n");
}

function sanitizeFileNamePart(value: string): string {
  return value.trim().replace(/[<>:"/\\|?*\u0000-\u001f]+/g, "-").replace(/\s+/g, "-").slice(0, 80);
}
