import { createServer, type Server as HttpServer } from "node:http";
import type { AddressInfo } from "node:net";
import { Server } from "socket.io";
import { describe, expect, it } from "vitest";
import type { RoomAck, RoomListAck } from "./room-contract";
import { registerRoomSocketHandlers, type RoomSocketServer } from "./room-socket";
import { RoomStore, type LobbyRoomDeletedEvent, type LobbyRoomUpdatedEvent, type RoomSnapshot } from "./rooms";

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
});

async function createSocketHarness(options: { lifecycleIntervalMs?: false | number; roomStore?: RoomStore } = {}) {
  const httpServer = createServer();
  const io = new Server(httpServer, {
    path: "/socket.io"
  });
  const clients: TestSocket[] = [];

  registerRoomSocketHandlers(io as unknown as RoomSocketServer, options.roomStore ?? new RoomStore(), {
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
