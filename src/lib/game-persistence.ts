import type { AiDifficulty } from "@/game/ai";
import type { Move } from "@/game/types";
import { BOARD_SIZE } from "@/lib/constants";
import type { GameMode } from "@/components/online/workspace-state";
import type { FirstPlayer } from "@/components/play/AiGameView";

export const ACTIVE_GAME_STORAGE_KEY = "gomoku-active-game";
export const SELECTED_WORKSPACE_STORAGE_KEY = "gomoku-selected-workspace";

export type StoredLocalGameSession = {
  mode: "local";
  moves: Move[];
  updatedAt: number;
};

export type StoredAiGameSession = {
  mode: "ai";
  moves: Move[];
  aiDifficulty: AiDifficulty;
  firstPlayer: FirstPlayer;
  openingSeed: number;
  updatedAt: number;
};

export type StoredActiveGame = StoredLocalGameSession | StoredAiGameSession;

const AI_DIFFICULTIES = new Set<AiDifficulty>(["normal", "hard", "expert", "insane"]);
const FIRST_PLAYERS = new Set<FirstPlayer>(["human", "ai"]);
const VALID_WORKSPACES = new Set<GameMode>(["local", "ai", "room"]);

type GameSessionCandidate = {
  mode?: unknown;
  moves?: unknown;
  updatedAt?: unknown;
  aiDifficulty?: unknown;
  firstPlayer?: unknown;
  openingSeed?: unknown;
};

/**
 * 校验存储对象是否为结构完备且落子合法的活跃对局数据。
 */
export function isValidActiveGame(data: unknown): data is StoredActiveGame {
  if (!data || typeof data !== "object") {
    return false;
  }

  const candidate = data as GameSessionCandidate;

  if (candidate.mode !== "local" && candidate.mode !== "ai") {
    return false;
  }

  if (typeof candidate.updatedAt !== "number" || !Number.isFinite(candidate.updatedAt)) {
    return false;
  }

  if (!Array.isArray(candidate.moves)) {
    return false;
  }

  const moves = candidate.moves;
  const occupied = new Set<string>();

  for (let index = 0; index < moves.length; index += 1) {
    const move = moves[index];
    if (!move || typeof move !== "object") {
      return false;
    }

    if (
      typeof move.row !== "number" ||
      !Number.isInteger(move.row) ||
      move.row < 0 ||
      move.row >= BOARD_SIZE
    ) {
      return false;
    }

    if (
      typeof move.col !== "number" ||
      !Number.isInteger(move.col) ||
      move.col < 0 ||
      move.col >= BOARD_SIZE
    ) {
      return false;
    }

    if (move.stone !== "black" && move.stone !== "white") {
      return false;
    }

    if (move.moveNumber !== index + 1) {
      return false;
    }

    // 五子棋黑棋先手
    if (index === 0 && move.stone !== "black") {
      return false;
    }

    // 颜色严格交替
    if (index > 0 && move.stone === moves[index - 1].stone) {
      return false;
    }

    // 坐标不能重复落子
    const posKey = `${move.row},${move.col}`;
    if (occupied.has(posKey)) {
      return false;
    }
    occupied.add(posKey);
  }

  if (candidate.mode === "ai") {
    if (typeof candidate.aiDifficulty !== "string" || !AI_DIFFICULTIES.has(candidate.aiDifficulty as AiDifficulty)) {
      return false;
    }
    if (typeof candidate.firstPlayer !== "string" || !FIRST_PLAYERS.has(candidate.firstPlayer as FirstPlayer)) {
      return false;
    }
    if (typeof candidate.openingSeed !== "number" || !Number.isFinite(candidate.openingSeed)) {
      return false;
    }
  }

  return true;
}

export function saveActiveLocalGame(moves: Move[]): void {
  if (typeof window === "undefined") {
    return;
  }

  if (moves.length === 0) {
    clearActiveGame();
    return;
  }

  const session: StoredLocalGameSession = {
    mode: "local",
    moves,
    updatedAt: Date.now()
  };

  try {
    window.sessionStorage.setItem(ACTIVE_GAME_STORAGE_KEY, JSON.stringify(session));
  } catch {
    // 忽略 QuotaExceeded 等环境异常
  }
}

export function saveActiveAiGame(
  moves: Move[],
  aiDifficulty: AiDifficulty,
  firstPlayer: FirstPlayer,
  openingSeed: number
): void {
  if (typeof window === "undefined") {
    return;
  }

  if (moves.length === 0) {
    clearActiveGame();
    return;
  }

  const session: StoredAiGameSession = {
    mode: "ai",
    moves,
    aiDifficulty,
    firstPlayer,
    openingSeed,
    updatedAt: Date.now()
  };

  try {
    window.sessionStorage.setItem(ACTIVE_GAME_STORAGE_KEY, JSON.stringify(session));
  } catch {
    // 忽略 QuotaExceeded 等环境异常
  }
}

export function clearActiveGame(): void {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.sessionStorage.removeItem(ACTIVE_GAME_STORAGE_KEY);
  } catch {
    // 忽略异常
  }
}

export function readActiveGame(): StoredActiveGame | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const raw = window.sessionStorage.getItem(ACTIVE_GAME_STORAGE_KEY);
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw);
    if (isValidActiveGame(parsed)) {
      return parsed;
    }

    // 数据已损坏或校验失败，静默清理并安全回退
    clearActiveGame();
    return null;
  } catch {
    clearActiveGame();
    return null;
  }
}

export function saveSelectedWorkspace(mode: GameMode): void {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.sessionStorage.setItem(SELECTED_WORKSPACE_STORAGE_KEY, mode);
  } catch {
    // 忽略异常
  }
}

export function readSelectedWorkspace(): GameMode | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const raw = window.sessionStorage.getItem(SELECTED_WORKSPACE_STORAGE_KEY);
    if (raw && VALID_WORKSPACES.has(raw as GameMode)) {
      return raw as GameMode;
    }
    return null;
  } catch {
    return null;
  }
}

export function clearSelectedWorkspace(): void {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.sessionStorage.removeItem(SELECTED_WORKSPACE_STORAGE_KEY);
  } catch {
    // 忽略异常
  }
}
