import { io } from "socket.io-client";

import type { Point, Stone } from "../src/game/types";
import type { RoomAck } from "../src/server/room-contract";
import type { RoomErrorCode, RoomSnapshot } from "../src/server/rooms";

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
  const host = await connectClient(baseUrl);
  const guest = await connectClient(baseUrl);

  try {
    console.log(`Online room smoke: ${baseUrl}`);
    console.log(`PASS connect host - ${host.io.engine.transport.name}`);
    console.log(`PASS connect guest - ${guest.io.engine.transport.name}`);

    const roomCode = await createAndJoinRoom(host, guest, suffix);

    await playGameOne(host, guest, roomCode);
    await restartRoom(host, guest, roomCode, "white", 2);
    await playGameTwo(host, guest, roomCode);
    await restartRoom(host, guest, roomCode, "black", 3);
    await playGameThree(host, guest, roomCode);
  } finally {
    host.disconnect();
    guest.disconnect();
  }
}

async function createAndJoinRoom(host: SmokeSocket, guest: SmokeSocket, suffix: string): Promise<string> {
  const createAck = await emitAck(host, "room:create", {
    playerId: `smoke-host-${suffix}`,
    playerName: `Smoke Host ${suffix}`
  });
  const createdRoom = requireOk(createAck, "room:create").snapshot;
  const roomCode = createdRoom.code;

  assert(createdRoom.players.length === 1, "room:create should return one player");
  assert(createdRoom.players[0]?.seat === "black", "host should sit black");
  console.log(`PASS room:create - ${roomCode}`);

  const hostSawJoin = waitForState(host, (snapshot) => snapshot.code === roomCode && snapshot.players.length === 2);
  const joinAck = await emitAck(guest, "room:join", {
    playerId: `smoke-guest-${suffix}`,
    playerName: `Smoke Guest ${suffix}`,
    roomCode
  });
  const joinedRoom = requireOk(joinAck, "room:join").snapshot;

  assert(joinedRoom.players.length === 2, "room:join should return two players");
  assert(joinedRoom.players.some((player) => player.seat === "white"), "guest should sit white");
  await hostSawJoin;
  console.log("PASS room:join - two players synced");

  return roomCode;
}

async function playGameOne(host: SmokeSocket, guest: SmokeSocket, roomCode: string): Promise<void> {
  await readyGame(host, guest, roomCode, "black", 1);
  await playMove(host, guest, roomCode, { row: 7, col: 7 }, "black", 0, "game 1 black center");
  await expectAckError(guest, "game:undo-request", { roomCode }, "not-last-move-player", "game 1 white undo denied");

  const requestId = await requestUndo(host, guest, roomCode, "black", "white", "game 1 black undo request");
  await respondUndo(guest, roomCode, requestId, false, "game 1 white rejected undo");
  await expectAckError(
    host,
    "game:undo-request",
    { roomCode },
    "undo-request-rejected-position",
    "game 1 rejected position blocks repeat"
  );

  const finished = requireOk(await emitAck(host, "game:resign", { roomCode }), "game 1 host resign").snapshot;

  assert(finished.status === "finished", "game 1 should finish after host resigns");
  assert(finished.winner === "white", "game 1 white should win after black resigns");
  console.log("PASS game 1 resign - black resigned, white won");
}

async function playGameTwo(host: SmokeSocket, guest: SmokeSocket, roomCode: string): Promise<void> {
  await readyGame(host, guest, roomCode, "white", 2);
  await playMove(guest, host, roomCode, { row: 7, col: 8 }, "white", 0, "game 2 white first move");
  await expectAckError(host, "game:undo-request", { roomCode }, "not-last-move-player", "game 2 black undo denied");

  const requestId = await requestUndo(guest, host, roomCode, "white", "black", "game 2 white undo request");
  const accepted = await respondUndo(host, roomCode, requestId, true, "game 2 black accepted undo");

  assert(accepted.board[7]?.[8] === null, "game 2 accepted undo should clear white stone");
  assert(accepted.currentTurn === "white", "game 2 accepted undo should return turn to white");
  await playMove(guest, host, roomCode, { row: 7, col: 8 }, "white", 0, "game 2 white replay");

  const finished = requireOk(await emitAck(guest, "game:resign", { roomCode }), "game 2 guest resign").snapshot;

  assert(finished.status === "finished", "game 2 should finish after guest resigns");
  assert(finished.winner === "black", "game 2 black should win after white resigns");
  console.log("PASS game 2 resign - white resigned, black won");
}

async function playGameThree(host: SmokeSocket, guest: SmokeSocket, roomCode: string): Promise<void> {
  await readyGame(host, guest, roomCode, "black", 3);
  await playMove(host, guest, roomCode, { row: 6, col: 6 }, "black", 0, "game 3 black first move");
  await playMove(guest, host, roomCode, { row: 6, col: 7 }, "white", 1, "game 3 white reply");

  const requestId = await requestUndo(guest, host, roomCode, "white", "black", "game 3 white undo request");
  await respondUndo(host, roomCode, requestId, false, "game 3 black rejected undo");
  await expectAckError(
    guest,
    "game:undo-request",
    { roomCode },
    "undo-request-rejected-position",
    "game 3 rejected position blocks repeat"
  );

  const finished = requireOk(await emitAck(host, "game:resign", { roomCode }), "game 3 host resign").snapshot;

  assert(finished.status === "finished", "game 3 should finish after host resigns");
  assert(finished.winner === "white", "game 3 white should win after black resigns");
  console.log("PASS game 3 resign - black resigned, white won");
}

