import { io } from "socket.io-client";

import type { AccountSession } from "../src/server/accounts";
import type { LeaderboardIdentity, LeaderboardSnapshot } from "../src/server/game-records";
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

type PlayerPayload = {
  accountToken?: string;
  playerId: string;
  playerName: string;
};

const DEFAULT_BASE_URL = "http://gomoku.yagu.ddns-ip.net";
const TIMEOUT_MS = 10_000;

async function main(): Promise<void> {
  const baseUrl = normalizeBaseUrl(process.argv[2] ?? DEFAULT_BASE_URL);
  const suffix = Date.now().toString(36);
  const guestHost = await connectClient(baseUrl);
  const guestWinner = await connectClient(baseUrl);
  const registeredHost = await connectClient(baseUrl);
  const registeredWinner = await connectClient(baseUrl);
  const hostAccount = await registerAccount(baseUrl, `Audience Host ${suffix}`);
  const winnerAccount = await registerAccount(baseUrl, `Audience Winner ${suffix}`);
  const guestHostId = `audience-guest-host-${suffix}`;
  const guestWinnerId = `audience-guest-winner-${suffix}`;

  try {
    console.log(`Leaderboard audience smoke: ${baseUrl}`);
    console.log(`PASS connect guest host - ${guestHost.io.engine.transport.name}`);
    console.log(`PASS connect guest winner - ${guestWinner.io.engine.transport.name}`);
    console.log(`PASS register host - ${hostAccount.playerId}`);
    console.log(`PASS register winner - ${winnerAccount.playerId}`);

    const guestGame = await playResignedGame(
      guestHost,
      guestWinner,
      {
        playerId: guestHostId,
        playerName: `Audience Guest Host ${suffix}`
      },
      {
        playerId: guestWinnerId,
        playerName: `Audience Guest Winner ${suffix}`
      }
    );
    const registeredGame = await playResignedGame(
      registeredHost,
      registeredWinner,
      {
        accountToken: hostAccount.token,
        playerId: "spoofed-audience-host",
        playerName: "Spoofed Audience Host"
      },
      {
        accountToken: winnerAccount.token,
        playerId: "spoofed-audience-winner",
        playerName: "Spoofed Audience Winner"
      }
    );

    console.log(`PASS guest ranked record - ${guestGame.gameId}`);
    console.log(`PASS registered ranked record - ${registeredGame.gameId}`);

    const registered = await fetchLeaderboard(baseUrl, "registered");
    const guests = await fetchLeaderboard(baseUrl, "guest");
    const all = await fetchLeaderboard(baseUrl, "all");

    assert(registered.identity === "registered", "registered query should return registered identity");
    assert(guests.identity === "guest", "guest query should return guest identity");
    assert(all.identity === "all", "all query should return all identity");
    assert(
      registered.entries.some((entry) => entry.playerId === winnerAccount.playerId && entry.identity === "registered"),
      "registered winner should appear in registered leaderboard"
    );
    assert(
      !registered.entries.some((entry) => entry.playerId === guestWinnerId),
      "guest winner should not appear in registered leaderboard"
    );
    assert(
      guests.entries.some((entry) => entry.playerId === guestWinnerId && entry.identity === "guest"),
      "guest winner should appear in guest leaderboard"
    );
    assert(
      !guests.entries.some((entry) => entry.playerId === winnerAccount.playerId),
      "registered winner should not appear in guest leaderboard"
    );
    assert(
      all.entries.some((entry) => entry.playerId === winnerAccount.playerId) &&
        all.entries.some((entry) => entry.playerId === guestWinnerId),
      "all leaderboard should include both audience types"
    );
    console.log("PASS leaderboard audience split");
  } finally {
    guestHost.disconnect();
    guestWinner.disconnect();
    registeredHost.disconnect();
    registeredWinner.disconnect();
  }
}

async function playResignedGame(
  host: SmokeSocket,
  winner: SmokeSocket,
  hostPayload: PlayerPayload,
  winnerPayload: PlayerPayload
): Promise<RoomSnapshot> {
  const created = requireRoomOk(await emitAck<RoomAck>(host, "room:create", hostPayload), "room:create").snapshot;
  const roomCode = created.code;

  requireRoomOk(await emitAck<RoomAck>(winner, "room:join", { ...winnerPayload, roomCode }), "room:join");
  requireRoomOk(await emitAck<RoomAck>(host, "room:ready", { ready: true, roomCode }), "host ready");
  requireRoomOk(await emitAck<RoomAck>(winner, "room:ready", { ready: true, roomCode }), "winner ready");

  const winnerSawFinished = waitForState(
    winner,
    (snapshot) => snapshot.code === roomCode && snapshot.status === "finished" && snapshot.finishReason === "resign"
  );
  const finished = requireRoomOk(await emitAck<RoomAck>(host, "game:resign", { roomCode }), "game resign").snapshot;

  await winnerSawFinished;
  requireRecordOk(
    await emitAck<GameRecordAck>(host, "game-record:submit", createGameRecordPayload(finished)),
    "host game-record:submit"
  );
  const verified = requireRecordOk(
    await emitAck<GameRecordAck>(winner, "game-record:submit", createGameRecordPayload(finished)),
    "winner game-record:submit"
  );

  assert(verified.record.recordStatus === "verified", "both submissions should verify the record");

  return finished;
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

async function fetchLeaderboard(baseUrl: string, identity: LeaderboardIdentity): Promise<LeaderboardSnapshot> {
  const params = new URLSearchParams({
    identity,
    limit: "100",
    scope: "overall"
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
