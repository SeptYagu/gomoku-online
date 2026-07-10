import { createBoard } from "@/game/board";
import type { Stone } from "@/game/types";
import type { RoomClientState } from "@/server/room-contract";
import type { RoomPlayerSnapshot, RoomSnapshot, RoomStatus, UndoRequestSnapshot } from "@/server/rooms";
import { describe, expect, it } from "vitest";
import {
  deriveTableUiState,
  getTableActions,
  type TableActionCapabilities,
  type TableActionId,
  type TableUiState,
  type TableUiStateInput
} from "./table-ui-state";

describe("deriveTableUiState", () => {
  const cases: Array<{ expected: TableUiState; input: TableUiStateInput; name: string }> = [
    {
      expected: "spectating",
      input: createInput({ role: "spectator", seat: null }),
      name: "spectator without an open seat"
    },
    {
      expected: "spectating-can-sit",
      input: createInput({ canSit: true, role: "spectator", seat: null }),
      name: "spectator with an open seat"
    },
    {
      expected: "seated-waiting-opponent",
      input: createInput({ players: [createPlayer("black")] }),
      name: "seated player waiting for an opponent"
    },
    {
      expected: "seated-not-ready",
      input: createInput({ players: [createPlayer("black"), createPlayer("white")] }),
      name: "seated player who has not readied"
    },
    {
      expected: "seated-ready",
      input: createInput({ players: [createPlayer("black", true), createPlayer("white")] }),
      name: "seated player waiting for opponent readiness"
    },
    {
      expected: "ready-compat",
      input: createInput({ status: "ready" }),
      name: "compatibility ready state"
    },
    {
      expected: "playing-my-turn",
      input: createInput({ currentTurn: "black", status: "playing" }),
      name: "playing on the current player's turn"
    },
    {
      expected: "playing-opponent-turn",
      input: createInput({ currentTurn: "white", status: "playing" }),
      name: "playing on the opponent's turn"
    },
    {
      expected: "undo-request-pending",
      input: createInput({ status: "playing", undoRequest: createUndoRequest("black", "white") }),
      name: "undo requester waiting for a response"
    },
    {
      expected: "undo-response-required",
      input: createInput({
        seat: "white",
        status: "playing",
        undoRequest: createUndoRequest("black", "white")
      }),
      name: "undo target required to respond"
    },
    {
      expected: "finished-rematch-open",
      input: createInput({ status: "finished" }),
      name: "finished player who has not requested a rematch"
    },
    {
      expected: "finished-rematch-ready",
      input: createInput({ rematchReadySeats: ["black"], status: "finished" }),
      name: "finished player waiting for the opponent's rematch choice"
    },
    {
      expected: "abandoned",
      input: createInput({ status: "abandoned" }),
      name: "abandoned room"
    }
  ];

  for (const testCase of cases) {
    it(testCase.name, () => {
      expect(deriveTableUiState(testCase.input)).toBe(testCase.expected);
    });
  }

  it("returns null outside a table", () => {
    expect(deriveTableUiState({ canSit: false, room: null })).toBeNull();
  });
});

