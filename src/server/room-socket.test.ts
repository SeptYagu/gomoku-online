import { createServer, type Server as HttpServer } from "node:http";
import type { AddressInfo } from "node:net";
import { Server } from "socket.io";
import { describe, expect, it } from "vitest";
import { AccountStore } from "./accounts";
import type { GameRecordAck, PresenceAck, PublicChatAck, RoomAck, RoomListAck } from "./room-contract";
import { registerRoomSocketHandlers, type RoomSocketServer } from "./room-socket";
import {
  RoomStore,
  type LobbyRoomDeletedEvent,
  type LobbyRoomUpdatedEvent,
  type PresenceSnapshot,
  type PublicChatSnapshot,
  type RoomSnapshot
} from "./rooms";

type TestSocket = {
  disconnect: () => void;
  emit: (event: string, ...args: unknown[]) => void;
  off: (event: string, listener: (...args: unknown[]) => void) => void;
  on: (event: string, listener: (...args: unknown[]) => void) => void;
  once: (event: string, listener: (...args: unknown[]) => void) => void;
};

describe("room socket handlers", () => {
  it("syncs a two-player friend room through Socket.IO", async () => {
    const harness = await createSocketHarness();

    try {
      const host = await harness.connectClient();
      const guest = await harness.connectClient();
      const spectator = await harness.connectClient();
      const stranger = await harness.connectClient();

      const createAck = await emitAck(host, "room:create", {
        playerId: "host-player",
        playerName: "Host"
      });

      expect(createAck.ok).toBe(true);
      expect(createAck.ok ? createAck.value.seat : null).toBe("black");

      if (!createAck.ok) {
        throw new Error(createAck.error.message);
      }

      const roomCode = createAck.value.snapshot.code;
      const hostSawJoin = waitForEvent<RoomSnapshot>(host, "room:state");
      const joinAck = await emitAck(guest, "room:join", {
        playerId: "guest-player",
        playerName: "Guest",
        roomCode
      });

      expect(joinAck.ok).toBe(true);
      expect(joinAck.ok ? joinAck.value.role : null).toBe("player");
      expect(joinAck.ok ? joinAck.value.seat : null).toBe("white");
      expect((await hostSawJoin).players).toHaveLength(2);

      const hostSawSpectator = waitForEventMatching<RoomSnapshot>(
        host,
        "room:state",
        (snapshot) => snapshot.spectators.some((candidate) => candidate.name === "Watcher")
      );
      const spectatorAck = await emitAck(spectator, "room:join", {
        playerId: "spectator-player",
        playerName: "Watcher",
        roomCode
      });

      expect(spectatorAck.ok).toBe(true);
      expect(spectatorAck.ok ? spectatorAck.value.role : null).toBe("spectator");
      expect(spectatorAck.ok ? spectatorAck.value.seat : "occupied").toBeNull();
      expect(spectatorAck.ok ? spectatorAck.value.snapshot.spectators : []).toHaveLength(1);
      expect(await emitAck(spectator, "room:ready", { ready: true, roomCode })).toMatchObject({
        ok: false,
        error: { code: "not-room-player" }
      });
      await hostSawSpectator;

      const guestSawChat = waitForEventMatching<RoomSnapshot>(
        guest,
        "room:state",
        (snapshot) => snapshot.chatMessages.some((message) => message.text === "hello from watcher")
      );
      const spectatorChatAck = await emitAck(spectator, "room:chat-send", {
        roomCode,
        text: " hello\nfrom   watcher "
      });

      expect(spectatorChatAck.ok ? spectatorChatAck.value.snapshot.chatMessages.at(-1) : null).toMatchObject({
        name: "Watcher",
        role: "spectator",
        seat: null,
        text: "hello from watcher"
      });
      expect((await guestSawChat).chatMessages.at(-1)).toMatchObject({
        name: "Watcher",
        role: "spectator",
        text: "hello from watcher"
      });
      expect(await emitAck(spectator, "room:chat-send", { roomCode, text: "too soon" })).toMatchObject({
        ok: false,
        error: { code: "chat-rate-limited" }
      });
      expect(await emitAck(host, "room:chat-send", { roomCode, text: "   " })).toMatchObject({
        ok: false,
        error: { code: "chat-message-empty" }
      });
      expect(await emitAck(host, "room:chat-send", { roomCode, text: "x".repeat(161) })).toMatchObject({
        ok: false,
        error: { code: "chat-message-too-long" }
      });
      expect(await emitAck(stranger, "room:chat-send", { roomCode, text: "hello" })).toMatchObject({
        ok: false,
        error: { code: "not-room-member" }
      });

      const guestSawHostReady = waitForEvent<RoomSnapshot>(guest, "room:state");
      const hostReadyAck = await emitAck(host, "room:ready", { ready: true, roomCode });
      expect(hostReadyAck.ok).toBe(true);
      expect((await guestSawHostReady).players.find((player) => player.seat === "black")?.ready).toBe(true);

      const hostSawReady = waitForEvent<RoomSnapshot>(host, "room:state");
      const readyAck = await emitAck(guest, "room:ready", { ready: true, roomCode });
      expect(readyAck.ok ? readyAck.value.snapshot.status : null).toBe("playing");
      expect((await hostSawReady).status).toBe("playing");

      const guestSawMove = waitForEvent<RoomSnapshot>(guest, "room:state");
      const spectatorSawMove = waitForEventMatching<RoomSnapshot>(
        spectator,
        "room:state",
        (snapshot) => snapshot.board[7][7] === "black"
      );
      const moveAck = await emitAck(host, "game:move", {
        expectedMoveSeq: 0,
        point: { row: 7, col: 7 },
        roomCode
      });

      expect(moveAck.ok ? moveAck.value.snapshot.board[7][7] : null).toBe("black");

      const broadcastMove = await guestSawMove;
      expect(broadcastMove.board[7][7]).toBe("black");
      expect(broadcastMove.currentTurn).toBe("white");
      expect((await spectatorSawMove).board[7][7]).toBe("black");
      expect(await emitAck(spectator, "game:move", { expectedMoveSeq: 1, point: { row: 7, col: 8 }, roomCode }))
        .toMatchObject({
          ok: false,
          error: { code: "not-room-player" }
        });

      const guestSawUndoRequest = waitForEvent<RoomSnapshot>(guest, "room:state");
      const undoRequestAck = await emitAck(host, "game:undo-request", { roomCode });
      expect(undoRequestAck.ok ? undoRequestAck.value.snapshot.undoRequest?.targetSeat : null).toBe("white");

      const undoRequestSnapshot = await guestSawUndoRequest;
      const requestId = undoRequestSnapshot.undoRequest?.id ?? "";

      expect(undoRequestSnapshot.undoRequest?.requesterSeat).toBe("black");

      const hostSawUndo = waitForEvent<RoomSnapshot>(host, "room:state");
      const undoAck = await emitAck(guest, "game:undo-respond", { accepted: true, requestId, roomCode });
      expect(undoAck.ok ? undoAck.value.snapshot.board[7][7] : "occupied").toBeNull();
      expect(undoAck.ok ? undoAck.value.snapshot.currentTurn : null).toBe("black");
      expect((await hostSawUndo).moves).toHaveLength(0);

      const replayAck = await emitAck(host, "game:move", {
        expectedMoveSeq: 0,
        point: { row: 7, col: 7 },
        roomCode
      });
      expect(replayAck.ok ? replayAck.value.snapshot.board[7][7] : null).toBe("black");

      const illegalAck = await emitAck(host, "game:move", {
        expectedMoveSeq: 1,
        point: { row: 7, col: 8 },
        roomCode
      });
      expect(illegalAck.ok).toBe(false);
      expect(illegalAck.ok ? null : illegalAck.error.code).toBe("not-your-turn");

      const hostSawDisconnect = waitForEvent<RoomSnapshot>(host, "room:state");
      guest.disconnect();
      const disconnectSnapshot = await hostSawDisconnect;
      const disconnectedGuest = disconnectSnapshot.players.find((player) => player.seat === "white");
      expect(disconnectedGuest?.connected).toBe(false);
    } finally {
      await harness.close();
    }
  });

  it("broadcasts a timeout win when a disconnected player misses the reconnect deadline", async () => {
    const harness = await createSocketHarness({
      lifecycleIntervalMs: 25,
      roomStore: new RoomStore({ disconnectGraceMs: 80 })
    });

    try {
      const host = await harness.connectClient();
      const guest = await harness.connectClient();

      const createAck = await emitAck(host, "room:create", {
        playerId: "host-player",
        playerName: "Host"
      });

      if (!createAck.ok) {
        throw new Error(createAck.error.message);
      }

      const roomCode = createAck.value.snapshot.code;

      expect(
        await emitAck(guest, "room:join", {
          playerId: "guest-player",
          playerName: "Guest",
          roomCode
        })
      ).toMatchObject({ ok: true });
      expect(await emitAck(host, "room:ready", { ready: true, roomCode })).toMatchObject({ ok: true });
      expect(await emitAck(guest, "room:ready", { ready: true, roomCode })).toMatchObject({
        ok: true,
        value: { snapshot: { status: "playing" } }
      });

      const hostSawTimeout = waitForEventMatching<RoomSnapshot>(
        host,
        "room:state",
        (snapshot) => snapshot.status === "finished" && snapshot.winner === "black"
      );

      guest.disconnect();

      const timeoutSnapshot = await hostSawTimeout;

      expect(timeoutSnapshot.players.find((player) => player.seat === "white")?.connected).toBe(false);
      expect(timeoutSnapshot.winLine).toEqual([]);
    } finally {
      await harness.close();
    }
  });

  it("serves lobby room lists and broadcasts room list updates", async () => {
    const harness = await createSocketHarness();

    try {
      const lobby = await harness.connectClient();
      const host = await harness.connectClient();
      const guest = await harness.connectClient();

      const initialList = await emitAck<RoomListAck>(lobby, "lobby:join", { limit: 20 });

      expect(initialList.ok ? initialList.value.rooms : ["unexpected"]).toEqual([]);

      const lobbySawCreate = waitForEventMatching<LobbyRoomUpdatedEvent>(
        lobby,
        "lobby:room-updated",
        (event) => event.room.status === "waiting" && event.room.playerCount === 1
      );
      const createAck = await emitAck(host, "room:create", {
        playerId: "host-player",
        playerName: "Host"
      });

      if (!createAck.ok) {
        throw new Error(createAck.error.message);
      }

      const roomCode = createAck.value.snapshot.code;
      const createdEvent = await lobbySawCreate;

      expect(createdEvent.room).toMatchObject({
        canJoin: true,
        code: roomCode,
        hostName: "Host",
        spectatorCount: 0,
        status: "waiting"
      });

      const lobbySawJoin = waitForEventMatching<LobbyRoomUpdatedEvent>(
        lobby,
        "lobby:room-updated",
        (event) => event.room.code === roomCode && event.room.playerCount === 2 && event.room.canWatch
      );

      expect(
        await emitAck(guest, "room:join", {
          playerId: "guest-player",
          playerName: "Guest",
          roomCode
        })
      ).toMatchObject({ ok: true });
      expect((await lobbySawJoin).room).toMatchObject({
        canJoin: false,
        canWatch: true,
        playerCount: 2,
        status: "waiting"
      });

      const lobbySawPlaying = waitForEventMatching<LobbyRoomUpdatedEvent>(
        lobby,
        "lobby:room-updated",
        (event) => event.room.code === roomCode && event.room.status === "playing"
      );

      expect(await emitAck(host, "room:ready", { ready: true, roomCode })).toMatchObject({ ok: true });
      expect(await emitAck(guest, "room:ready", { ready: true, roomCode })).toMatchObject({ ok: true });
      expect((await lobbySawPlaying).room).toMatchObject({
        canJoin: false,
        canWatch: true,
        status: "playing"
      });

      const lobbySawFinishedDelete = waitForEventMatching<LobbyRoomDeletedEvent>(
        lobby,
        "lobby:room-deleted",
        (event) => event.code === roomCode
      );

      expect(await emitAck(host, "game:resign", { roomCode })).toMatchObject({ ok: true });
      expect(await lobbySawFinishedDelete).toMatchObject({ code: roomCode });

      const finalList = await emitAck<RoomListAck>(lobby, "lobby:list", {});
      expect(finalList.ok ? finalList.value.rooms : ["unexpected"]).toEqual([]);
    } finally {
      await harness.close();
    }
  });

  it("keeps unlisted room create, updates, and deletion out of lobby discovery", async () => {
    const harness = await createSocketHarness();

    try {
      const lobby = await harness.connectClient();
      const host = await harness.connectClient();
      const guest = await harness.connectClient();
      const updatedCodes: string[] = [];
      const deletedCodes: string[] = [];

      lobby.on("lobby:room-updated", (event: LobbyRoomUpdatedEvent) => updatedCodes.push(event.room.code));
      lobby.on("lobby:room-deleted", (event: LobbyRoomDeletedEvent) => deletedCodes.push(event.code));
      const initialList = await emitAck<RoomListAck>(lobby, "lobby:join", { limit: 20 });

      if (!initialList.ok) {
        throw new Error(initialList.error.message);
      }

      const createAck = await emitAck(host, "room:create", {
        playerId: "unlisted-host",
        playerName: "Unlisted Host",
        visibility: "unlisted"
      });

      if (!createAck.ok) {
        throw new Error(createAck.error.message);
      }

      const roomCode = createAck.value.snapshot.code;

      expect(createAck.value.snapshot.visibility).toBe("unlisted");
      expect(
        await emitAck(guest, "room:join", {
          playerId: "unlisted-guest",
          playerName: "Unlisted Guest",
          roomCode
        })
      ).toMatchObject({ ok: true, value: { snapshot: { visibility: "unlisted" } } });
      expect(await emitAck(guest, "room:leave", { roomCode })).toMatchObject({ ok: true });
      expect(await emitAck(host, "matchmaking:cancel", { roomCode })).toMatchObject({ ok: true });

      await new Promise((resolve) => setTimeout(resolve, 50));
      const finalList = await emitAck<RoomListAck>(lobby, "lobby:list", { limit: 20 });

      expect(finalList.ok ? finalList.value.rooms : ["unexpected"]).toEqual([]);
      expect(finalList.ok ? finalList.value.version : -1).toBe(initialList.value.version);
      expect(updatedCodes).not.toContain(roomCode);
      expect(deletedCodes).not.toContain(roomCode);
    } finally {
      await harness.close();
    }
  });

  it("reuses the current waiting room when the same socket creates again", async () => {
    const harness = await createSocketHarness();

    try {
      const host = await harness.connectClient();
      const lobby = await harness.connectClient();

      expect(await emitAck<RoomListAck>(lobby, "lobby:join", { limit: 20 })).toMatchObject({ ok: true });

      const firstAck = await emitAck(host, "room:create", {
        playerId: "host-player",
        playerName: "Host"
      });

      if (!firstAck.ok) {
        throw new Error(firstAck.error.message);
      }

      const firstRoomCode = firstAck.value.snapshot.code;
      const secondAck = await emitAck(host, "room:create", {
        playerId: "host-player",
        playerName: "Host"
      });

      expect(secondAck.ok).toBe(true);
      expect(secondAck.ok ? secondAck.value.snapshot.code : "").toBe(firstRoomCode);

      const finalList = await emitAck<RoomListAck>(lobby, "lobby:list", { limit: 20 });
      expect(finalList.ok ? finalList.value.rooms.filter((room) => room.code === firstRoomCode) : []).toHaveLength(1);
    } finally {
      await harness.close();
    }
  });

  it("does not reuse a waiting room when the requested visibility changes", async () => {
    const harness = await createSocketHarness();

    try {
      const host = await harness.connectClient();
      const stranger = await harness.connectClient();
      const lobby = await harness.connectClient();

      expect(await emitAck<RoomListAck>(lobby, "lobby:join", { limit: 20 })).toMatchObject({ ok: true });
      const unlistedAck = await emitAck(host, "room:create", {
        playerId: "visibility-host",
        playerName: "Visibility Host",
        visibility: "unlisted"
      });

      if (!unlistedAck.ok) {
        throw new Error(unlistedAck.error.message);
      }

      const unlistedCode = unlistedAck.value.snapshot.code;
      const publicAck = await emitAck(host, "room:create", {
        playerId: "visibility-host",
        playerName: "Visibility Host",
        visibility: "public"
      });

      if (!publicAck.ok) {
        throw new Error(publicAck.error.message);
      }

      expect(publicAck.value.snapshot.code).not.toBe(unlistedCode);
      expect(publicAck.value.snapshot.visibility).toBe("public");
      expect(await emitAck(stranger, "room:join", {
        playerId: "visibility-stranger",
        playerName: "Stranger",
        roomCode: unlistedCode
      })).toMatchObject({ ok: false, error: { code: "room-not-found" } });
      const finalList = await emitAck<RoomListAck>(lobby, "lobby:list", { limit: 20 });

      expect(finalList.ok ? finalList.value.rooms : []).toEqual([
        expect.objectContaining({ code: publicAck.value.snapshot.code, visibility: "public" })
      ]);
    } finally {
      await harness.close();
    }
  });

  it("closes another socket's old room when the same player creates a new room", async () => {
    const harness = await createSocketHarness();

    try {
      const firstSocket = await harness.connectClient();
      const secondSocket = await harness.connectClient();
      const lobby = await harness.connectClient();

      expect(await emitAck<RoomListAck>(lobby, "lobby:join", { limit: 20 })).toMatchObject({ ok: true });

      const firstAck = await emitAck(firstSocket, "room:create", {
        playerId: "shared-player",
        playerName: "Shared"
      });

      if (!firstAck.ok) {
        throw new Error(firstAck.error.message);
      }

      const firstRoomCode = firstAck.value.snapshot.code;
      const firstSocketSawClosed = waitForEventMatching<LobbyRoomDeletedEvent>(
        firstSocket,
        "room:closed",
        (event) => event.code === firstRoomCode
      );
      const lobbySawFirstDelete = waitForEventMatching<LobbyRoomDeletedEvent>(
        lobby,
        "lobby:room-deleted",
        (event) => event.code === firstRoomCode
      );
      const secondAck = await emitAck(secondSocket, "room:create", {
        guestToken: firstAck.value.guestToken,
        playerId: "shared-player",
        playerName: "Shared"
      });

      expect(secondAck.ok).toBe(true);
      expect(secondAck.ok ? secondAck.value.snapshot.code : firstRoomCode).not.toBe(firstRoomCode);
      expect(await firstSocketSawClosed).toMatchObject({ code: firstRoomCode });
      expect(await lobbySawFirstDelete).toMatchObject({ code: firstRoomCode });
    } finally {
      await harness.close();
    }
  });

  it("requires the server-issued guest token before another socket can rejoin a seat", async () => {
    const harness = await createSocketHarness();

    try {
      const host = await harness.connectClient();
      const attacker = await harness.connectClient();
      const created = await emitAck(host, "room:create", {
        playerId: "protected-guest",
        playerName: "Protected"
      });

      if (!created.ok) {
        throw new Error(created.error.message);
      }

      expect(created.value.guestToken).toEqual(expect.any(String));
      expect(
        await emitAck(attacker, "room:rejoin", {
          playerId: "protected-guest",
          playerName: "Attacker",
          roomCode: created.value.snapshot.code
        })
      ).toMatchObject({
        ok: false,
        error: { code: "guest-session-invalid" }
      });
      expect(
        await emitAck(attacker, "room:rejoin", {
          guestToken: created.value.guestToken,
          playerId: "protected-guest",
          playerName: "Protected",
          roomCode: created.value.snapshot.code
        })
      ).toMatchObject({
        ok: true,
        value: {
          playerId: "protected-guest",
          snapshot: {
            players: [expect.objectContaining({ name: "Protected", seat: "black" })]
          }
        }
      });
    } finally {
      await harness.close();
    }
  });

  it("keeps a player connected while another authenticated socket remains bound", async () => {
    const harness = await createSocketHarness();

    try {
      const host = await harness.connectClient();
      const mirror = await harness.connectClient();
      const guest = await harness.connectClient();
      const created = await emitAck(host, "room:create", {
        playerId: "multi-host",
        playerName: "Host"
      });

      if (!created.ok) {
        throw new Error(created.error.message);
      }

      const roomCode = created.value.snapshot.code;

      expect(await emitAck(guest, "room:join", { playerId: "multi-guest", playerName: "Guest", roomCode }))
        .toMatchObject({ ok: true });
      expect(await emitAck(host, "room:ready", { ready: true, roomCode })).toMatchObject({ ok: true });
      expect(await emitAck(guest, "room:ready", { ready: true, roomCode })).toMatchObject({ ok: true });
      expect(
        await emitAck(mirror, "room:rejoin", {
          guestToken: created.value.guestToken,
          playerId: "multi-host",
          playerName: "Host",
          roomCode
        })
      ).toMatchObject({ ok: true });

      host.disconnect();

      const moveAck = await emitAck(mirror, "game:move", {
        expectedMoveSeq: 0,
        point: { col: 7, row: 7 },
        roomCode
      });

      expect(moveAck).toMatchObject({
        ok: true,
        value: {
          snapshot: {
            players: [expect.objectContaining({ connected: true, seat: "black" }), expect.any(Object)]
          }
        }
      });

      const guestSawLastDisconnect = waitForEventMatching<RoomSnapshot>(
        guest,
        "room:state",
        (snapshot) => snapshot.players.some((player) => player.seat === "black" && !player.connected)
      );

      mirror.disconnect();

      expect(await guestSawLastDisconnect).toMatchObject({
        status: "playing",
        players: [expect.objectContaining({ connected: false, seat: "black" }), expect.any(Object)]
      });
    } finally {
      await harness.close();
    }
  });

  it("closes another socket's disposable waiting room when the guest name creates a new room", async () => {
    const harness = await createSocketHarness();

    try {
      const firstSocket = await harness.connectClient();
      const secondSocket = await harness.connectClient();
      const lobby = await harness.connectClient();

      expect(await emitAck<RoomListAck>(lobby, "lobby:join", { limit: 20 })).toMatchObject({ ok: true });

      const firstAck = await emitAck(firstSocket, "room:create", {
        playerId: "first-tab",
        playerName: "Shared Guest"
      });

      if (!firstAck.ok) {
        throw new Error(firstAck.error.message);
      }

      const firstRoomCode = firstAck.value.snapshot.code;
      const firstSocketSawClosed = waitForEventMatching<LobbyRoomDeletedEvent>(
        firstSocket,
        "room:closed",
        (event) => event.code === firstRoomCode
      );
      const lobbySawFirstDelete = waitForEventMatching<LobbyRoomDeletedEvent>(
        lobby,
        "lobby:room-deleted",
        (event) => event.code === firstRoomCode
      );
      const secondAck = await emitAck(secondSocket, "room:create", {
        playerId: "second-tab",
        playerName: "Shared Guest"
      });

      expect(secondAck.ok).toBe(true);
      expect(secondAck.ok ? secondAck.value.snapshot.code : firstRoomCode).not.toBe(firstRoomCode);
      expect(await firstSocketSawClosed).toMatchObject({ code: firstRoomCode });
      expect(await lobbySawFirstDelete).toMatchObject({ code: firstRoomCode });
    } finally {
      await harness.close();
    }
  });

  it("closes room records that have no socket members before creating a new room", async () => {
    const roomStore = new RoomStore();
    const orphanResult = roomStore.createRoom({
      playerId: "orphan-player",
      playerName: "Orphan"
    });

    if (!orphanResult.ok) {
      throw new Error(orphanResult.error.message);
    }

    const orphanRoomCode = orphanResult.value.code;
    const harness = await createSocketHarness({ roomStore });

    try {
      const host = await harness.connectClient();
      const lobby = await harness.connectClient();

      const initialList = await emitAck<RoomListAck>(lobby, "lobby:join", { limit: 20 });
      expect(initialList.ok ? initialList.value.rooms.some((room) => room.code === orphanRoomCode) : false).toBe(true);

      const lobbySawOrphanDelete = waitForEventMatching<LobbyRoomDeletedEvent>(
        lobby,
        "lobby:room-deleted",
        (event) => event.code === orphanRoomCode
      );
      const createAck = await emitAck(host, "room:create", {
        playerId: "fresh-player",
        playerName: "Fresh"
      });

      expect(createAck.ok).toBe(true);
      expect(await lobbySawOrphanDelete).toMatchObject({ code: orphanRoomCode });

      const finalList = await emitAck<RoomListAck>(lobby, "lobby:list", { limit: 20 });
      expect(finalList.ok ? finalList.value.rooms.some((room) => room.code === orphanRoomCode) : true).toBe(false);
    } finally {
      await harness.close();
    }
  });

  it("broadcasts live user presence as sockets enter rooms and games", async () => {
    const harness = await createSocketHarness();

    try {
      const lobby = await harness.connectClient();
      const host = await harness.connectClient();
      const guest = await harness.connectClient();
      const spectator = await harness.connectClient();

      const joinedPresence = await emitAck<PresenceAck>(lobby, "presence:join", {
        playerId: "lobby-player",
        playerName: "Lobby"
      });

      expect(joinedPresence.ok).toBe(true);
      expect(joinedPresence.ok ? joinedPresence.value.users[0] : null).toMatchObject({
        name: "Lobby",
        status: "online"
      });

      const lobbySawHost = waitForEventMatching<PresenceSnapshot>(
        lobby,
        "presence:users",
        (snapshot) => snapshot.users.some((user) => user.name === "Host" && user.status === "in_room")
      );
      const createAck = await emitAck(host, "room:create", {
        playerId: "host-player",
        playerName: "Host"
      });

      if (!createAck.ok) {
        throw new Error(createAck.error.message);
      }

      expect(await lobbySawHost).toEqual(
        expect.objectContaining({
          users: expect.arrayContaining([expect.objectContaining({ name: "Host", status: "in_room" })])
        })
      );

      const roomCode = createAck.value.snapshot.code;
      const lobbySawPlayingAndSpectator = waitForEventMatching<PresenceSnapshot>(
        lobby,
        "presence:users",
        (snapshot) =>
          snapshot.users.some((user) => user.name === "Host" && user.status === "playing") &&
          snapshot.users.some((user) => user.name === "Guest" && user.status === "playing") &&
          snapshot.users.some((user) => user.name === "Watcher" && user.status === "spectating")
      );

      expect(
        await emitAck(guest, "room:join", {
          playerId: "guest-player",
          playerName: "Guest",
          roomCode
        })
      ).toMatchObject({ ok: true });
      expect(
        await emitAck(spectator, "room:join", {
          playerId: "spectator-player",
          playerName: "Watcher",
          roomCode
        })
      ).toMatchObject({ ok: true });
      expect(await emitAck(host, "room:ready", { ready: true, roomCode })).toMatchObject({ ok: true });
      expect(await emitAck(guest, "room:ready", { ready: true, roomCode })).toMatchObject({ ok: true });

      await lobbySawPlayingAndSpectator;
    } finally {
      await harness.close();
    }
  });

  it("finds and cancels random matches through Socket.IO", async () => {
    const harness = await createSocketHarness();

    try {
      const lobby = await harness.connectClient();
      const first = await harness.connectClient();
      const second = await harness.connectClient();
      const third = await harness.connectClient();

      expect(await emitAck<RoomListAck>(lobby, "lobby:join", { limit: 20 })).toMatchObject({ ok: true });

      const lobbySawFirstRoom = waitForEventMatching<LobbyRoomUpdatedEvent>(
        lobby,
        "lobby:room-updated",
        (event) => event.room.playerCount === 1 && event.room.canJoin
      );
      const firstAck = await emitAck(first, "matchmaking:find", {
        playerId: "match-player-1",
        playerName: "Match One"
      });

      expect(firstAck).toMatchObject({
        ok: true,
        value: {
          role: "player",
          seat: "black"
        }
      });

      if (!firstAck.ok) {
        throw new Error(firstAck.error.message);
      }

      const firstRoomCode = firstAck.value.snapshot.code;
      expect((await lobbySawFirstRoom).room).toMatchObject({ code: firstRoomCode, playerCount: 1 });

      const firstSawSecondJoin = waitForEventMatching<RoomSnapshot>(
        first,
        "room:state",
        (snapshot) => snapshot.code === firstRoomCode && snapshot.players.length === 2
      );
      const lobbySawMatchedRoom = waitForEventMatching<LobbyRoomUpdatedEvent>(
        lobby,
        "lobby:room-updated",
        (event) => event.room.code === firstRoomCode && event.room.playerCount === 2 && !event.room.canJoin
      );
      const secondAck = await emitAck(second, "matchmaking:find", {
        playerId: "match-player-2",
        playerName: "Match Two"
      });

      expect(secondAck).toMatchObject({
        ok: true,
        value: {
          role: "player",
          seat: "white",
          snapshot: { code: firstRoomCode }
        }
      });
      expect((await firstSawSecondJoin).players).toHaveLength(2);
      expect((await lobbySawMatchedRoom).room).toMatchObject({ code: firstRoomCode, playerCount: 2 });

      const thirdAck = await emitAck(third, "matchmaking:find", {
        playerId: "match-player-3",
        playerName: "Match Three"
      });

      expect(thirdAck.ok ? thirdAck.value.snapshot.code : firstRoomCode).not.toBe(firstRoomCode);
      expect(thirdAck.ok ? thirdAck.value.snapshot.players : []).toHaveLength(1);

      const thirdRoomCode = thirdAck.ok ? thirdAck.value.snapshot.code : "";
      const lobbySawCancel = waitForEventMatching<LobbyRoomDeletedEvent>(
        lobby,
        "lobby:room-deleted",
        (event) => event.code === thirdRoomCode
      );

      expect(await emitAck(third, "matchmaking:cancel", { roomCode: thirdRoomCode })).toMatchObject({ ok: true });
      expect(await lobbySawCancel).toMatchObject({ code: thirdRoomCode });
    } finally {
      await harness.close();
    }
  });

  it("accepts and deduplicates online game record submissions through Socket.IO", async () => {
    const harness = await createSocketHarness();

    try {
      const host = await harness.connectClient();
      const guest = await harness.connectClient();

      const createAck = await emitAck(host, "room:create", {
        playerId: "record-host",
        playerName: "Record Host"
      });

      if (!createAck.ok) {
        throw new Error(createAck.error.message);
      }

      const roomCode = createAck.value.snapshot.code;

      expect(
        await emitAck(guest, "room:join", {
          playerId: "record-guest",
          playerName: "Record Guest",
          roomCode
        })
      ).toMatchObject({ ok: true });
      expect(await emitAck(host, "room:ready", { ready: true, roomCode })).toMatchObject({ ok: true });
      expect(await emitAck(guest, "room:ready", { ready: true, roomCode })).toMatchObject({ ok: true });

      const guestSawFinished = waitForEventMatching<RoomSnapshot>(
        guest,
        "room:state",
        (snapshot) => snapshot.status === "finished" && snapshot.finishReason === "resign"
      );
      const resignAck = await emitAck(host, "game:resign", { roomCode });

      if (!resignAck.ok) {
        throw new Error(resignAck.error.message);
      }

      const finished = resignAck.value.snapshot;
      await guestSawFinished;

      const hostRecord = await emitAck<GameRecordAck>(
        host,
        "game-record:submit",
        createGameRecordPayload(finished)
      );

      expect(hostRecord).toMatchObject({
        ok: true,
        value: {
          duplicate: false,
          record: {
            authoritative: true,
            finishReason: "resign",
            recordStatus: "verified",
            winner: "white"
          }
        }
      });

      const guestRecord = await emitAck<GameRecordAck>(
        guest,
        "game-record:submit",
        createGameRecordPayload(finished)
      );

      expect(guestRecord).toMatchObject({
        ok: true,
        value: {
          duplicate: false,
          record: {
            recordStatus: "verified",
            submissions: [
              expect.objectContaining({ playerId: "record-host" }),
              expect.objectContaining({ playerId: "record-guest" })
            ]
          }
        }
      });

      const duplicate = await emitAck<GameRecordAck>(host, "game-record:submit", createGameRecordPayload(finished));

      expect(duplicate).toMatchObject({
        ok: true,
        value: {
          duplicate: true,
          record: {
            recordStatus: "verified",
            submissions: expect.any(Array)
          }
        }
      });
      expect(duplicate.ok ? duplicate.value.record.submissions : []).toHaveLength(2);
    } finally {
      await harness.close();
    }
  });

  it("resolves account tokens into registered room and game record identity", async () => {
    const accountStore = new AccountStore({ filePath: false });
    const hostAccount = expectAccountOk(accountStore.createAccount({ displayName: "Account Host" }));
    const guestAccount = expectAccountOk(accountStore.createAccount({ displayName: "Account Guest" }));
    const harness = await createSocketHarness({ accountStore });

    try {
      const host = await harness.connectClient();
      const guest = await harness.connectClient();

      const createAck = await emitAck(host, "room:create", {
        accountToken: hostAccount.token,
        playerId: "spoofed-host",
        playerName: "Spoofed Host"
      });

      expect(createAck).toMatchObject({
        ok: true,
        value: {
          identity: "registered",
          name: "Account Host",
          playerId: hostAccount.playerId
        }
      });

      if (!createAck.ok) {
        throw new Error(createAck.error.message);
      }

      const roomCode = createAck.value.snapshot.code;

      expect(
        await emitAck(guest, "room:join", {
          accountToken: guestAccount.token,
          playerId: "spoofed-guest",
          playerName: "Spoofed Guest",
          roomCode
        })
      ).toMatchObject({
        ok: true,
        value: {
          identity: "registered",
          name: "Account Guest",
          playerId: guestAccount.playerId
        }
      });
      expect(await emitAck(host, "room:ready", { ready: true, roomCode })).toMatchObject({ ok: true });
      expect(await emitAck(guest, "room:ready", { ready: true, roomCode })).toMatchObject({ ok: true });

      const finished = await emitAck<RoomAck>(host, "game:resign", { roomCode });

      if (!finished.ok) {
        throw new Error(finished.error.message);
      }

      expect(await emitAck<GameRecordAck>(host, "game-record:submit", createGameRecordPayload(finished.value.snapshot)))
        .toMatchObject({
          ok: true,
          value: {
            record: {
              players: expect.arrayContaining([
                expect.objectContaining({ identity: "registered", playerId: hostAccount.playerId })
              ])
            }
          }
        });
      expect(await emitAck<GameRecordAck>(guest, "game-record:submit", createGameRecordPayload(finished.value.snapshot)))
        .toMatchObject({
          ok: true,
          value: {
            record: {
              recordStatus: "verified",
              players: [
                expect.objectContaining({ identity: "registered", playerId: hostAccount.playerId }),
                expect.objectContaining({ identity: "registered", playerId: guestAccount.playerId })
              ]
            }
          }
        });
    } finally {
      await harness.close();
    }
  });

  it("lets spectators sit in an open player seat through Socket.IO", async () => {
    const harness = await createSocketHarness();

    try {
      const host = await harness.connectClient();
      const guest = await harness.connectClient();
      const spectator = await harness.connectClient();

      const createAck = await emitAck(host, "room:create", {
        playerId: "host-player",
        playerName: "Host"
      });

      if (!createAck.ok) {
        throw new Error(createAck.error.message);
      }

      const roomCode = createAck.value.snapshot.code;

      expect(
        await emitAck(guest, "room:join", {
          playerId: "guest-player",
          playerName: "Guest",
          roomCode
        })
      ).toMatchObject({ ok: true });
      expect(
        await emitAck(spectator, "room:join", {
          playerId: "spectator-player",
          playerName: "Watcher",
          roomCode
        })
      ).toMatchObject({ ok: true, value: { role: "spectator" } });

      expect(await emitAck(guest, "room:leave", { roomCode })).toMatchObject({ ok: true });

      const hostSawSit = waitForEventMatching<RoomSnapshot>(
        host,
        "room:state",
        (snapshot) => snapshot.players.some((player) => player.name === "Watcher" && player.seat === "white")
      );
      const sitAck = await emitAck(spectator, "room:sit", { roomCode });

      expect(sitAck).toMatchObject({
        ok: true,
        value: {
          role: "player",
          seat: "white"
        }
      });
      expect((await hostSawSit).spectators).toEqual([]);
    } finally {
      await harness.close();
    }
  });

  it("serves public chat and broadcasts messages", async () => {
    const harness = await createSocketHarness();

    try {
      const first = await harness.connectClient();
      const second = await harness.connectClient();

      const firstList = await emitAck<PublicChatAck>(first, "public-chat:join", undefined);
      const secondList = await emitAck<PublicChatAck>(second, "public-chat:join", undefined);

      expect(firstList.ok ? firstList.value.messages : ["unexpected"]).toEqual([]);
      expect(secondList.ok ? secondList.value.messages : ["unexpected"]).toEqual([]);

      const secondSawMessage = waitForEventMatching<PublicChatSnapshot>(
        second,
        "public-chat:messages",
        (snapshot) => snapshot.messages.some((message) => message.text === "hello public")
      );
      const sendAck = await emitAck<PublicChatAck>(first, "public-chat:send", {
        playerId: "public-first",
        playerName: "Public First",
        text: " hello\npublic "
      });

      expect(sendAck.ok ? sendAck.value.messages.at(-1) : null).toMatchObject({
        name: "Public First",
        text: "hello public"
      });
      expect((await secondSawMessage).messages.at(-1)).toMatchObject({
        name: "Public First",
        text: "hello public"
      });
      expect(
        await emitAck<PublicChatAck>(first, "public-chat:send", {
          playerId: "public-first",
          playerName: "Public First",
          text: "too soon"
        })
      ).toMatchObject({
        ok: false,
        error: { code: "chat-rate-limited" }
      });
      expect(
        await emitAck<PublicChatAck>(second, "public-chat:send", {
          playerId: "public-second",
          playerName: "Public Second",
          text: "   "
        })
      ).toMatchObject({
        ok: false,
        error: { code: "chat-message-empty" }
      });
      expect(
        await emitAck<PublicChatAck>(second, "public-chat:send", {
          playerId: "public-second",
          playerName: "Public Second",
          text: "x".repeat(161)
        })
      ).toMatchObject({
        ok: false,
        error: { code: "chat-message-too-long" }
      });
    } finally {
      await harness.close();
    }
  });
});

