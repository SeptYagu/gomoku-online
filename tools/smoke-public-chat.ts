import { io } from "socket.io-client";

import type { PublicChatAck } from "../src/server/room-contract";
import type { PublicChatSnapshot, RoomErrorCode } from "../src/server/rooms";

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
  const first = await connectClient(baseUrl);
  const second = await connectClient(baseUrl);

  try {
    console.log(`Public chat smoke: ${baseUrl}`);
    console.log(`PASS connect first - ${first.io.engine.transport.name}`);
    console.log(`PASS connect second - ${second.io.engine.transport.name}`);

    const firstList = requireOk(await emitAck(first, "public-chat:join", undefined), "first public-chat:join");
    const secondList = requireOk(await emitAck(second, "public-chat:join", undefined), "second public-chat:join");

    assert(Array.isArray(firstList.messages), "first public chat list should return messages");
    assert(Array.isArray(secondList.messages), "second public chat list should return messages");
    console.log(`PASS public chat join - ${secondList.messages.length} messages`);

    const text = `hello public ${suffix}`;
    const secondSawMessage = waitForPublicChat(
      second,
      (snapshot) => snapshot.messages.some((message) => message.text === text)
    );
    const sendAck = requireOk(
      await emitAck(first, "public-chat:send", {
        playerId: `public-first-${suffix}`,
        playerName: `Public First ${suffix}`,
        text
      }),
      "public chat send"
    );
    const message = sendAck.messages.at(-1);

    assert(message?.name === `Public First ${suffix}`, "public chat should preserve sender name");
    assert(message.text === text, "public chat should preserve text");
    await secondSawMessage;
    console.log("PASS public chat broadcast");

    await expectAckError(
      first,
      "public-chat:send",
      {
        playerId: `public-first-${suffix}`,
        playerName: `Public First ${suffix}`,
        text: "too soon"
      },
      "chat-rate-limited",
      "public chat rate limit"
    );
    await expectAckError(
      second,
      "public-chat:send",
      {
        playerId: `public-second-${suffix}`,
        playerName: `Public Second ${suffix}`,
        text: "   "
      },
      "chat-message-empty",
      "public empty chat rejected"
    );
    await expectAckError(
      second,
      "public-chat:send",
      {
        playerId: `public-second-${suffix}`,
        playerName: `Public Second ${suffix}`,
        text: "x".repeat(161)
      },
      "chat-message-too-long",
      "public long chat rejected"
    );
  } finally {
    first.disconnect();
    second.disconnect();
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

function emitAck(socket: SmokeSocket, event: string, payload: unknown): Promise<PublicChatAck> {
  return new Promise((resolve) => {
    socket.emit(event, payload, resolve);
  });
}

function waitForPublicChat(
  socket: SmokeSocket,
  predicate: (snapshot: PublicChatSnapshot) => boolean,
  timeoutMs = TIMEOUT_MS
): Promise<PublicChatSnapshot> {
  return new Promise((resolve, reject) => {
    const listener = (payload: unknown) => {
      const snapshot = payload as PublicChatSnapshot;

      if (!predicate(snapshot)) {
        return;
      }

      clearTimeout(timeout);
      socket.off("public-chat:messages", listener);
      resolve(snapshot);
    };
    const timeout = setTimeout(() => {
      socket.off("public-chat:messages", listener);
      reject(new Error("Timed out waiting for public-chat:messages"));
    }, timeoutMs);

    socket.on("public-chat:messages", listener);
  });
}

function requireOk(ack: PublicChatAck, label: string) {
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
