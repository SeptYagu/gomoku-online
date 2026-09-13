/**
 * 全局常量中枢 (Global Constants Registry)
 * 集中管理棋盘规则、字符限制、分页、时序超时与默认配置
 */

// ─── 棋盘与规则 ───
export const BOARD_SIZE = 15;
export const WIN_STONE_COUNT = 5;

// ─── 长度限制 ───
export const MAX_CHAT_MESSAGE_LENGTH = 160;
export const MAX_PLAYER_NAME_LENGTH = 24;

// ─── 默认配置 ───
export const DEFAULT_PLAYER_NAME = "Player";

// ─── 分页配置 ───
export const PAGINATION = {
  LOBBY_ROOMS: 20,
  PRESENCE_USERS: 30,
  LEADERBOARD: 10,
  PLAYER_PROFILE_RECORDS: 50,
  DEFAULT_PROFILE_RECORDS: 20,
} as const;

// ─── 时序与超时 ───
export const LIFECYCLE_SWEEP_INTERVAL_MS = 10_000;
export const COPY_FEEDBACK_DURATION_MS = 1_800;
export const DISCONNECT_GRACE_MS = 60_000;
export const EMPTY_ROOM_GRACE_MS = 60_000;
// 注：CHAT_ACK_TIMEOUT_MS (8_000) 已在 chat-send-gate.ts:15 定义，保持不动
// 注：LEAVE_ROOM_TIMEOUT_MS (8_000) 已在 leave-room-attempt.ts:8 定义，保持不动