async function readyGame(
  host: SmokeSocket,
  guest: SmokeSocket,
  roomCode: string,
  expectedStarter: Stone,
  gameNumber: number
): Promise<void> {
  const guestSawHostReady = waitForState(
    guest,
    (snapshot) => snapshot.code === roomCode && snapshot.players.some((player) => player.seat === "black" && player.ready)
  );
  requireOk(await emitAck(host, "room:ready", { ready: true, roomCode }), `game ${gameNumber} host ready`);
  await guestSawHostReady;

  const hostSawPlaying = waitForState(
    host,
    (snapshot) => snapshot.code === roomCode && snapshot.status === "playing" && snapshot.currentTurn === expectedStarter
  );
  const started = requireOk(
    await emitAck(guest, "room:ready", { ready: true, roomCode }),
    `game ${gameNumber} guest ready`
  ).snapshot;

  assert(started.status === "playing", `game ${gameNumber} should auto-start`);
  assert(started.currentTurn === expectedStarter, `game ${gameNumber} should start with ${expectedStarter}`);
  await hostSawPlaying;
  console.log(`PASS game ${gameNumber} ready - ${expectedStarter} starts`);
}

async function restartRoom(
  host: SmokeSocket,
  guest: SmokeSocket,
  roomCode: string,
  expectedStarter: Stone,
  nextGameNumber: number
): Promise<void> {
  const guestSawRestart = waitForState(
    guest,
    (snapshot) =>
      snapshot.code === roomCode &&
      snapshot.status === "waiting" &&
      snapshot.currentTurn === expectedStarter &&
      snapshot.moveSeq === 0
  );
  const restarted = requireOk(await emitAck(host, "game:restart", { roomCode }), `restart for game ${nextGameNumber}`)
    .snapshot;

  assert(restarted.status === "waiting", `restart for game ${nextGameNumber} should return to waiting`);
  assert(restarted.currentTurn === expectedStarter, `game ${nextGameNumber} should be queued for ${expectedStarter}`);
  assert(restarted.players.every((player) => !player.ready), `game ${nextGameNumber} should reset ready state`);
  await guestSawRestart;
  console.log(`PASS restart - game ${nextGameNumber} queued for ${expectedStarter}`);
}

async function playMove(
  actor: SmokeSocket,
  observer: SmokeSocket,
  roomCode: string,
  point: Point,
  stone: Stone,
  expectedMoveSeq: number,
  label: string
): Promise<RoomSnapshot> {
  const observerSawMove = waitForState(
    observer,
    (snapshot) => snapshot.code === roomCode && snapshot.board[point.row]?.[point.col] === stone
  );
  const snapshot = requireOk(
    await emitAck(actor, "game:move", {
      expectedMoveSeq,
      point,
      roomCode
    }),
    label
  ).snapshot;

  assert(snapshot.board[point.row]?.[point.col] === stone, `${label} ack should contain placed stone`);
  await observerSawMove;
  console.log(`PASS ${label} - synced`);

  return snapshot;
}

async function requestUndo(
  actor: SmokeSocket,
  observer: SmokeSocket,
  roomCode: string,
  requesterSeat: Stone,
  targetSeat: Stone,
  label: string
): Promise<string> {
  const observerSawRequest = waitForState(
    observer,
    (snapshot) =>
      snapshot.code === roomCode &&
      snapshot.undoRequest?.requesterSeat === requesterSeat &&
      snapshot.undoRequest.targetSeat === targetSeat
  );
  const requested = requireOk(await emitAck(actor, "game:undo-request", { roomCode }), label).snapshot;
  const requestId = requested.undoRequest?.id;

  assert(typeof requestId === "string" && requestId.length > 0, `${label} should return request id`);
  await observerSawRequest;
  console.log(`PASS ${label} - opponent received request`);

  return requestId;
}

async function respondUndo(
  actor: SmokeSocket,
  roomCode: string,
  requestId: string,
  accepted: boolean,
  label: string
): Promise<RoomSnapshot> {
  const snapshot = requireOk(
    await emitAck(actor, "game:undo-respond", {
      accepted,
      requestId,
      roomCode
    }),
    label
  ).snapshot;

  assert(snapshot.undoRequest === null, `${label} should clear pending undo request`);
  console.log(`PASS ${label}`);

  return snapshot;
}

async function expectAckError(
  socket: SmokeSocket,
  event: string,
  payload: unknown,
  expectedCode: RoomErrorCode,
  label: string
): Promise<void> {
  const ack = await emitAck(socket, event, payload);

  assert(!ack.ok, `${label} should fail`);
  assert(ack.error.code === expectedCode, `${label} should fail with ${expectedCode}, got ${ack.error.code}`);
  console.log(`PASS ${label} - ${expectedCode}`);
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
      if (!isRoomSnapshot(payload) || !predicate(payload)) {
        return;
      }

      clearTimeout(timeout);
      socket.off("room:state", listener);
      resolve(payload);
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

function isRoomSnapshot(value: unknown): value is RoomSnapshot {
  return typeof value === "object" && value !== null && "code" in value && "board" in value && "players" in value;
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

await main();
