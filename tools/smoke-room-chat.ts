import { io } from "socket.io-client";

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
  const spectator = await connectClient(baseUrl);
  const stranger = await connectClient(baseUrl);

  try {
    console.log(`Room chat smoke: ${baseUrl}`);
    console.log(`PASS connect host - ${host.io.engine.transport.name}`);
    console.log(`PASS connect guest - ${guest.io.engine.transport.name}`);
    console.log(`PASS connect spectator - ${spectator.io.engine.transport.name}`);
    console.log(`PASS connect stranger - ${stranger.io.engine.transport.name}`);

    const roomCode = await createRoomWithSpectator(host, guest, spectator, suffix);

    const guestSawSpectatorChat = waitForState(
      guest,
      (snapshot) => snapshot.chatMessages.some((message) => message.text === "hello room chat")
    );
    const spectatorChat = requireOk(
      await emitAck(spectator, "room:chat-send", {
        roomCode,
        text: " hello\nroom   chat "
      }),
      "spectator chat"
    ).snapshot;
    const spectatorMessage = spectatorChat.chatMessages.at(-1);

    assert(spectatorMessage?.text === "hello room chat", "spectator chat should normalize whitespace");
    assert(spectatorMessage.role === "spectator", "spectator chat should keep sender role");
    assert(spectatorMessage.seat === null, "spectator chat should not have a seat");
    await guestSawSpectatorChat;
    console.log("PASS room chat spectator broadcast");

    await expectAckError(
      spectator,
      "room:chat-send",
      { roomCode, text: "too soon" },
      "chat-rate-limited",
      "room chat rate limit"
    );

    const spectatorSawHostChat = waitForState(
      spectator,
      (snapshot) => snapshot.chatMessages.some((message) => message.text === "host message")
    );
    const hostChat = requireOk(
      await emitAck(host, "room:chat-send", {
        roomCode,
        text: "host message"
      }),
      "host chat"
    ).snapshot;
    const hostMessage = hostChat.chatMessages.at(-1);

    assert(hostMessage?.role === "player", "host chat should keep player role");
    assert(hostMessage.seat === "black", "host chat should keep player seat");
    await spectatorSawHostChat;
    console.log("PASS room chat player broadcast");

    await expectAckError(
      host,
      "room:chat-send",
      { roomCode, text: "   " },
      "chat-message-empty",
      "empty chat rejected"
    );
    await expectAckError(
      host,
      "room:chat-send",
      { roomCode, text: "x".repeat(161) },
      "chat-message-too-long",
      "long chat rejected"
    );
    await expectAckError(
      stranger,
      "room:chat-send",
      { roomCode, text: "hello" },
      "not-room-member",
      "stranger chat rejected"
    );
  } finally {
    host.disconnect();
    guest.disconnect();
    spectator.disconnect();
    stranger.disconnect();
  }
}

async function createRoomWithSpectator(
  host: SmokeSocket,
  guest: SmokeSocket,
  spectator: SmokeSocket,
  suffix: string
): Promise<string> {
  const createAck = requireOk(
    await emitAck(host, "room:create", {
      playerId: `chat-host-${suffix}`,
      playerName: `Chat Host ${suffix}`
    }),
    "room:create"
  );
  const roomCode = createAck.snapshot.code;

  requireOk(
    await emitAck(guest, "room:join", {
      playerId: `chat-guest-${suffix}`,
      playerName: `Chat Guest ${suffix}`,
      roomCode
    }),
    "room:join guest"
  );
  requireOk(
    await emitAck(spectator, "room:join", {
      playerId: `chat-spectator-${suffix}`,
      playerName: `Chat Spectator ${suffix}`,
      roomCode
    }),
    "room:join spectator"
  );
  console.log(`PASS room chat setup - ${roomCode}`);

  return roomCode;
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

async function expectAckError(
  socket: SmokeSocket,
  event: string,
  payload: unknown,
  expectedCode: RoomErrorCode,
  label: string
) {
  const ack = await emitAck(socket, event, payload);

  assert(!ack.ok, `${label} should fail`);
  assert(ack.error.code === expectedCode, `${label} should fail with ${expectedCode}, got ${ack.error.code}`);
  console.log(`PASS ${label} - ${expectedCode}`);
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

await main();