async function createSocketHarness(
  options: { accountStore?: AccountStore; lifecycleIntervalMs?: false | number; roomStore?: RoomStore } = {}
) {
  const httpServer = createServer();
  const io = new Server(httpServer, {
    path: "/socket.io"
  });
  const clients: TestSocket[] = [];

  registerRoomSocketHandlers(io as unknown as RoomSocketServer, options.roomStore ?? new RoomStore(), {
    accountStore: options.accountStore,
    lifecycleIntervalMs: options.lifecycleIntervalMs ?? false
  });

  await new Promise<void>((resolve) => {
    httpServer.listen(0, "127.0.0.1", resolve);
  });

  const { port } = httpServer.address() as AddressInfo;
  const url = `http://127.0.0.1:${port}`;

  return {
    async close() {
      for (const client of clients) {
        client.disconnect();
      }

      await new Promise<void>((resolve) => {
        io.close(() => resolve());
      });

      await closeHttpServer(httpServer);
    },
    async connectClient() {
      const { io: createClient } = await import("socket.io-client");
      const client = createClient(url, {
        forceNew: true,
        path: "/socket.io",
        reconnection: false
      }) as unknown as TestSocket;

      clients.push(client);

      await waitForEvent(client, "connect");

      return client;
    }
  };
}

function emitAck<T = RoomAck>(socket: TestSocket, event: string, payload: unknown): Promise<T> {
  return new Promise((resolve) => {
    socket.emit(event, payload, resolve);
  });
}

