import { io } from "socket.io-client";

import type { LeaderboardSnapshot } from "../src/server/game-records";
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
  const hostId = `rank-host-${suffix}`;
  const guestId = `rank-guest-${suffix}`;
  const host = await connectClient(baseUrl);
  const guest = await connectClient(baseUrl);

  try {
    console.log(`Leaderboard smoke: ${baseUrl}`);
    console.log(`PASS connect host - ${host.io.engine.transport.name}`);
    console.log(`PASS connect guest - ${guest.io.engine.transport.name}`);

    const created = requireRoomOk(
      await emitAck<RoomAck>(host, "room:create", {
        playerId: hostId,
        playerName: `Rank Host ${suffix}`
      }),
      "room:create"
    ).snapshot;
    const roomCode = created.code;

    requireRoomOk(
      await emitAck<RoomAck>(guest, "room:join", {
        playerId: guestId,
        playerName: `Rank Guest ${suffix}`,
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
    console.log(`PASS submitted verified ranked record - ${finished.gameId}`);

    const overall = await fetchLeaderboard(baseUrl, "overall");
    const daily = await fetchLeaderboard(baseUrl, "daily");
    const streak = await fetchLeaderboard(baseUrl, "streak");
    const overallGuest = overall.entries.find((entry) => entry.playerId === guestId);
    const dailyGuest = daily.entries.find((entry) => entry.playerId === guestId);
    const streakGuest = streak.entries.find((entry) => entry.playerId === guestId);
    const overallHost = overall.entries.find((entry) => entry.playerId === hostId);

    assert(overall.identity === "guest", "guest smoke should read the guest leaderboard");
    assert(daily.identity === "guest", "guest daily smoke should read the guest leaderboard");
    assert(streak.identity === "guest", "guest streak smoke should read the guest leaderboard");
    assert(overallGuest?.wins === 1, "winner should appear with one overall win");
    assert(overallGuest.rating > 1200, "winner rating should increase");
    assert(overallHost?.losses === 1, "loser should appear with one overall loss");
    assert(dailyGuest?.dailyWins === 1, "winner should appear in daily ranking");
    assert(streakGuest?.currentStreak === 1, "winner should appear in streak ranking");
    console.log(`PASS leaderboard readback - ${finished.gameId}`);
  } finally {
    host.disconnect();
    guest.disconnect();
  }
}

async function fetchLeaderboard(baseUrl: string, scope: "daily" | "overall" | "streak"): Promise<LeaderboardSnapshot> {
  const params = new URLSearchParams({
    identity: "guest",
    limit: "100",
    scope
  });
  const response = await fetch(`${baseUrl}/api/leaderboard?${params.toString()}`, {
    headers: {
      "accept": "application/json"
    }
  });

  assert(response.ok, `GET /api/leaderboard should succeed, got ${response.status}`);

  return (await response.json()) as LeaderboardSnapshot;
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
