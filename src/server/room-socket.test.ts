import { createServer, type Server as HttpServer } from "node:http";
import type { AddressInfo } from "node:net";
import { Server } from "socket.io";
import { describe, expect, it } from "vitest";
import type { RoomAck } from "./room-contract";
import { registerRoomSocketHandlers, type RoomSocketServer } from "./room-socket";
import type { RoomSnapshot } from "./rooms";

type TestSocket = {
  disconnect: () => void;
  emit: (event: string, ...args: unknown[]) => void;
  on: (event: string, listener: (...args: unknown[]) => void) => void;
  once: (event: string, listener: (...args: unknown[]) => void) => void;
};

describe("room socket handlers", () => {
  it("syncs a two-player friend room through Socket.IO", async () => {
    const harness = await createSocketHarness();

    try {
      const host = await harness.connectClient();
      const guest = await harness.connectClient();

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
      expect(joinAck.ok ? joinAck.value.seat : null).toBe("white");
      expect((await hostSawJoin).players).toHaveLength(2);

      const guestSawHostReady = waitForEvent<RoomSnapshot>(guest, "room:state");
      const hostReadyAck = await emitAck(host, "room:ready", { ready: true, roomCode });
      expect(hostReadyAck.ok).toBe(true);
      expect((await guestSawHostReady).players.find((player) => player.seat === "black")?.ready).toBe(true);

      const hostSawReady = waitForEvent<RoomSnapshot>(host, "room:state");
      const readyAck = await emitAck(guest, "room:ready", { ready: true, roomCode });
      expect(readyAck.ok ? readyAck.value.snapshot.status : null).toBe("ready");
      expect((await hostSawReady).status).toBe("ready");

      const guestSawStart = waitForEvent<RoomSnapshot>(guest, "room:state");
      const startAck = await emitAck(host, "game:start", { roomCode });
      expect(startAck.ok ? startAck.value.snapshot.status : null).toBe("playing");
      expect((await guestSawStart).status).toBe("playing");

      const guestSawMove = waitForEvent<RoomSnapshot>(guest, "room:state");
      const moveAck = await emitAck(host, "game:move", {
        expectedMoveSeq: 0,
        point: { row: 7, col: 7 },
        roomCode
      });

      expect(moveAck.ok ? moveAck.value.snapshot.board[7][7] : null).toBe("black");

      const broadcastMove = await guestSawMove;
      expect(broadcastMove.board[7][7]).toBe("black");
      expect(broadcastMove.currentTurn).toBe("white");

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
});

async function createSocketHarness() {
  const httpServer = createServer();
  const io = new Server(httpServer, {
    path: "/socket.io"
  });
  const clients: TestSocket[] = [];

  registerRoomSocketHandlers(io as unknown as RoomSocketServer);

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

function emitAck(socket: TestSocket, event: string, payload: unknown): Promise<RoomAck> {
  return new Promise((resolve) => {
    socket.emit(event, payload, resolve);
  });
}

function waitForEvent<T = unknown>(socket: TestSocket, event: string): Promise<T> {
  return new Promise((resolve) => {
    socket.once(event, (payload: T) => resolve(payload));
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
