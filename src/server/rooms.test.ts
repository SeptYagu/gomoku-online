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
    expect(created.spectators).toEqual([]);
    expect(created.board).toHaveLength(15);
    expect(created.board.flat().every((cell) => cell === null)).toBe(true);
  });

  it("normalizes room codes and rejects duplicate or invalid joins", () => {
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
    expect(store.joinRoom("MISSING", { playerId: "player-5", playerName: "Dana" })).toMatchObject({
      ok: false,
      error: { code: "room-not-found" }
    });
  });

  it("finds a random match by joining the oldest available waiting room", () => {
    const store = createTestRoomStore(["ROOM01", "ROOM02"]);

    const first = expectOk(store.findMatch({ playerId: "player-1", playerName: "Alice" }));

    expect(first.code).toBe("ROOM01");
    expect(first.players).toHaveLength(1);
    expect(first.players[0]).toMatchObject({ name: "Alice", seat: "black" });

    const second = expectOk(store.findMatch({ playerId: "player-2", playerName: "Bob" }));

    expect(second.code).toBe("ROOM01");
    expect(second.players).toHaveLength(2);
    expect(second.players.map((player) => player.name)).toEqual(["Alice", "Bob"]);
    expect(second.players.map((player) => player.seat)).toEqual(["black", "white"]);

    const third = expectOk(store.findMatch({ playerId: "player-3", playerName: "Cara" }));

    expect(third.code).toBe("ROOM02");
    expect(third.players).toHaveLength(1);
    expect(third.players[0]).toMatchObject({ name: "Cara", seat: "black" });
    expect(store.listRooms({ status: "waiting" }).rooms.map((room) => room.code)).toEqual(["ROOM02", "ROOM01"]);
  });

  it("skips waiting rooms that would duplicate a player name during random matching", () => {
    const store = createTestRoomStore(["ROOM01", "ROOM02"]);

    expectOk(store.createRoom({ playerId: "player-1", playerName: "Alice" }));

    const matched = expectOk(store.findMatch({ playerId: "player-2", playerName: " Alice " }));

    expect(matched.code).toBe("ROOM02");
    expect(matched.players).toHaveLength(1);
    expect(matched.players[0]).toMatchObject({ name: "Alice", seat: "black" });
  });

  it("derives live user presence from connection and room state", () => {
    const store = createTestRoomStore(["ROOM01"]);

    expectOk(store.connectPresence({ playerId: "lobby-player", playerName: "Lobby User" }));
    expectOk(store.connectPresence({ playerId: "player-1", playerName: "Alice" }));
    expectOk(store.connectPresence({ playerId: "player-2", playerName: "Bob" }));
    expectOk(store.connectPresence({ playerId: "spectator-1", playerName: "Cara" }));

    const created = expectOk(store.createRoom({ playerId: "player-1", playerName: "Alice" }));
    expectOk(store.joinRoom(created.code, { playerId: "player-2", playerName: "Bob" }));
    expectOk(store.joinRoom(created.code, { playerId: "spectator-1", playerName: "Cara" }));

    expect(store.listPresence().users).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "Lobby User", roomCode: null, status: "online" }),
        expect.objectContaining({ name: "Alice", roomCode: created.code, status: "in_room" }),
        expect.objectContaining({ name: "Bob", roomCode: created.code, status: "in_room" }),
        expect.objectContaining({ name: "Cara", roomCode: created.code, status: "spectating" })
      ])
    );

    expectOk(store.setPlayerReady(created.code, "player-1"));
    expectOk(store.setPlayerReady(created.code, "player-2"));

    expect(store.listPresence().users).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "Alice", status: "playing" }),
        expect.objectContaining({ name: "Bob", status: "playing" }),
        expect.objectContaining({ name: "Cara", status: "spectating" })
      ])
    );

    store.disconnectPresence("lobby-player");

    expect(store.listPresence().users.some((user) => user.playerId === "lobby-player")).toBe(false);
    expect(store.listPresence({ includeOffline: true }).users).toContainEqual(
      expect.objectContaining({ connected: false, name: "Lobby User", status: "offline" })
    );
  });

  it("puts third and later room members into spectator seats", () => {
    const store = createTestRoomStore(["ROOM01"]);
    const created = expectOk(store.createRoom({ playerId: "player-1", playerName: "Alice" }));

    expectOk(store.joinRoom(created.code, { playerId: "player-2", playerName: "Bob" }));

    const watched = expectOk(store.joinRoom(created.code, { playerId: "player-3", playerName: "Cara" }));

    expect(watched.players.map((player) => player.seat)).toEqual(["black", "white"]);
    expect(watched.spectators).toEqual([
      {
        connected: true,
        joinedAt: 1_780_000_000_000 + 1,
        name: "Cara"
      }
    ]);
    expect(store.getParticipantRole(created.code, "player-3")).toEqual({
      name: "Cara",
      role: "spectator",
      seat: null
    });
    expect(store.joinRoom(created.code, { playerId: "player-4", playerName: "Cara" })).toMatchObject({
      ok: false,
      error: { code: "duplicate-name" }
    });
  });

  it("closes empty waiting rooms when the only player leaves", () => {
    const store = createTestRoomStore(["ROOM01"]);
    const created = expectOk(store.createRoom({ playerId: "player-1", playerName: "Alice" }));
    const left = expectOk(store.leaveRoom(created.code, "player-1"));

    expect(left.players).toEqual([]);
    expect(left.spectators).toEqual([]);
    expect(store.getSnapshot(created.code)).toMatchObject({
      ok: false,
      error: { code: "room-not-found" }
    });
    expect(store.listRooms().rooms).toEqual([]);
  });

  it("closes a player's previous waiting room when they enter another room", () => {
    const store = createTestRoomStore(["ROOM01", "ROOM02"]);
    const first = expectOk(store.createRoom({ playerId: "player-1", playerName: "Alice" }));
    const second = expectOk(store.createRoom({ playerId: "player-1", playerName: "Alice" }));
    const cleanup = store.leaveParticipantRooms("player-1", second.code);

    expect(cleanup.deletedRoomCodes).toEqual([first.code]);
    expect(cleanup.updatedSnapshots).toEqual([]);
    expect(store.getSnapshot(first.code)).toMatchObject({
      ok: false,
      error: { code: "room-not-found" }
    });
    expect(expectOk(store.getSnapshot(second.code)).players[0]).toMatchObject({ name: "Alice", seat: "black" });
  });

  it("lets a spectator take an open waiting room player seat", () => {
    const store = createTestRoomStore(["ROOM01"]);
    const created = expectOk(store.createRoom({ playerId: "player-1", playerName: "Alice" }));

    expectOk(store.joinRoom(created.code, { playerId: "player-2", playerName: "Bob" }));
    expectOk(store.joinRoom(created.code, { playerId: "spectator-1", playerName: "Cara" }));
    expectOk(store.leaveRoom(created.code, "player-2"));

    const seated = expectOk(store.sitPlayer(created.code, "spectator-1"));

    expect(seated.players).toEqual([
      expect.objectContaining({ name: "Alice", seat: "black" }),
      expect.objectContaining({ name: "Cara", seat: "white" })
    ]);
    expect(seated.spectators).toEqual([]);
    expect(store.getParticipantRole(created.code, "spectator-1")).toEqual({
      name: "Cara",
      role: "player",
      seat: "white"
    });
  });

  it("deduplicates online game record submissions against the server-authoritative final game", () => {
    const { room, store } = createStartedRoom();
    const finished = expectOk(store.resignGame(room.code, "player-1"));
    const firstSubmission = createGameRecordSubmission(finished, "player-1");
    const partial = expectOk(store.submitGameRecord(firstSubmission));

    expect(partial.duplicate).toBe(false);
    expect(partial.record.recordStatus).toBe("partial");
    expect(partial.record.submissions).toHaveLength(1);
    expect(partial.record.finishReason).toBe("resign");
    expect(partial.record.winner).toBe("white");

    const duplicate = expectOk(store.submitGameRecord(firstSubmission));

    expect(duplicate.duplicate).toBe(true);
    expect(duplicate.record.submissions).toHaveLength(1);

    const verified = expectOk(store.submitGameRecord(createGameRecordSubmission(finished, "player-2")));

    expect(verified.record.recordStatus).toBe("verified");
    expect(verified.record.submissions.map((submission) => submission.seat)).toEqual(["black", "white"]);
    expect(store.listGameRecords()).toEqual([verified.record]);
  });

  it("keeps the authoritative game record when a client submission conflicts", () => {
    const { room, store } = createStartedRoom();
    const finished = expectOk(store.resignGame(room.code, "player-1"));
    const conflicted = expectOk(
      store.submitGameRecord({
        ...createGameRecordSubmission(finished, "player-1"),
        winner: "black"
      })
    );

    expect(conflicted.record.recordStatus).toBe("conflicted");
    expect(conflicted.record.conflicts).toEqual([
      expect.objectContaining({
        playerId: "player-1",
        reason: "winner-mismatch"
      })
    ]);
    expect(conflicted.record.winner).toBe("white");
    expect(conflicted.record.moves).toEqual(finished.moves);
  });

  it("blocks spectators from player-only actions while keeping them connected to snapshots", () => {
    const { room, store } = createStartedRoom();
    const watched = expectOk(store.joinRoom(room.code, { playerId: "spectator-1", playerName: "Cara" }));

    expect(watched.spectators).toHaveLength(1);
    expect(store.setPlayerReady(room.code, "spectator-1")).toMatchObject({
      ok: false,
      error: { code: "not-room-player" }
    });
    expect(store.applyMove(room.code, { playerId: "spectator-1", point: { row: 7, col: 7 } })).toMatchObject({
      ok: false,
      error: { code: "not-room-player" }
    });
    expect(store.requestUndo(room.code, "spectator-1")).toMatchObject({
      ok: false,
      error: { code: "not-room-player" }
    });
    expect(store.resignGame(room.code, "spectator-1")).toMatchObject({
      ok: false,
      error: { code: "not-room-player" }
    });

    const disconnected = expectOk(store.markDisconnected(room.code, "spectator-1"));

    expect(disconnected.spectators).toEqual([]);
    expect(store.reconnectRoom(room.code, { playerId: "spectator-1", playerName: "Cara Back" })).toMatchObject({
      ok: false,
      error: { code: "not-room-member" }
    });
  });

  it("exposes lobby room list summaries for waiting and watchable games", () => {
    const store = createTestRoomStore(["ROOM01"]);
    const created = expectOk(store.createRoom({ playerId: "player-1", playerName: "Alice" }));

    let lobby = store.listRooms();

    expect(lobby.version).toBeGreaterThan(0);
    expect(lobby.rooms).toEqual([
      expect.objectContaining({
        canJoin: true,
        canWatch: false,
        code: created.code,
        hostName: "Alice",
        playerCount: 1,
        spectatorCount: 0,
        status: "waiting"
      })
    ]);

    expectOk(store.joinRoom(created.code, { playerId: "player-2", playerName: "Bob" }));
    expectOk(store.joinRoom(created.code, { playerId: "spectator-1", playerName: "Cara" }));

    lobby = store.listRooms();

    expect(lobby.rooms[0]).toMatchObject({
      canJoin: false,
      canWatch: true,
      code: created.code,
      hostName: "Alice",
      playerCount: 2,
      spectatorCount: 1,
      status: "waiting"
    });

    expectOk(store.setPlayerReady(created.code, "player-1"));
    expectOk(store.setPlayerReady(created.code, "player-2"));

    expect(store.listRooms({ status: "playing" }).rooms[0]).toMatchObject({
      canJoin: false,
      canWatch: true,
      code: created.code,
      status: "playing"
    });

    expectOk(store.resignGame(created.code, "player-2"));

    expect(store.listRooms().rooms).toEqual([]);
    expect(store.listRooms({ status: "finished" }).rooms[0]).toMatchObject({
      code: created.code,
      status: "finished"
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

  it("closes an active room immediately after every participant disconnects", () => {
    const { room, store } = createStartedRoom();

    expectOk(store.markDisconnected(room.code, "player-1"));
    const closed = expectOk(store.markDisconnected(room.code, "player-2"));

    expect(closed.status).toBe("abandoned");
    expect(closed.players.every((player) => !player.connected)).toBe(true);
    expect(store.getSnapshot(room.code)).toMatchObject({
      ok: false,
      error: { code: "room-not-found" }
    });
    expect(store.listRooms().rooms).toEqual([]);
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

function createGameRecordSubmission(room: RoomSnapshot, playerId: string) {
  if (!room.finishReason || (room.status !== "finished" && room.status !== "abandoned")) {
    throw new Error("Room must be finished before creating a game record submission.");
  }

  return {
    board: room.board,
    finishReason: room.finishReason,
    gameId: room.gameId,
    moveSeq: room.moveSeq,
    moves: room.moves,
    playerId,
    roomCode: room.code,
    status: room.status,
    winner: room.winner
  };
}

function expectOk<T>(result: RoomResult<T>): T {
  expect(result.ok).toBe(true);

  if (!result.ok) {
    throw new Error(result.error.message);
  }

  return result.value;
}
