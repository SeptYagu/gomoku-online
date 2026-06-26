import type { GameRecordStatus, SavedGameRecord } from "./game-records";
import type { Point, Stone } from "../game/types";

export type GameRecordExportFormat = "jsonl" | "sgf";
export type GameRecordExportStatus = "all" | GameRecordStatus;

export function filterGameRecordsForExport(
  records: SavedGameRecord[],
  status: GameRecordExportStatus = "verified"
): SavedGameRecord[] {
  return records
    .filter((record) => status === "all" || record.recordStatus === status)
    .sort((left, right) => left.finishedAt - right.finishedAt || left.gameId.localeCompare(right.gameId));
}

export function serializeGameRecordsForExport(records: SavedGameRecord[], format: GameRecordExportFormat): string {
  return format === "jsonl" ? serializeGameRecordsToJsonl(records) : serializeGameRecordsToSgf(records);
}

export function serializeGameRecordsToJsonl(records: SavedGameRecord[]): string {
  if (records.length === 0) {
    return "";
  }

  return `${records.map((record) => JSON.stringify(record)).join("\n")}\n`;
}

export function serializeGameRecordsToSgf(records: SavedGameRecord[]): string {
  if (records.length === 0) {
    return "";
  }

  return `${records.map(serializeGameRecordToSgf).join("\n")}\n`;
}

function serializeGameRecordToSgf(record: SavedGameRecord): string {
  const blackPlayer = record.players.find((player) => player.seat === "black");
  const whitePlayer = record.players.find((player) => player.seat === "white");
  const rootProperties = [
    "FF[4]",
    "GM[4]",
    `SZ[${record.board.length || 15}]`,
    "CA[UTF-8]",
    "AP[gomoku-online:game-record-export]",
    `GN[${escapeSgfValue(record.gameId)}]`,
    `EV[${escapeSgfValue(record.roomCode)}]`,
    `DT[${formatSgfDate(record.finishedAt)}]`,
    `PB[${escapeSgfValue(blackPlayer?.name ?? "Black")}]`,
    `PW[${escapeSgfValue(whitePlayer?.name ?? "White")}]`,
    `RE[${escapeSgfValue(formatSgfResult(record.winner, record.finishReason))}]`,
    `C[${escapeSgfValue(
      [
        `recordStatus=${record.recordStatus}`,
        `finishReason=${record.finishReason}`,
        `moveSeq=${record.moveSeq}`,
        `blackIdentity=${blackPlayer?.identity ?? "guest"}`,
        `whiteIdentity=${whitePlayer?.identity ?? "guest"}`,
        `blackId=${blackPlayer?.playerId ?? ""}`,
        `whiteId=${whitePlayer?.playerId ?? ""}`
      ].join("; ")
    )}]`
  ].join("");
  const moveNodes = record.moves.map((move) => `;${move.stone === "black" ? "B" : "W"}[${toSgfPoint(move)}]`);

  return `(;${rootProperties}${moveNodes.join("")})`;
}

function formatSgfDate(timestamp: number): string {
  return new Date(timestamp).toISOString().slice(0, 10);
}

function formatSgfResult(winner: Stone | null, finishReason: SavedGameRecord["finishReason"]): string {
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
