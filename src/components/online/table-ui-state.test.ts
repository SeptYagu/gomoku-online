import { createBoard } from "@/game/board";
import type { Stone } from "@/game/types";
import type { RoomClientState } from "@/server/room-contract";
import type { RoomPlayerSnapshot, RoomSnapshot, RoomStatus, UndoRequestSnapshot } from "@/server/rooms";
import { describe, expect, it } from "vitest";
import { deriveTableUiState, type TableUiState, type TableUiStateInput } from "./table-ui-state";

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
      expected: "finished-host",
      input: createInput({ hostSeat: "black", status: "finished" }),
      name: "finished room host"
    },
    {
      expected: "finished-guest",
      input: createInput({ hostSeat: "white", status: "finished" }),
      name: "finished room guest"
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

function createInput({
  canSit = false,
  currentTurn = "black",
  hostSeat = "black",
  players = [createPlayer("black"), createPlayer("white")],
  role = "player",
  seat = "black",
  status = "waiting",
  undoRequest = null
}: {
  canSit?: boolean;
  currentTurn?: Stone;
  hostSeat?: Stone;
  players?: RoomPlayerSnapshot[];
  role?: RoomClientState["role"];
  seat?: Stone | null;
  status?: RoomStatus;
  undoRequest?: UndoRequestSnapshot | null;
} = {}): TableUiStateInput {
  const snapshot: RoomSnapshot = {
    board: createBoard(),
    chatMessages: [],
    code: "ABC123",
    createdAt: 1,
    currentTurn,
    finishReason: status === "finished" ? "draw" : null,
    gameId: "ABC123-1",
    hostSeat,
    moveSeq: 0,
    moves: [],
    players,
    spectators: [],
    status,
    undoRequest,
    updatedAt: 1,
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
