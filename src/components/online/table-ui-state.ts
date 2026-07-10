import type { RoomClientState } from "@/server/room-contract";

export type TableUiState =
  | "spectating"
  | "spectating-can-sit"
  | "seated-waiting-opponent"
  | "seated-not-ready"
  | "seated-ready"
  | "ready-compat"
  | "playing-my-turn"
  | "playing-opponent-turn"
  | "undo-request-pending"
  | "undo-response-required"
  | "finished-host"
  | "finished-guest"
  | "abandoned";

export type TableUiStateInput = {
  canSit: boolean;
  room: Pick<RoomClientState, "role" | "seat" | "snapshot"> | null;
};

export function deriveTableUiState({ canSit, room }: TableUiStateInput): TableUiState | null {
  if (!room) {
    return null;
  }

  const { snapshot } = room;

  if (snapshot.status === "abandoned") {
    return "abandoned";
  }

  if (room.role === "spectator") {
    return canSit ? "spectating-can-sit" : "spectating";
  }

  if (!room.seat) {
    return null;
  }

  if (snapshot.status === "playing" && snapshot.undoRequest) {
    if (snapshot.undoRequest.requesterSeat === room.seat) {
      return "undo-request-pending";
    }

    if (snapshot.undoRequest.targetSeat === room.seat) {
      return "undo-response-required";
    }
  }

  if (snapshot.status === "waiting") {
    if (snapshot.players.length < 2) {
      return "seated-waiting-opponent";
    }

    const currentPlayer = snapshot.players.find((player) => player.seat === room.seat);

    return currentPlayer?.ready ? "seated-ready" : "seated-not-ready";
  }

  if (snapshot.status === "ready") {
    return "ready-compat";
  }

  if (snapshot.status === "finished") {
    return room.seat === snapshot.hostSeat ? "finished-host" : "finished-guest";
  }

  return snapshot.currentTurn === room.seat ? "playing-my-turn" : "playing-opponent-turn";
}
