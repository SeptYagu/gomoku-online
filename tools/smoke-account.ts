import { io } from "socket.io-client";

import type { AccountSession } from "../src/server/accounts";
import type { LeaderboardSnapshot, PlayerProfileSnapshot } from "../src/server/game-records";
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
  const hostAccount = await registerAccount(baseUrl, `Account Host ${suffix}`);
  const guestAccount = await registerAccount(baseUrl, `Account Guest ${suffix}`);
  const host = await connectClient(baseUrl);
  const guest = await connectClient(baseUrl);

  try {
    console.log(`Account smoke: ${baseUrl}`);
    console.log(`PASS register host - ${hostAccount.playerId}`);
    console.log(`PASS register guest - ${guestAccount.playerId}`);
    console.log(`PASS connect host - ${host.io.engine.transport.name}`);
    console.log(`PASS connect guest - ${guest.io.engine.transport.name}`);

    const session = await fetchSession(baseUrl, hostAccount.token);

    assert(session.playerId === hostAccount.playerId, "account session should verify registered token");
    console.log("PASS account session verify");

    const created = requireRoomOk(
      await emitAck<RoomAck>(host, "room:create", {
        accountToken: hostAccount.token,
        playerId: "spoofed-host",
        playerName: "Spoofed Host"
      }),
      "room:create"
    );

    assert(created.identity === "registered", "host room identity should be registered");
    assert(created.playerId === hostAccount.playerId, "host room identity should use account id");

    const roomCode = created.snapshot.code;
    const joined = requireRoomOk(
      await emitAck<RoomAck>(guest, "room:join", {
        accountToken: guestAccount.token,
        playerId: "spoofed-guest",
        playerName: "Spoofed Guest",
        roomCode
      }),
      "room:join"
    );

    assert(joined.identity === "registered", "guest room identity should be registered");
    assert(joined.playerId === guestAccount.playerId, "guest room identity should use account id");
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

    assert(verified.record.recordStatus === "verified", "registered submissions should verify the game record");
    assert(
      verified.record.players.every((player) => player.identity === "registered"),
      "registered game record should preserve registered identities"
    );
    console.log(`PASS registered record verified - ${finished.gameId}`);

    const guestProfile = await fetchProfile(baseUrl, guestAccount);

    assert(guestProfile.identity === "registered", "registered profile should keep registered identity");
    assert(guestProfile.stats.wins === 1, "registered winner should have one profile win");
    assert(guestProfile.recentRecords[0]?.gameId === finished.gameId, "registered profile should include the game");
    console.log("PASS registered profile readback");

    const leaderboard = await fetchLeaderboard(baseUrl);
    const rankedGuest = leaderboard.entries.find((entry) => entry.playerId === guestAccount.playerId);

    assert(rankedGuest?.identity === "registered", "registered winner should appear as registered in leaderboard");
    assert(rankedGuest.wins >= 1, "registered winner should have leaderboard win");
    console.log("PASS registered leaderboard readback");
  } finally {
    host.disconnect();
    guest.disconnect();
  }
}

async function registerAccount(baseUrl: string, displayName: string): Promise<AccountSession> {
  const response = await fetch(`${baseUrl}/api/account/register`, {
    body: JSON.stringify({ displayName }),
    headers: {
      "accept": "application/json",
      "content-type": "application/json"
    },
    method: "POST"
  });

  assert(response.ok, `POST /api/account/register should succeed, got ${response.status}`);

  return (await response.json()) as AccountSession;
}

async function fetchSession(baseUrl: string, token: string): Promise<AccountSession> {
  const response = await fetch(`${baseUrl}/api/account/session`, {
    headers: {
      "accept": "application/json",
      "authorization": `Bearer ${token}`
    }
  });

  assert(response.ok, `GET /api/account/session should succeed, got ${response.status}`);

  return (await response.json()) as AccountSession;
}

async function fetchProfile(baseUrl: string, account: AccountSession): Promise<PlayerProfileSnapshot> {
  const params = new URLSearchParams({
    limit: "5",
    name: account.displayName,
    playerId: account.playerId
  });
  const response = await fetch(`${baseUrl}/api/profile?${params.toString()}`, {
    headers: {
      "accept": "application/json",
      "authorization": `Bearer ${account.token}`
    }
  });

  assert(response.ok, `GET /api/profile should succeed, got ${response.status}`);

  return (await response.json()) as PlayerProfileSnapshot;
}

async function fetchLeaderboard(baseUrl: string): Promise<LeaderboardSnapshot> {
  const response = await fetch(`${baseUrl}/api/leaderboard?scope=overall&limit=100`, {
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
