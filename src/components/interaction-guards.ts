import type { AiDifficulty } from "@/game/ai";
import type { RoomParticipantRole, RoomStatus } from "@/server/rooms";
import type { GameMode } from "./online/workspace-state";
import type { FirstPlayer } from "./play/AiGameView";

export type ModeChangeDecision = "confirm-ai" | "confirm-online" | "direct" | "noop";

export function getModeChangeDecision({
  currentMode,
  localMoveCount,
  nextMode,
  onlineRole,
  onlineStatus
}: {
  currentMode: GameMode;
  localMoveCount: number;
  nextMode: GameMode;
  onlineRole: RoomParticipantRole | null;
  onlineStatus: RoomStatus | null;
}): ModeChangeDecision {
  if (currentMode === nextMode) {
    return "noop";
  }

  if (currentMode === "room" && requiresOnlineLeaveConfirmation(onlineRole, onlineStatus)) {
    return "confirm-online";
  }

  if (currentMode === "ai" && localMoveCount > 0) {
    return "confirm-ai";
  }

  return "direct";
}

export function requiresOnlineLeaveConfirmation(
  role: RoomParticipantRole | null,
  status: RoomStatus | null
): boolean {
  return role === "player" && status === "playing";
}

export function shouldDeferAiSettingChange(moveCount: number): boolean {
  return moveCount > 0;
}

export function resolveNextAiSettings({
  aiDifficulty,
  firstPlayer,
  pendingDifficulty,
  pendingFirstPlayer
}: {
  aiDifficulty: AiDifficulty;
  firstPlayer: FirstPlayer;
  pendingDifficulty: AiDifficulty | null;
  pendingFirstPlayer: FirstPlayer | null;
}): { aiDifficulty: AiDifficulty; firstPlayer: FirstPlayer } {
  return {
    aiDifficulty: pendingDifficulty ?? aiDifficulty,
    firstPlayer: pendingFirstPlayer ?? firstPlayer
  };
}
