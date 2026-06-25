import { io } from "socket.io-client";

import type { RoomAck, RoomListAck } from "../src/server/room-contract";
import type { LobbyRoomDeletedEvent, LobbyRoomUpdatedEvent, RoomListSnapshot } from "../src/server/rooms";

type SmokeSocket = {
  disconnect: () => void;
  emit: (event: string, ...args: unknown[]) => void;
  io: {
    engine: {
      transport: {
        name: string;
      };
    };
  };
  off: (event: string, listener: (...args: unknown[]) => void) => void;
  on: (event: string, listener: (...args: unknown[]) => void) => void;
  once: (event: string, listener: (...args: unknown[]) => void) => void;
};

const DEFAULT_BASE_URL = "http://gomoku.yagu.ddns-ip.net";
const TIMEOUT_MS = 10_000;

async function main(): Promise<void> {
  const baseUrl = normalizeBaseUrl(process.argv[2] ?? DEFAULT_BASE_URL);
  const suffix = Date.now().toString(36);
  const lobby = await connectClient(baseUrl);
  const host = await connectClient(baseUrl);
  const guest = await connectClient(baseUrl);

  try {
    console.log(`Lobby smoke: ${baseUrl}`);
    console.log(`PASS connect lobby - ${lobby.io.engine.transport.name}`);
    console.log(`PASS connect host - ${host.io.engine.transport.name}`);
    console.log(`PASS connect guest - ${guest.io.engine.transport.name}`);

    const initialRest = await fetchRoomList(baseUrl);
    assert(Array.isArray(initialRest.rooms), "REST room list should return rooms array");
    console.log(`PASS REST room list - version ${initialRest.version}`);

    const lobbyAck = requireListOk(await emitAck<RoomListAck>(lobby, "lobby:join", { limit: 20 }), "lobby:join");
    assert(Array.isArray(lobbyAck.rooms), "lobby:join should return room list");
    console.log(`PASS lobby:join - ${lobbyAck.rooms.length} rooms`);

    const lobbySawCreate = waitForLobbyUpdate(
      lobby,
      (event) => event.room.status === "waiting" && event.room.hostName.includes("Lobby Host")
    );
    const createAck = requireRoomOk(
      await emitAck<RoomAck>(host, "room:create", {
        playerId: `lobby-host-${suffix}`,
        playerName: `Lobby Host ${suffix}`
      }),
      "room:create"
    );
    const roomCode = createAck.snapshot.code;
    const createdEvent = await lobbySawCreate;

    assert(createdEvent.room.code === roomCode, "lobby create event should match created room");
    assert(createdEvent.room.canJoin, "created room should be joinable");
    console.log(`PASS lobby room created - ${roomCode}`);

    const createdRest = await fetchRoomList(baseUrl);
    assert(createdRest.rooms.some((room) => room.code === roomCode), "REST room list should include created room");
    console.log("PASS REST room list includes created room");

    const lobbySawJoin = waitForLobbyUpdate(
      lobby,
      (event) => event.room.code === roomCode && event.room.playerCount === 2 && event.room.canWatch
    );
    requireRoomOk(
      await emitAck<RoomAck>(guest, "room:join", {
        playerId: `lobby-guest-${suffix}`,
        playerName: `Lobby Guest ${suffix}`,
        roomCode
      }),
      "room:join"
    );
    await lobbySawJoin;
    console.log("PASS lobby room joined - player count updated");

    const lobbySawPlaying = waitForLobbyUpdate(
      lobby,
      (event) => event.room.code === roomCode && event.room.status === "playing"
    );
    requireRoomOk(await emitAck<RoomAck>(host, "room:ready", { ready: true, roomCode }), "host ready");
    requireRoomOk(await emitAck<RoomAck>(guest, "room:ready", { ready: true, roomCode }), "guest ready");
    await lobbySawPlaying;
    console.log("PASS lobby room playing - status updated");

    const lobbySawDelete = waitForLobbyDelete(lobby, (event) => event.code === roomCode);
    requireRoomOk(await emitAck<RoomAck>(host, "game:resign", { roomCode }), "game resign");
    await lobbySawDelete;
    console.log("PASS lobby room deleted - finished room hidden");

    const finalRest = await fetchRoomList(baseUrl);
    assert(!finalRest.rooms.some((room) => room.code === roomCode), "REST default room list should hide finished room");
    console.log("PASS REST room list hides finished room");
  } finally {
    lobby.disconnect();
    host.disconnect();
    guest.disconnect();
  }
}

