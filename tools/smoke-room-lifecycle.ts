import { io } from "socket.io-client";

import type { RoomAck } from "../src/server/room-contract";
import type { LobbyRoomDeletedEvent, RoomListSnapshot, RoomSnapshot } from "../src/server/rooms";

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
  const mirror = await connectClient(baseUrl);

  try {
    console.log(`Room lifecycle smoke: ${baseUrl}`);
    console.log(`PASS connect host - ${host.io.engine.transport.name}`);
    console.log(`PASS connect guest - ${guest.io.engine.transport.name}`);
    console.log(`PASS connect spectator - ${spectator.io.engine.transport.name}`);
    console.log(`PASS connect mirror - ${mirror.io.engine.transport.name}`);

    await verifyRepeatedCreateClosesPreviousRoom(baseUrl, host, suffix);
    await verifySamePlayerCreateClosesPreviousRoom(baseUrl, host, mirror, suffix);
    await verifySameGuestNameCreateClosesPreviousRoom(baseUrl, host, mirror, suffix);
    await verifyWaitingRoomClosesAfterCreatorDisconnects(baseUrl, suffix);
    await verifySpectatorCanSitInOpenSeat(host, guest, spectator, suffix);
    await verifyDisconnectTimeoutForfeit(host, guest, suffix);
  } finally {
    host.disconnect();
    guest.disconnect();
    spectator.disconnect();
    mirror.disconnect();
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

async function verifySamePlayerCreateClosesPreviousRoom(
  baseUrl: string,
  firstSocket: SmokeSocket,
  secondSocket: SmokeSocket,
  suffix: string
): Promise<void> {
  const first = requireOk(
    await emitAck(firstSocket, "room:create", {
      playerId: `mirror-host-${suffix}`,
      playerName: `Mirror Host ${suffix}`
    }),
    "mirror first room:create"
  ).snapshot;
  const firstClosed = waitForRoomClosed(firstSocket, first.code);
  const second = requireOk(
    await emitAck(secondSocket, "room:create", {
      playerId: `mirror-host-${suffix}`,
      playerName: `Mirror Host ${suffix}`
    }),
    "mirror second room:create"
  ).snapshot;

  await firstClosed;
  assert(first.code !== second.code, "same player on another socket should allocate a new room");

  const rooms = await fetchRoomList(baseUrl);

  assert(!rooms.rooms.some((room) => room.code === first.code), "first mirror room should be closed");
  assert(rooms.rooms.some((room) => room.code === second.code), "second mirror room should remain listed");
  console.log(`PASS same player create closes previous room - ${first.code} -> ${second.code}`);
}

async function verifySameGuestNameCreateClosesPreviousRoom(
  baseUrl: string,
  firstSocket: SmokeSocket,
  secondSocket: SmokeSocket,
  suffix: string
): Promise<void> {
  const first = requireOk(
    await emitAck(firstSocket, "room:create", {
      playerId: `name-tab-a-${suffix}`,
      playerName: `Name Shared ${suffix}`
    }),
    "same-name first room:create"
  ).snapshot;
  const firstClosed = waitForRoomClosed(firstSocket, first.code);
  const second = requireOk(
    await emitAck(secondSocket, "room:create", {
      playerId: `name-tab-b-${suffix}`,
      playerName: `Name Shared ${suffix}`
    }),
    "same-name second room:create"
  ).snapshot;

  await firstClosed;
  assert(first.code !== second.code, "same guest name on another socket should allocate a new room");

  const rooms = await fetchRoomList(baseUrl);

  assert(!rooms.rooms.some((room) => room.code === first.code), "first same-name room should be closed");
  assert(rooms.rooms.some((room) => room.code === second.code), "second same-name room should remain listed");
  console.log(`PASS same guest name create closes previous room - ${first.code} -> ${second.code}`);
}

async function verifyWaitingRoomClosesAfterCreatorDisconnects(baseUrl: string, suffix: string): Promise<void> {
  const socket = await connectClient(baseUrl);

  try {
    const created = requireOk(
      await emitAck(socket, "room:create", {
        playerId: `empty-host-${suffix}`,
        playerName: `Empty Host ${suffix}`
      }),
      "empty room:create"
    ).snapshot;
    const roomCode = created.code;

    socket.disconnect();

    await waitForRoomAbsent(baseUrl, roomCode);
    console.log(`PASS empty waiting room closes on disconnect - ${roomCode}`);
  } finally {
    socket.disconnect();
  }
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

async function waitForRoomAbsent(baseUrl: string, roomCode: string, timeoutMs = TIMEOUT_MS): Promise<void> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() <= deadline) {
    const rooms = await fetchRoomList(baseUrl);

    if (!rooms.rooms.some((room) => room.code === roomCode)) {
      return;
    }

    await sleep(250);
  }

  throw new Error(`Timed out waiting for room ${roomCode} to close`);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

function waitForRoomClosed(socket: SmokeSocket, roomCode: string, timeoutMs = TIMEOUT_MS): Promise<LobbyRoomDeletedEvent> {
  return new Promise((resolve, reject) => {
    const listener = (payload: unknown) => {
      const event = payload as LobbyRoomDeletedEvent;

      if (event.code !== roomCode) {
        return;
      }

      clearTimeout(timeout);
      socket.off("room:closed", listener);
      resolve(event);
    };
    const timeout = setTimeout(() => {
      socket.off("room:closed", listener);
      reject(new Error("Timed out waiting for room:closed"));
    }, timeoutMs);

    socket.on("room:closed", listener);
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