describe("getTableActions", () => {
  const enabledCapabilities: TableActionCapabilities = {
    canCancelMatch: true,
    canReady: true,
    canReplay: true,
    canRematch: true,
    canResign: true,
    canSit: true,
    canUndo: true,
    ready: false
  };
  const cases: Array<{
    expected: TableActionId[];
    state: TableUiState;
    capabilities?: Partial<TableActionCapabilities>;
  }> = [
    { expected: ["leave"], state: "spectating" },
    { expected: ["sit", "leave"], state: "spectating-can-sit" },
    { expected: ["cancel-wait", "copy-invite"], state: "seated-waiting-opponent" },
    { expected: ["ready", "leave"], state: "seated-not-ready" },
    { expected: ["unready", "leave"], state: "seated-ready", capabilities: { ready: true } },
    { expected: ["leave"], state: "ready-compat" },
    { expected: ["undo", "resign", "leave"], state: "playing-my-turn" },
    { expected: ["undo", "resign", "leave"], state: "playing-opponent-turn" },
    { expected: ["resign", "leave"], state: "undo-request-pending" },
    { expected: ["reject-undo", "allow-undo"], state: "undo-response-required" },
    { expected: ["rematch-ready", "replay", "leave"], state: "finished-rematch-open" },
    { expected: ["rematch-cancel", "replay", "leave"], state: "finished-rematch-ready" },
    { expected: ["replay", "leave"], state: "abandoned" }
  ];

  for (const testCase of cases) {
    it(`orders actions for ${testCase.state}`, () => {
      const actions = getTableActions(testCase.state, {
        ...enabledCapabilities,
        ...testCase.capabilities
      });

      expect(actions.map((action) => action.id)).toEqual(testCase.expected);
      expect(actions.length).toBeLessThanOrEqual(4);
      expect(actions.filter((action) => action.placement === "task")).toHaveLength(
        testCase.state === "undo-response-required" ? 2 : actions.some((action) => action.placement === "task") ? 1 : 0
      );
    });
  }

  it("hides actions when their controller capability is false", () => {
    const capabilities: TableActionCapabilities = {
      canCancelMatch: false,
      canReady: false,
      canReplay: false,
      canRematch: false,
      canResign: false,
      canSit: false,
      canUndo: false,
      ready: false
    };

    expect(getTableActions("spectating-can-sit", capabilities).map((action) => action.id)).toEqual(["leave"]);
    expect(getTableActions("seated-waiting-opponent", capabilities).map((action) => action.id)).toEqual([
      "copy-invite",
      "leave"
    ]);
    expect(getTableActions("seated-not-ready", capabilities).map((action) => action.id)).toEqual(["leave"]);
    expect(getTableActions("playing-my-turn", capabilities).map((action) => action.id)).toEqual(["leave"]);
    expect(getTableActions("finished-rematch-open", capabilities).map((action) => action.id)).toEqual(["leave"]);
  });
});

function createInput({
  canSit = false,
  currentTurn = "black",
  hostSeat = "black",
  players = [createPlayer("black"), createPlayer("white")],
  rematchReadySeats = [],
  role = "player",
  seat = "black",
  status = "waiting",
  undoRequest = null
}: {
  canSit?: boolean;
  currentTurn?: Stone;
  hostSeat?: Stone;
  players?: RoomPlayerSnapshot[];
  rematchReadySeats?: Stone[];
  role?: RoomClientState["role"];
  seat?: Stone | null;
  status?: RoomStatus;
  undoRequest?: UndoRequestSnapshot | null;
} = {}): TableUiStateInput {
  const snapshot: RoomSnapshot = {
    allowJoinByHostHandle: true,
    board: createBoard(),
    chatMessages: [],
    code: "ABC123",
    createdAt: 1,
    currentTurn,
    finishReason: status === "finished" ? "draw" : null,
    gameId: "ABC123-1",
    hostPublicHandle: null,
    hostSeat,
    moveSeq: 0,
    moves: [],
    players,
    previousGameId: null,
    rematch: { readySeats: rematchReadySeats, requestedAt: {} },
    spectators: [],
    status,
    undoRequest,
    updatedAt: 1,
    visibility: "public",
    winner: null,
    winLine: []
  };

  return {
    canSit,
    room: {
      role,
      seat,
      snapshot
    }
  };
}

function createPlayer(seat: Stone, ready = false): RoomPlayerSnapshot {
  return {
    connected: true,
    disconnectDeadline: null,
    name: `${seat} player`,
    ready,
    seat,
    undoRequestsRemaining: 3
  };
}

function createUndoRequest(requesterSeat: Stone, targetSeat: Stone): UndoRequestSnapshot {
  return {
    expiresAt: 2,
    id: "undo-1",
    moveSeq: 1,
    requestedAt: 1,
    requesterSeat,
    targetSeat
  };
}
