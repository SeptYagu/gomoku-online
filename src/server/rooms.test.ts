import { describe, expect, it } from "vitest";
import { RoomStore, createRoomCode, type RoomResult, type RoomSnapshot } from "./rooms";

describe("RoomStore", () => {
  it("creates rooms with a host in the black seat and public snapshots", () => {
    const store = createTestRoomStore(["ROOM01"]);
    const created = expectOk(
      store.createRoom({
        playerId: "player-1",
        playerName: "Alice"
      })
    );

    expect(created.code).toBe("ROOM01");
    expect(created.status).toBe("waiting");
    expect(created.currentTurn).toBe("black");
    expect(created.moveSeq).toBe(0);
    expect(created.players).toEqual([
      {
        connected: true,
        disconnectDeadline: null,
        name: "Alice",
        ready: false,
        seat: "black",
        undoRequestsRemaining: 3
      }
    ]);
    expect(created.players[0]).not.toHaveProperty("id");
    expect(created.board).toHaveLength(15);
    expect(created.board.flat().every((cell) => cell === null)).toBe(true);
  });

  it("normalizes room codes and rejects full, duplicate, or invalid joins", () => {
    const store = createTestRoomStore(["ROOM01"]);
    expectOk(store.createRoom({ playerId: "player-1", playerName: "Alice" }));

    const joined = expectOk(store.joinRoom(" room01 ", { playerId: "player-2", playerName: "Bob" }));

    expect(joined.players.map((player) => player.seat)).toEqual(["black", "white"]);
    expect(store.joinRoom("ROOM01", { playerId: "player-2", playerName: "Robert" })).toMatchObject({
      ok: false,
      error: { code: "duplicate-player" }
    });
    expect(store.joinRoom("ROOM01", { playerId: "player-3", playerName: " alice " })).toMatchObject({
      ok: false,
      error: { code: "duplicate-name" }
    });
    expect(store.joinRoom("ROOM01", { playerId: "player-4", playerName: "Cara" })).toMatchObject({
      ok: false,
      error: { code: "room-full" }
    });
    expect(store.joinRoom("MISSING", { playerId: "player-5", playerName: "Dana" })).toMatchObject({
      ok: false,
      error: { code: "room-not-found" }
    });
  });

  it("starts automatically when both players are ready", () => {
    const store = createTestRoomStore(["ROOM01"]);
    const created = expectOk(store.createRoom({ playerId: "player-1", playerName: "Alice" }));

    expectOk(store.joinRoom(created.code, { playerId: "player-2", playerName: "Bob" }));

    const waiting = expectOk(store.setPlayerReady(created.code, "player-1"));

    expect(waiting.status).toBe("waiting");

    const started = expectOk(store.setPlayerReady(created.code, "player-2"));

    expect(started.status).toBe("playing");
    expect(started.currentTurn).toBe("black");

    expect(store.setPlayerReady(started.code, "player-1", false)).toMatchObject({
      ok: false,
      error: { code: "game-already-started" }
    });
  });

  it("rejects starting before both players are present and ready", () => {
    const store = createTestRoomStore(["ROOM01"]);
    const room = expectOk(store.createRoom({ playerId: "player-1", playerName: "Alice" }));

    expect(store.startGame(room.code, "player-1")).toMatchObject({
      ok: false,
      error: { code: "room-not-ready" }
    });

    expectOk(store.joinRoom(room.code, { playerId: "player-2", playerName: "Bob" }));
    expectOk(store.setPlayerReady(room.code, "player-1"));

    expect(store.startGame(room.code, "player-1")).toMatchObject({
      ok: false,
      error: { code: "room-not-ready" }
    });
  });

  it("applies moves authoritatively and rejects stale, illegal, or wrong-turn moves", () => {
    const { store, room } = createStartedRoom();

    expect(store.applyMove(room.code, { playerId: "player-2", point: { row: 7, col: 7 } })).toMatchObject({
      ok: false,
      error: { code: "not-your-turn" }
    });
    expect(store.applyMove(room.code, { playerId: "player-1", expectedMoveSeq: 1, point: { row: 7, col: 7 } })).toMatchObject({
      ok: false,
      error: { code: "move-seq-mismatch" }
    });

    const firstMove = expectOk(
      store.applyMove(room.code, {
        expectedMoveSeq: 0,
        playerId: "player-1",
        point: { row: 7, col: 7 }
      })
    );

    expect(firstMove.board[7][7]).toBe("black");
    expect(firstMove.currentTurn).toBe("white");
    expect(firstMove.moveSeq).toBe(1);
    expect(firstMove.moves).toEqual([{ row: 7, col: 7, moveNumber: 1, stone: "black" }]);

    expect(store.applyMove(room.code, { playerId: "player-2", point: { row: 7, col: 7 } })).toMatchObject({
      ok: false,
      error: { code: "spot-unavailable" }
    });
    expect(store.applyMove(room.code, { playerId: "player-2", point: { row: -1, col: 7 } })).toMatchObject({
      ok: false,
      error: { code: "spot-unavailable" }
    });
    expect(store.applyMove(room.code, { playerId: "intruder", point: { row: 8, col: 7 } })).toMatchObject({
      ok: false,
      error: { code: "not-room-member" }
    });
  });

  it("lets the last mover request undo and applies it only after opponent approval", () => {
    const { store, room } = createStartedRoom();
    const firstMove = expectOk(
      store.applyMove(room.code, {
        expectedMoveSeq: 0,
        playerId: "player-1",
        point: { row: 7, col: 7 }
      })
    );

    expect(firstMove.board[7][7]).toBe("black");
    expect(firstMove.currentTurn).toBe("white");
    expect(store.requestUndo(room.code, "player-2")).toMatchObject({
      ok: false,
      error: { code: "not-last-move-player" }
    });

    const requested = expectOk(store.requestUndo(room.code, "player-1"));
    const requestId = requested.undoRequest?.id ?? "";

    expect(requested.undoRequest).toMatchObject({
      moveSeq: 1,
      requesterSeat: "black",
      targetSeat: "white"
    });
    expect(requested.players.find((player) => player.seat === "black")?.undoRequestsRemaining).toBe(2);
    expect(requested.board[7][7]).toBe("black");
    expect(store.requestUndo(room.code, "player-1")).toMatchObject({
      ok: false,
      error: { code: "undo-request-pending" }
    });
    expect(store.respondToUndo(room.code, "player-1", requestId, true)).toMatchObject({
      ok: false,
      error: { code: "not-undo-request-target" }
    });

    const undone = expectOk(store.respondToUndo(room.code, "player-2", requestId, true));

    expect(undone.board[7][7]).toBeNull();
    expect(undone.currentTurn).toBe("black");
    expect(undone.moveSeq).toBe(0);
    expect(undone.moves).toEqual([]);
    expect(undone.undoRequest).toBeNull();
    expect(store.requestUndo(room.code, "player-1")).toMatchObject({
      ok: false,
      error: { code: "no-moves-to-undo" }
    });
  });

  it("blocks repeated undo requests for the same rejected board position", () => {
    const { store, room } = createStartedRoom();

    expectOk(store.applyMove(room.code, { playerId: "player-1", point: { row: 7, col: 7 } }));
    const requested = expectOk(store.requestUndo(room.code, "player-1"));
    const rejected = expectOk(store.respondToUndo(room.code, "player-2", requested.undoRequest?.id ?? "", false));

    expect(rejected.board[7][7]).toBe("black");
    expect(rejected.undoRequest).toBeNull();
    expect(store.requestUndo(room.code, "player-1")).toMatchObject({
      ok: false,
      error: { code: "undo-request-rejected-position" }
    });

    expectOk(store.applyMove(room.code, { playerId: "player-2", point: { row: 7, col: 8 } }));
    expect(store.requestUndo(room.code, "player-2")).toMatchObject({
      ok: true,
      value: { undoRequest: { requesterSeat: "white" } }
    });
  });

  it("limits each player to three undo requests per game", () => {
    const { store, room } = createStartedRoom();

    playAndRejectUndo(store, room.code, "player-1", "player-2", 7, 7);
    expectOk(store.applyMove(room.code, { playerId: "player-2", point: { row: 7, col: 8 } }));
    playAndRejectUndo(store, room.code, "player-1", "player-2", 8, 8);
    expectOk(store.applyMove(room.code, { playerId: "player-2", point: { row: 8, col: 7 } }));
    playAndRejectUndo(store, room.code, "player-1", "player-2", 9, 9);
    expectOk(store.applyMove(room.code, { playerId: "player-2", point: { row: 9, col: 8 } }));
    expectOk(store.applyMove(room.code, { playerId: "player-1", point: { row: 10, col: 10 } }));

    expect(store.requestUndo(room.code, "player-1")).toMatchObject({
      ok: false,
      error: { code: "undo-request-limit" }
    });
  });

  it("expires pending undo requests as rejected after ten seconds", () => {
    let now = 1_780_000_000_000;
    const store = new RoomStore({
      codeGenerator: () => "ROOM01",
      now: () => now
    });
    const created = expectOk(store.createRoom({ playerId: "player-1", playerName: "Alice" }));

    expectOk(store.joinRoom(created.code, { playerId: "player-2", playerName: "Bob" }));
    expectOk(store.setPlayerReady(created.code, "player-1"));
    expectOk(store.setPlayerReady(created.code, "player-2"));
    expectOk(store.applyMove(created.code, { playerId: "player-1", point: { row: 7, col: 7 } }));

    const requested = expectOk(store.requestUndo(created.code, "player-1"));

    expect(requested.undoRequest?.expiresAt).toBe(now + 10_000);

    now += 10_001;

    const expired = expectOk(store.getSnapshot(created.code));

    expect(expired.undoRequest).toBeNull();
    expect(store.requestUndo(created.code, "player-1")).toMatchObject({
      ok: false,
      error: { code: "undo-request-rejected-position" }
    });
  });

  it("detects wins from the authoritative board and locks finished games", () => {
    const { store, room } = createStartedRoom();
    const moves: Array<[string, number, number]> = [
      ["player-1", 7, 3],
      ["player-2", 8, 3],
      ["player-1", 7, 4],
      ["player-2", 8, 4],
      ["player-1", 7, 5],
      ["player-2", 8, 5],
      ["player-1", 7, 6],
      ["player-2", 8, 6],
      ["player-1", 7, 7]
    ];
    let latest = room;

    moves.forEach(([playerId, row, col], index) => {
      latest = expectOk(
        store.applyMove(room.code, {
          expectedMoveSeq: index,
          playerId,
          point: { row, col }
        })
      );
    });

    expect(latest.status).toBe("finished");
    expect(latest.winner).toBe("black");
    expect(latest.winLine).toEqual([
      { row: 7, col: 3 },
      { row: 7, col: 4 },
      { row: 7, col: 5 },
      { row: 7, col: 6 },
      { row: 7, col: 7 }
    ]);
    expect(store.applyMove(room.code, { playerId: "player-2", point: { row: 9, col: 9 } })).toMatchObject({
      ok: false,
      error: { code: "game-not-playing" }
    });
  });

  it("supports resigning and connection status updates", () => {
    const { store, room } = createStartedRoom();
    const disconnected = expectOk(store.markDisconnected(room.code, "player-2"));

    expect(disconnected.players.find((player) => player.seat === "white")?.connected).toBe(false);
    expect(disconnected.players.find((player) => player.seat === "white")?.disconnectDeadline).toBeGreaterThan(
      disconnected.updatedAt
    );

    const restored = expectOk(store.restoreConnection(room.code, "player-2"));

    expect(restored.players.find((player) => player.seat === "white")?.connected).toBe(true);
    expect(restored.players.find((player) => player.seat === "white")?.disconnectDeadline).toBeNull();

    const resigned = expectOk(store.resignGame(room.code, "player-2"));

    expect(resigned.status).toBe("finished");
    expect(resigned.winner).toBe("black");
    expect(store.resignGame(room.code, "player-1")).toMatchObject({
      ok: false,
      error: { code: "game-not-playing" }
    });
  });

  it("restores known players by id after disconnect", () => {
    const { store, room } = createStartedRoom();
    expectOk(store.markDisconnected(room.code, "player-1"));

    const restored = expectOk(
      store.reconnectRoom(room.code, {
        playerId: "player-1",
        playerName: "Alice reconnected"
      })
    );

    expect(restored.players.find((player) => player.seat === "black")).toMatchObject({
      connected: true,
      name: "Alice reconnected"
    });
    expect(store.reconnectRoom(room.code, { playerId: "intruder", playerName: "Eve" })).toMatchObject({
      ok: false,
      error: { code: "not-room-member" }
    });
  });

  it("finishes active games when a disconnected player misses the reconnect deadline", () => {
    let now = 1_780_000_000_000;
    const store = createTimedRoomStore({
      codeGenerator: () => "ROOM01",
      disconnectGraceMs: 1_000,
      now: () => now
    });
    const started = createStartedRoomWithStore(store);

    const disconnected = expectOk(store.markDisconnected(started.code, "player-2"));

    expect(disconnected.status).toBe("playing");
    expect(disconnected.players.find((player) => player.seat === "white")?.disconnectDeadline).toBe(now + 1_000);

    now += 1_001;

    const expired = expectOk(store.getSnapshot(started.code));

    expect(expired.status).toBe("finished");
    expect(expired.winner).toBe("black");
    expect(expired.winLine).toEqual([]);
    expect(store.applyMove(started.code, { playerId: "player-1", point: { row: 7, col: 7 } })).toMatchObject({
      ok: false,
      error: { code: "game-not-playing" }
    });
  });

  it("keeps a disconnected player seat if they reconnect before the deadline", () => {
    let now = 1_780_000_000_000;
    const store = createTimedRoomStore({
      codeGenerator: () => "ROOM01",
      disconnectGraceMs: 1_000,
      now: () => now
    });
    const started = createStartedRoomWithStore(store);

    expectOk(store.markDisconnected(started.code, "player-1"));

    now += 999;

    const restored = expectOk(
      store.reconnectRoom(started.code, {
        playerId: "player-1",
        playerName: "Alice back"
      })
    );

    expect(restored.status).toBe("playing");
    expect(restored.players.find((player) => player.seat === "black")).toMatchObject({
      connected: true,
      disconnectDeadline: null,
      name: "Alice back"
    });

    now += 2;

    expect(expectOk(store.getSnapshot(started.code)).status).toBe("playing");
  });

  it("cleans up empty waiting rooms and completed rooms after their TTLs", () => {
    let now = 1_780_000_000_000;
    const store = createTimedRoomStore({
      codeGenerator: () => "ROOM01",
      completedRoomTtlMs: 2_000,
      emptyRoomTtlMs: 1_000,
      now: () => now
    });
    const created = expectOk(store.createRoom({ playerId: "player-1", playerName: "Alice" }));

    expectOk(store.markDisconnected(created.code, "player-1"));

    now += 1_001;

    expect(store.getSnapshot(created.code)).toMatchObject({
      ok: false,
      error: { code: "room-not-found" }
    });

    now = 1_780_000_100_000;
    const finishedStore = createTimedRoomStore({
      codeGenerator: () => "ROOM02",
      completedRoomTtlMs: 2_000,
      now: () => now
    });
    const finishedRoom = createStartedRoomWithStore(finishedStore);

    expectOk(finishedStore.resignGame(finishedRoom.code, "player-2"));

    now += 2_001;

    expect(finishedStore.getSnapshot(finishedRoom.code)).toMatchObject({
      ok: false,
      error: { code: "room-not-found" }
    });
  });

  it("sweeps expired rooms and reports lifecycle updates for broadcasting", () => {
    let now = 1_780_000_000_000;
    const store = createTimedRoomStore({
      codeGenerator: () => "ROOM01",
      disconnectGraceMs: 1_000,
      now: () => now
    });
    const started = createStartedRoomWithStore(store);

    expectOk(store.markDisconnected(started.code, "player-2"));

    now += 1_001;

    const sweep = store.sweepExpiredRooms();

    expect(sweep.deletedRoomCodes).toEqual([]);
    expect(sweep.updatedSnapshots).toHaveLength(1);
    expect(sweep.updatedSnapshots[0]).toMatchObject({
      code: started.code,
      status: "finished",
      winner: "black"
    });
  });

  it("lets only the host restart a room and requires ready before replay", () => {
    const { store, room } = createStartedRoom();

    expect(store.restartGame(room.code, "player-1")).toMatchObject({
      ok: false,
      error: { code: "game-not-playing" }
    });

    expectOk(store.resignGame(room.code, "player-2"));

    expect(store.restartGame(room.code, "player-2")).toMatchObject({
      ok: false,
      error: { code: "not-room-host" }
    });

    const restarted = expectOk(store.restartGame(room.code, "player-1"));

    expect(restarted.status).toBe("waiting");
    expect(restarted.moveSeq).toBe(0);
    expect(restarted.winner).toBeNull();
    expect(restarted.moves).toEqual([]);
    expect(restarted.currentTurn).toBe("white");
    expect(restarted.players.every((player) => player.ready === false)).toBe(true);
    expect(restarted.players.every((player) => player.undoRequestsRemaining === 3)).toBe(true);
    expect(store.startGame(room.code, "player-1")).toMatchObject({
      ok: false,
      error: { code: "room-not-ready" }
    });

    expectOk(store.setPlayerReady(room.code, "player-1"));
    const secondGame = expectOk(store.setPlayerReady(room.code, "player-2"));

    expect(secondGame.status).toBe("playing");
    expect(secondGame.currentTurn).toBe("white");

    expectOk(store.resignGame(room.code, "player-2"));
    const thirdReset = expectOk(store.restartGame(room.code, "player-1"));

    expect(thirdReset.currentTurn).toBe("black");
  });

  it("retries room code collisions and exposes a compact default generator", () => {
    const store = createTestRoomStore(["ROOM01", "ROOM01", "ROOM02"]);

    expectOk(store.createRoom({ playerId: "player-1", playerName: "Alice" }));
    const secondRoom = expectOk(store.createRoom({ playerId: "player-2", playerName: "Bob" }));

    expect(secondRoom.code).toBe("ROOM02");
    expect(createRoomCode()).toMatch(/^[A-Z2-9]{6}$/);
  });
});