function createGameRecordPayload(snapshot: RoomSnapshot) {
  if (!snapshot.finishReason || (snapshot.status !== "finished" && snapshot.status !== "abandoned")) {
    throw new Error("Snapshot must be finished before submitting a game record.");
  }

  return {
    board: snapshot.board,
    finishReason: snapshot.finishReason,
    gameId: snapshot.gameId,
    moveSeq: snapshot.moveSeq,
    moves: snapshot.moves,
    roomCode: snapshot.code,
    status: snapshot.status,
    winner: snapshot.winner
  };
}

function waitForEvent<T = unknown>(socket: TestSocket, event: string): Promise<T> {
  return new Promise((resolve) => {
    socket.once(event, (payload: T) => resolve(payload));
  });
}

function waitForEventMatching<T>(
  socket: TestSocket,
  event: string,
  predicate: (payload: T) => boolean,
  timeoutMs = 5_000
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      socket.off(event, listener);
      reject(new Error(`Timed out waiting for ${event}`));
    }, timeoutMs);
    const listener = (payload: T) => {
      if (!predicate(payload)) {
        return;
      }

      clearTimeout(timeout);
      socket.off(event, listener);
      resolve(payload);
    };

    socket.on(event, listener);
  });
}

function closeHttpServer(httpServer: HttpServer): Promise<void> {
  if (!httpServer.listening) {
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    httpServer.close((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}

function expectAccountOk<T>(result: { ok: true; value: T } | { ok: false; error: { message: string } }): T {
  expect(result.ok).toBe(true);

  if (!result.ok) {
    throw new Error(result.error.message);
  }

  return result.value;
}
