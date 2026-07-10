import { io } from "socket.io-client";

import type { PresenceAck, RoomAck } from "../src/server/room-contract";
import type { PresenceSnapshot } from "../src/server/rooms";

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
  const lobbyName = `P Lobby ${suffix}`;
  const hostName = `P Host ${suffix}`;
  const guestName = `P Guest ${suffix}`;
  const spectatorName = `P Watch ${suffix}`;
  const lobby = await connectClient(baseUrl);
  const host = await connectClient(baseUrl);
  const guest = await connectClient(baseUrl);
  const spectator = await connectClient(baseUrl);

  try {
    console.log(`Presence smoke: ${baseUrl}`);
    console.log(`PASS connect lobby - ${lobby.io.engine.transport.name}`);
    console.log(`PASS connect host - ${host.io.engine.transport.name}`);
    console.log(`PASS connect guest - ${guest.io.engine.transport.name}`);
    console.log(`PASS connect spectator - ${spectator.io.engine.transport.name}`);

    const lobbyPresence = requirePresenceOk(
      await emitAck<PresenceAck>(lobby, "presence:join", {
        playerId: `presence-lobby-${suffix}`,
        playerName: lobbyName
      }),
      "presence:join lobby"
    );

    assert(
      lobbyPresence.users.some((user) => user.name === lobbyName && user.status === "online"),
      "lobby user should be online"
    );
    console.log("PASS presence lobby online");

    const lobbySawHost = waitForPresence(
      lobby,
      (snapshot) => snapshot.users.some((user) => user.name === hostName && user.status === "in_room")
    );
    const created = requireRoomOk(
      await emitAck<RoomAck>(host, "room:create", {
        playerId: `presence-host-${suffix}`,
        playerName: hostName
      }),
      "room:create"
    ).snapshot;
    const roomCode = created.code;

    await lobbySawHost;
    console.log(`PASS presence host in room - ${roomCode}`);

    const lobbySawPlaying = waitForPresence(
      lobby,
      (snapshot) =>
        snapshot.users.some((user) => user.name === hostName && user.status === "playing") &&
        snapshot.users.some((user) => user.name === guestName && user.status === "playing") &&
        snapshot.users.some((user) => user.name === spectatorName && user.status === "spectating")
    );

    requireRoomOk(
      await emitAck<RoomAck>(guest, "room:join", {
        playerId: `presence-guest-${suffix}`,
        playerName: guestName,
        roomCode
      }),
      "room:join guest"
    );
    requireRoomOk(
      await emitAck<RoomAck>(spectator, "room:join", {
        playerId: `presence-watcher-${suffix}`,
        playerName: spectatorName,
        roomCode
      }),
      "room:join spectator"
    );
    requireRoomOk(await emitAck<RoomAck>(host, "room:ready", { ready: true, roomCode }), "host ready");
    requireRoomOk(await emitAck<RoomAck>(guest, "room:ready", { ready: true, roomCode }), "guest ready");

    const playingPresence = await lobbySawPlaying;

    assert(
      playingPresence.users.some((user) => user.name === spectatorName && user.roomCode === roomCode),
      "spectator presence should include room code"
    );
    console.log("PASS presence playing and spectating");

    const apiPresence = await fetchPresence(baseUrl);

    assert(
      apiPresence.users.some((user) => user.name === hostName && user.status === "playing"),
      "GET /api/presence should include playing host"
    );
    assert(
      apiPresence.users.some((user) => user.name === spectatorName && user.status === "spectating"),
      "GET /api/presence should include spectating watcher"
    );
    console.log("PASS presence REST readback");
  } finally {
    lobby.disconnect();
    host.disconnect();
    guest.disconnect();
    spectator.disconnect();
  }
}

async function fetchPresence(baseUrl: string): Promise<PresenceSnapshot> {
  const response = await fetch(`${baseUrl}/api/presence?limit=50`, {
    headers: {
      "accept": "application/json"
    }
  });

  assert(response.ok, `GET /api/presence should succeed, got ${response.status}`);

  return (await response.json()) as PresenceSnapshot;
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

function waitForPresence(
  socket: SmokeSocket,
  predicate: (snapshot: PresenceSnapshot) => boolean,
  timeoutMs = TIMEOUT_MS
): Promise<PresenceSnapshot> {
  return new Promise((resolve, reject) => {
    let latestSnapshot: PresenceSnapshot | null = null;
    const listener = (payload: unknown) => {
      const snapshot = payload as PresenceSnapshot;

      latestSnapshot = snapshot;

      if (!predicate(snapshot)) {
        return;
      }

      clearTimeout(timeout);
      socket.off("presence:users", listener);
      resolve(snapshot);
    };
    const timeout = setTimeout(() => {
      socket.off("presence:users", listener);
      reject(
        new Error(
          `Timed out waiting for presence:users; latest=${JSON.stringify(
            latestSnapshot?.users.map((user) => ({ name: user.name, roomCode: user.roomCode, status: user.status })) ?? []
          )}`
        )
      );
    }, timeoutMs);

    socket.on("presence:users", listener);
  });
}

function requireRoomOk(ack: RoomAck, label: string) {
  if (!ack.ok) {
    throw new Error(`${label} failed: ${ack.error.code} ${ack.error.message}`);
  }

  return ack.value;
}

function requirePresenceOk(ack: PresenceAck, label: string) {
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