function createTestRoomStore(codes: string[]): RoomStore {
  let index = 0;

  return new RoomStore({
    codeGenerator: () => codes[index++] ?? `ROOM${index}`,
    now: () => 1_780_000_000_000 + index
  });
}

function createTimedRoomStore(options: ConstructorParameters<typeof RoomStore>[0]): RoomStore {
  return new RoomStore(options);
}

function createReadyRoom(): { room: RoomSnapshot; store: RoomStore } {
  const store = createTestRoomStore(["ROOM01"]);
  const created = expectOk(store.createRoom({ playerId: "player-1", playerName: "Alice" }));

  expectOk(store.joinRoom(created.code, { playerId: "player-2", playerName: "Bob" }));
  expectOk(store.setPlayerReady(created.code, "player-1"));
  const room = expectOk(store.setPlayerReady(created.code, "player-2"));

  return { room, store };
}

function createStartedRoom(): { room: RoomSnapshot; store: RoomStore } {
  const { room, store } = createReadyRoom();

  return { room, store };
}

function createStartedRoomWithStore(store: RoomStore): RoomSnapshot {
  const created = expectOk(store.createRoom({ playerId: "player-1", playerName: "Alice" }));

  expectOk(store.joinRoom(created.code, { playerId: "player-2", playerName: "Bob" }));
  expectOk(store.setPlayerReady(created.code, "player-1"));

  return expectOk(store.setPlayerReady(created.code, "player-2"));
}

function playAndRejectUndo(
  store: RoomStore,
  roomCode: string,
  requesterId: string,
  targetId: string,
  row: number,
  col: number
) {
  expectOk(store.applyMove(roomCode, { playerId: requesterId, point: { row, col } }));
  const requested = expectOk(store.requestUndo(roomCode, requesterId));
  expectOk(store.respondToUndo(roomCode, targetId, requested.undoRequest?.id ?? "", false));
}

function expectOk<T>(result: RoomResult<T>): T {
  expect(result.ok).toBe(true);

  if (!result.ok) {
    throw new Error(result.error.message);
  }

  return result.value;
}
