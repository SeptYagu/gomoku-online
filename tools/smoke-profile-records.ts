import { io } from "socket.io-client";

import type { PlayerProfileSnapshot } from "../src/server/game-records";
import type { GameRecordAck, RoomAck } from "../src/server/room-contract";
import type { RoomSnapshot } from "../src/server/rooms";

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
  const hostId = `profile-host-${suffix}`;
  const guestId = `profile-guest-${suffix}`;
  const host = await connectClient(baseUrl);
  const guest = await connectClient(baseUrl);

  try {
    console.log(`Profile records smoke: ${baseUrl}`);
    console.log(`PASS connect host - ${host.io.engine.transport.name}`);
    console.log(`PASS connect guest - ${guest.io.engine.transport.name}`);

    const created = requireRoomOk(
      await emitAck<RoomAck>(host, "room:create", {
        playerId: hostId,
        playerName: `Profile Host ${suffix}`
      }),
      "room:create"
    ).snapshot;
    const roomCode = created.code;

    requireRoomOk(
      await emitAck<RoomAck>(guest, "room:join", {
        playerId: guestId,
        playerName: `Profile Guest ${suffix}`,
        roomCode
      }),
      "room:join"
    );
    requireRoomOk(await emitAck<RoomAck>(host, "room:ready", { ready: true, roomCode }), "host ready");
    requireRoomOk(await emitAck<RoomAck>(guest, "room:ready", { ready: true, roomCode }), "guest ready");

    const guestSawFinished = waitForState(
      guest,
      (snapshot) => snapshot.code === roomCode && snapshot.status === "finished" && snapshot.finishReason === "resign"
    );
    const finished = requireRoomOk(await emitAck<RoomAck>(host, "game:resign", { roomCode }), "game resign").snapshot;

    await guestSawFinished;

    requireRecordOk(
      await emitAck<GameRecordAck>(host, "game-record:submit", createGameRecordPayload(finished)),
      "host game-record:submit"
    );
    const verified = requireRecordOk(
      await emitAck<GameRecordAck>(guest, "game-record:submit", createGameRecordPayload(finished)),
      "guest game-record:submit"
    );

    assert(verified.record.recordStatus === "verified", "both submissions should verify the game record");
    console.log(`PASS submitted verified record - ${finished.gameId}`);

    const hostProfile = await fetchProfile(baseUrl, hostId, `Profile Host ${suffix}`);
    const guestProfile = await fetchProfile(baseUrl, guestId, `Profile Guest ${suffix}`);
    const aliasProfile = await fetchProfile(baseUrl, hostId, `Profile Host ${suffix}`, "/api/game-records");

    assert(hostProfile.stats.games === 1, "host profile should include one game");
    assert(hostProfile.stats.losses === 1, "host profile should record a loss");
    assert(hostProfile.recentRecords[0]?.gameId === finished.gameId, "host profile should include the finished game");
    assert(hostProfile.recentRecords[0]?.result === "loss", "host result should be loss");
    assert(hostProfile.recentRecords[0]?.recordStatus === "verified", "host record should be verified");
    assert(hostProfile.recentRecords[0]?.moveSeq === finished.moveSeq, "host record should keep move sequence");
    assert(guestProfile.stats.wins === 1, "guest profile should record a win");
    assert(guestProfile.recentRecords[0]?.result === "win", "guest result should be win");
    assert(aliasProfile.recentRecords[0]?.gameId === finished.gameId, "/api/game-records should return profile records");
    console.log(`PASS profile readback - ${finished.gameId}`);
  } finally {
    host.disconnect();
    guest.disconnect();
  }
}

async function fetchProfile(
  baseUrl: string,
  playerId: string,
  name: string,
  path = "/api/profile"
): Promise<PlayerProfileSnapshot> {
  const params = new URLSearchParams({
    limit: "5",
    name,
    playerId
  });
  const response = await fetch(`${baseUrl}${path}?${params.toString()}`, {
    headers: {
      "accept": "application/json"
    }
  });

  assert(response.ok, `GET ${path} should succeed, got ${response.status}`);

  return (await response.json()) as PlayerProfileSnapshot;
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

function requireRoomOk(ack: RoomAck, label: string) {
  if (!ack.ok) {
    throw new Error(`${label} failed: ${ack.error.code} ${ack.error.message}`);
  }

  return ack.value;
}

function requireRecordOk(ack: GameRecordAck, label: string) {
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
