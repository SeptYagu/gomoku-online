import { io } from "socket.io-client";

import type { RoomAck } from "../src/server/room-contract";
import type { RoomListSnapshot, RoomSnapshot } from "../src/server/rooms";

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
const DISCONNECT_TIMEOUT_WAIT_MS = 80_000;

async function main(): Promise<void> {
  const baseUrl = normalizeBaseUrl(process.argv[2] ?? DEFAULT_BASE_URL);
  const suffix = Date.now().toString(36);
  const host = await connectClient(baseUrl);
  const guest = await connectClient(baseUrl);
  const spectator = await connectClient(baseUrl);

  try {
    console.log(`Room lifecycle smoke: ${baseUrl}`);
    console.log(`PASS connect host - ${host.io.engine.transport.name}`);
    console.log(`PASS connect guest - ${guest.io.engine.transport.name}`);
    console.log(`PASS connect spectator - ${spectator.io.engine.transport.name}`);

    await verifyRepeatedCreateClosesPreviousRoom(baseUrl, host, suffix);
    await verifySpectatorCanSitInOpenSeat(host, guest, spectator, suffix);
    await verifyDisconnectTimeoutForfeit(host, guest, suffix);
  } finally {
    host.disconnect();
    guest.disconnect();
    spectator.disconnect();
  }
}

async function verifyRepeatedCreateClosesPreviousRoom(
  baseUrl: string,
  host: SmokeSocket,
  suffix: string
): Promise<void> {
  const first = requireOk(
    await emitAck(host, "room:create", {
      playerId: `lifecycle-host-${suffix}`,
      playerName: `Lifecycle Host ${suffix}`
    }),
    "first room:create"
  ).snapshot;
  const second = requireOk(
    await emitAck(host, "room:create", {
      playerId: `lifecycle-host-${suffix}`,
      playerName: `Lifecycle Host ${suffix}`
    }),
    "second room:create"
  ).snapshot;

  assert(first.code !== second.code, "second create should allocate a new room");

  const rooms = await fetchRoomList(baseUrl);

  assert(!rooms.rooms.some((room) => room.code === first.code), "first room should be closed after second create");
  assert(rooms.rooms.some((room) => room.code === second.code), "second room should remain listed");
  console.log(`PASS repeated create closes previous room - ${first.code} -> ${second.code}`);
}

async function verifySpectatorCanSitInOpenSeat(
  host: SmokeSocket,
  guest: SmokeSocket,
  spectator: SmokeSocket,
  suffix: string
): Promise<void> {
  const created = requireOk(
    await emitAck(host, "room:create", {
      playerId: `sit-host-${suffix}`,
      playerName: `Sit Host ${suffix}`
    }),
    "sit room:create"
  ).snapshot;
  const roomCode = created.code;

  requireOk(
    await emitAck(guest, "room:join", {
      playerId: `sit-guest-${suffix}`,
      playerName: `Sit Guest ${suffix}`,
      roomCode
    }),
    "sit room:join guest"
  );
  requireOk(
    await emitAck(spectator, "room:join", {
      playerId: `sit-spectator-${suffix}`,
      playerName: `Sit Spectator ${suffix}`,
      roomCode
    }),
    "sit room:join spectator"
  );
  requireOk(await emitAck(guest, "room:leave", { roomCode }), "sit guest leave");

  const hostSawSit = waitForState(
    host,
    (snapshot) => snapshot.players.some((player) => player.name === `Sit Spectator ${suffix}` && player.seat === "white")
  );
  const seated = requireOk(await emitAck(spectator, "room:sit", { roomCode }), "room:sit");

  assert(seated.role === "player", "spectator should become a player after sitting");
  assert(seated.seat === "white", "spectator should take the open white seat");
  await hostSawSit;
  console.log(`PASS spectator sits in open seat - ${roomCode}`);
}

async function verifyDisconnectTimeoutForfeit(
  host: SmokeSocket,
  guest: SmokeSocket,
  suffix: string
): Promise<void> {
  const created = requireOk(
    await emitAck(host, "room:create", {
      playerId: `timeout-host-${suffix}`,
      playerName: `Timeout Host ${suffix}`
    }),
    "timeout room:create"
  ).snapshot;
  const roomCode = created.code;

  requireOk(
    await emitAck(guest, "room:join", {
      playerId: `timeout-guest-${suffix}`,
      playerName: `Timeout Guest ${suffix}`,
      roomCode
    }),
    "timeout room:join guest"
  );
  requireOk(await emitAck(host, "room:ready", { ready: true, roomCode }), "timeout host ready");
  requireOk(await emitAck(guest, "room:ready", { ready: true, roomCode }), "timeout guest ready");

  const hostSawTimeout = waitForState(
    host,
    (snapshot) => snapshot.code === roomCode && snapshot.status === "finished" && snapshot.winner === "black",
    DISCONNECT_TIMEOUT_WAIT_MS
  );

  guest.disconnect();

  await hostSawTimeout;
  console.log(`PASS disconnect timeout forfeit - ${roomCode}`);
}

async function fetchRoomList(baseUrl: string): Promise<RoomListSnapshot> {
  const response = await fetch(`${baseUrl}/api/rooms?limit=50`, {
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

function emitAck(socket: SmokeSocket, event: string, payload: unknown): Promise<RoomAck> {
  return new Promise((resolve) => {
    socket.emit(event, payload, resolve);
  });
}

function waitForState(
  socket: SmokeSocket,
  predicate: (snapshot: RoomSnapshot) => boolean,
  timeoutMs = TIMEOUT_MS
): Promise<RoomSnapshot> {
  return new Promise((resolve, reject) => {
    const listener = (payload: unknown) => {
      const snapshot = payload as RoomSnapshot;

      if (!predicate(snapshot)) {
        return;
      }

      clearTimeout(timeout);
      socket.off("room:state", listener);
      resolve(snapshot);
    };
    const timeout = setTimeout(() => {
      socket.off("room:state", listener);
      reject(new Error("Timed out waiting for room:state"));
    }, timeoutMs);

    socket.on("room:state", listener);
  });
}

function requireOk(ack: RoomAck, label: string) {
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