async function fetchRoomList(baseUrl: string): Promise<RoomListSnapshot> {
  const response = await fetch(`${baseUrl}/api/rooms?limit=20`, {
    headers: {
      "accept": "application/json"
    }
  });

  assert(response.ok, `GET /api/rooms should succeed, got ${response.status}`);

  return (await response.json()) as RoomListSnapshot;
}

function normalizeBaseUrl(input: string): string {
  const withProtocol = input.includes("://") ? input : `http://${input}`;
  const url = new URL(withProtocol);
  const path = /^\/(?:en|zh|fr|es|ru|ar)?\/?$/.test(url.pathname)
    ? ""
    : url.pathname.replace(/\/+$/, "");

  return `${url.origin}${path}`;
}

function connectClient(baseUrl: string): Promise<SmokeSocket> {
  return new Promise((resolve, reject) => {
    const socket = io(baseUrl, {
      forceNew: true,
      path: "/socket.io",
      reconnection: false,
      timeout: TIMEOUT_MS,
      transports: ["websocket"]
    }) as unknown as SmokeSocket;
    let settled = false;
    const timeout = setTimeout(() => finish(new Error("socket connect timed out")), TIMEOUT_MS);

    function finish(result: Error | SmokeSocket): void {
      if (settled) {
        return;
      }

      settled = true;
      clearTimeout(timeout);

      if (result instanceof Error) {
        socket.disconnect();
        reject(result);
        return;
      }

      resolve(result);
    }

    socket.once("connect", () => finish(socket));
    socket.once("connect_error", (error: unknown) => {
      finish(error instanceof Error ? error : new Error(String(error)));
    });
  });
}

function emitAck<T>(socket: SmokeSocket, event: string, payload: unknown): Promise<T> {
  return new Promise((resolve) => {
    socket.emit(event, payload, resolve);
  });
}

function waitForLobbyUpdate(
  socket: SmokeSocket,
  predicate: (event: LobbyRoomUpdatedEvent) => boolean,
  timeoutMs = TIMEOUT_MS
): Promise<LobbyRoomUpdatedEvent> {
  return waitForLobbyEvent(socket, "lobby:room-updated", predicate, timeoutMs);
}

function waitForLobbyDelete(
  socket: SmokeSocket,
  predicate: (event: LobbyRoomDeletedEvent) => boolean,
  timeoutMs = TIMEOUT_MS
): Promise<LobbyRoomDeletedEvent> {
  return waitForLobbyEvent(socket, "lobby:room-deleted", predicate, timeoutMs);
}

function waitForLobbyEvent<T>(
  socket: SmokeSocket,
  eventName: string,
  predicate: (event: T) => boolean,
  timeoutMs = TIMEOUT_MS
): Promise<T> {
  return new Promise((resolve, reject) => {
    const listener = (payload: unknown) => {
      const event = payload as T;

      if (!predicate(event)) {
        return;
      }

      clearTimeout(timeout);
      socket.off(eventName, listener);
      resolve(event);
    };
    const timeout = setTimeout(() => {
      socket.off(eventName, listener);
      reject(new Error(`Timed out waiting for ${eventName}`));
    }, timeoutMs);

    socket.on(eventName, listener);
  });
}

function requireRoomOk(ack: RoomAck, label: string) {
  if (!ack.ok) {
    throw new Error(`${label} failed: ${ack.error.code} ${ack.error.message}`);
  }

  return ack.value;
}

function requireListOk(ack: RoomListAck, label: string) {
  if (!ack.ok) {
    throw new Error(`${label} failed: ${ack.error.code} ${ack.error.message}`);
  }

  return ack.value;
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

await main();
