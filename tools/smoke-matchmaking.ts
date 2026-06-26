import { io } from "socket.io-client";

import type { RoomAck, RoomListAck } from "../src/server/room-contract";
import type { LobbyRoomDeletedEvent, LobbyRoomUpdatedEvent } from "../src/server/rooms";

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
  const first = await connectClient(baseUrl);
  const second = await connectClient(baseUrl);
  const third = await connectClient(baseUrl);

  try {
    console.log(`Matchmaking smoke: ${baseUrl}`);
    console.log(`PASS connect lobby - ${lobby.io.engine.transport.name}`);
    console.log(`PASS connect first - ${first.io.engine.transport.name}`);
    console.log(`PASS connect second - ${second.io.engine.transport.name}`);
    console.log(`PASS connect third - ${third.io.engine.transport.name}`);

    requireListOk(await emitAck<RoomListAck>(lobby, "lobby:join", { limit: 20 }), "lobby:join");

    const lobbySawCreate = waitForLobbyUpdate(
      lobby,
      (event) => event.room.status === "waiting" && event.room.hostName === `Match One ${suffix}`
    );
    const firstMatch = requireRoomOk(
      await emitAck<RoomAck>(first, "matchmaking:find", {
        playerId: `match-one-${suffix}`,
        playerName: `Match One ${suffix}`
      }),
      "first matchmaking:find"
    );
    const firstRoomCode = firstMatch.snapshot.code;
    const createdEvent = await lobbySawCreate;

    assert(firstMatch.role === "player", "first match should enter as player");
    assert(firstMatch.seat === "black", "first match should take black seat");
    assert(createdEvent.room.code === firstRoomCode, "lobby created event should match first room");
    assert(createdEvent.room.canJoin, "first matchmaking room should be joinable");
    console.log(`PASS first find creates waiting room - ${firstRoomCode}`);

    const lobbySawJoin = waitForLobbyUpdate(
      lobby,
      (event) => event.room.code === firstRoomCode && event.room.playerCount === 2 && !event.room.canJoin
    );
    const secondMatch = requireRoomOk(
      await emitAck<RoomAck>(second, "matchmaking:find", {
        playerId: `match-two-${suffix}`,
        playerName: `Match Two ${suffix}`
      }),
      "second matchmaking:find"
    );

    assert(secondMatch.snapshot.code === firstRoomCode, "second match should join first waiting room");
    assert(secondMatch.seat === "white", "second match should take white seat");
    await lobbySawJoin;
    console.log(`PASS second find joins waiting room - ${firstRoomCode}`);

    const thirdMatch = requireRoomOk(
      await emitAck<RoomAck>(third, "matchmaking:find", {
        playerId: `match-three-${suffix}`,
        playerName: `Match Three ${suffix}`
      }),
      "third matchmaking:find"
    );
    const thirdRoomCode = thirdMatch.snapshot.code;

    assert(thirdRoomCode !== firstRoomCode, "third match should not overfill the paired room");
    assert(thirdMatch.snapshot.players.length === 1, "third match should create a new waiting room");
    console.log(`PASS third find does not overfill - ${thirdRoomCode}`);

    const lobbySawCancel = waitForLobbyDelete(lobby, (event) => event.code === thirdRoomCode);
    requireRoomOk(await emitAck<RoomAck>(third, "matchmaking:cancel", { roomCode: thirdRoomCode }), "match cancel");
    await lobbySawCancel;
    console.log(`PASS cancel closes solo waiting match - ${thirdRoomCode}`);
  } finally {
    lobby.disconnect();
    first.disconnect();
    second.disconnect();
    third.disconnect();
  }
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
