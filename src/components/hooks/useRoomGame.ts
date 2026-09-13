"use client";

import { useCallback } from "react";
import type { Point } from "@/game/types";
import type { RoomAck, RoomClientState } from "@/server/room-contract";
import {
  getPlayerBySeat,
  hasOpenPlayerSeat,
  type RoomSocket
} from "./room-state-utils";

export type UseRoomGameProps = {
  enabled: boolean;
  room: RoomClientState | null;
  ensureSocket: () => RoomSocket;
  applyRoomAck: (response: RoomAck) => void;
};

export function useRoomGame({
  enabled,
  room,
  ensureSocket,
  applyRoomAck
}: UseRoomGameProps) {
  const isPlayer = room?.role === "player" && room.seat !== null;
  const currentPlayer = isPlayer ? getPlayerBySeat(room.snapshot, room.seat) : null;
  const ready = currentPlayer?.ready ?? false;
  const lastMove = room?.snapshot.moves.at(-1) ?? null;
  const hasPendingUndoRequest = room?.snapshot.undoRequest !== null && room?.snapshot.undoRequest !== undefined;

  const canReady = enabled && isPlayer && room?.snapshot.status === "waiting";
  const canPlay =
    enabled && isPlayer && room?.snapshot.status === "playing" && room.snapshot.currentTurn === room.seat && !hasPendingUndoRequest;
  const canResign = enabled && isPlayer && room?.snapshot.status === "playing";
  const canRematch = enabled && isPlayer && room?.snapshot.status === "finished";
  const rematchReady = Boolean(isPlayer && room?.seat && room.snapshot.rematch.readySeats.includes(room.seat));
  const canSit = enabled && room?.role === "spectator" && hasOpenPlayerSeat(room.snapshot);
  const canUndo =
    enabled &&
    isPlayer &&
    room?.snapshot.status === "playing" &&
    lastMove?.stone === room.seat &&
    !hasPendingUndoRequest &&
    (currentPlayer?.undoRequestsRemaining ?? 0) > 0;

  const toggleReady = useCallback(() => {
    if (!room) {
      return;
    }

    ensureSocket().emit("room:ready", { ready: !ready, roomCode: room.snapshot.code }, applyRoomAck);
  }, [applyRoomAck, ensureSocket, ready, room]);

  const playMove = useCallback((point: Point) => {
    if (!room || !canPlay) {
      return;
    }

    ensureSocket().emit(
      "game:move",
      {
        expectedMoveSeq: room.snapshot.moveSeq,
        point,
        roomCode: room.snapshot.code
      },
      applyRoomAck
    );
  }, [applyRoomAck, canPlay, ensureSocket, room]);

  const resignGame = useCallback(() => {
    if (!room) {
      return;
    }

    ensureSocket().emit("game:resign", { roomCode: room.snapshot.code }, applyRoomAck);
  }, [applyRoomAck, ensureSocket, room]);

  const undoMove = useCallback(() => {
    if (!room || !canUndo) {
      return;
    }

    ensureSocket().emit("game:undo-request", { roomCode: room.snapshot.code }, applyRoomAck);
  }, [applyRoomAck, canUndo, ensureSocket, room]);

  const respondUndoRequest = useCallback((accepted: boolean) => {
    const undoRequest = room?.snapshot.undoRequest;

    if (!room || !undoRequest) {
      return;
    }

    ensureSocket().emit(
      "game:undo-respond",
      { accepted, requestId: undoRequest.id, roomCode: room.snapshot.code },
      applyRoomAck
    );
  }, [applyRoomAck, ensureSocket, room]);

  const setRematchReady = useCallback((nextReady: boolean) => {
    if (!room) {
      return;
    }

    ensureSocket().emit("game:rematch-ready", { ready: nextReady, roomCode: room.snapshot.code }, applyRoomAck);
  }, [applyRoomAck, ensureSocket, room]);

  const sitRoom = useCallback(() => {
    if (!room) {
      return;
    }

    ensureSocket().emit("room:sit", { roomCode: room.snapshot.code }, applyRoomAck);
  }, [applyRoomAck, ensureSocket, room]);

  return {
    canPlay,
    canReady,
    canRematch,
    canResign,
    canSit,
    canUndo,
    ready,
    rematchReady,
    playMove,
    toggleReady,
    resignGame,
    setRematchReady,
    respondUndoRequest,
    undoMove,
    sitRoom
  };
}
