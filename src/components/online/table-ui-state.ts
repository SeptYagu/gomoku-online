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

export type TableActionId =
  | "allow-undo"
  | "cancel-wait"
  | "copy-invite"
  | "leave"
  | "ready"
  | "reject-undo"
  | "resign"
  | "restart"
  | "sit"
  | "undo"
  | "unready";

export type TableActionPlacement = "task" | "toolbar";

export type TableAction = {
  id: TableActionId;
  placement: TableActionPlacement;
};

export type TableActionCapabilities = {
  canCancelMatch: boolean;
  canReady: boolean;
  canResign: boolean;
  canRestart: boolean;
  canSit: boolean;
  canUndo: boolean;
  ready: boolean;
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

export function getTableActions(
  state: TableUiState,
  capabilities: TableActionCapabilities
): TableAction[] {
  switch (state) {
    case "spectating":
      return [action("leave", "toolbar")];
    case "spectating-can-sit":
      return [
        ...(capabilities.canSit ? [action("sit", "task")] : []),
        action("leave", "toolbar")
      ];
    case "seated-waiting-opponent":
      return [
        ...(capabilities.canCancelMatch ? [action("cancel-wait", "task")] : []),
        action("copy-invite", "toolbar"),
        ...(!capabilities.canCancelMatch ? [action("leave", "toolbar")] : [])
      ];
    case "seated-not-ready":
      return [
        ...(capabilities.canReady && !capabilities.ready ? [action("ready", "task")] : []),
        action("leave", "toolbar")
      ];
    case "seated-ready":
      return [
        ...(capabilities.canReady && capabilities.ready ? [action("unready", "task")] : []),
        action("leave", "toolbar")
      ];
    case "ready-compat":
      return [action("leave", "toolbar")];
    case "playing-my-turn":
    case "playing-opponent-turn":
      return [
        ...(capabilities.canUndo ? [action("undo", "toolbar")] : []),
        ...(capabilities.canResign ? [action("resign", "toolbar")] : []),
        action("leave", "toolbar")
      ];
    case "undo-request-pending":
      return [
        ...(capabilities.canResign ? [action("resign", "toolbar")] : []),
        action("leave", "toolbar")
      ];
    case "undo-response-required":
      return [action("reject-undo", "task"), action("allow-undo", "task")];
    case "finished-host":
      return [
        ...(capabilities.canRestart ? [action("restart", "task")] : []),
        action("leave", "toolbar")
      ];
    case "finished-guest":
      return [action("leave", "toolbar")];
    case "abandoned":
      return [action("leave", "task")];
  }
}

function action(id: TableActionId, placement: TableActionPlacement): TableAction {
  return { id, placement };
}
