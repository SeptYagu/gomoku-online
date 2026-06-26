import { spawn, type ChildProcess } from "node:child_process";
import { createServer } from "node:net";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { io } from "socket.io-client";

import type { AccountSession } from "../src/server/accounts";
import type { GameRecordAck, RoomAck } from "../src/server/room-contract";
import type { RoomSnapshot } from "../src/server/rooms";

type BrowserTarget = {
  webSocketDebuggerUrl?: string;
};

type CdpMessage = {
  error?: {
    message?: string;
  };
  id?: number;
  result?: unknown;
};

type PendingCommand = {
  reject: (error: Error) => void;
  resolve: (value: unknown) => void;
};

type RuntimeEvaluateResult = {
  exceptionDetails?: unknown;
  result?: {
    value?: unknown;
  };
};

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
  once: (event: string, listener: (...args: unknown[]) => void) => void;
};

const DEFAULT_BASE_URL = "http://gomoku.yagu.ddns-ip.net";
const START_TIMEOUT_MS = 15_000;
const STEP_TIMEOUT_MS = 20_000;

async function main(): Promise<void> {
  const baseUrl = normalizeBaseUrl(process.argv[2] ?? DEFAULT_BASE_URL);
  const suffix = Date.now().toString(36);
  const hostAccount = await registerAccount(baseUrl, `Profile Page Host ${suffix}`);
  const guestAccount = await registerAccount(baseUrl, `Profile Page Guest ${suffix}`);
  const host = await connectClient(baseUrl);
  const guest = await connectClient(baseUrl);

  try {
    console.log(`Profile page smoke: ${baseUrl}`);
    console.log(`PASS register host - ${hostAccount.playerId}`);
    console.log(`PASS register guest - ${guestAccount.playerId}`);
    console.log(`PASS connect host - ${host.io.engine.transport.name}`);
    console.log(`PASS connect guest - ${guest.io.engine.transport.name}`);

    const finished = await playRegisteredGame(host, guest, hostAccount, guestAccount);
    requireOk(
      await emitAck<GameRecordAck>(host, "game-record:submit", createGameRecordPayload(finished, hostAccount.playerId)),
      "host game-record:submit"
    );

    const verified = requireOk(
      await emitAck<GameRecordAck>(guest, "game-record:submit", createGameRecordPayload(finished, guestAccount.playerId)),
      "guest game-record:submit"
    );
    assert(verified.record.recordStatus === "verified", "game record should verify after both submissions");

    await verifyProfilePage(baseUrl, hostAccount, finished.gameId);
    console.log(`PASS profile page readback - ${finished.gameId}`);
  } finally {
    host.disconnect();
    guest.disconnect();
  }
}

async function playRegisteredGame(
  host: SmokeSocket,
  guest: SmokeSocket,
  hostAccount: AccountSession,
  guestAccount: AccountSession
): Promise<RoomSnapshot> {
  const created = requireOk(
    await emitAck<RoomAck>(host, "room:create", {
      accountToken: hostAccount.token,
      playerId: "spoofed-host",
      playerName: "Spoofed Host"
    }),
    "room:create"
  ).snapshot;
  const roomCode = created.code;

  requireOk(
    await emitAck<RoomAck>(guest, "room:join", {
      accountToken: guestAccount.token,
      playerId: "spoofed-guest",
      playerName: "Spoofed Guest",
      roomCode
    }),
    "room:join"
  );
  requireOk(await emitAck<RoomAck>(host, "room:ready", { ready: true, roomCode }), "host ready");
  requireOk(await emitAck<RoomAck>(guest, "room:ready", { ready: true, roomCode }), "guest ready");
  requireOk(
    await emitAck<RoomAck>(host, "game:move", {
      expectedMoveSeq: 0,
      point: { col: 7, row: 7 },
      roomCode
    }),
    "host move"
  );
  requireOk(
    await emitAck<RoomAck>(guest, "game:move", {
      expectedMoveSeq: 1,
      point: { col: 8, row: 7 },
      roomCode
    }),
    "guest move"
  );
  requireOk(
    await emitAck<RoomAck>(host, "game:move", {
      expectedMoveSeq: 2,
      point: { col: 7, row: 8 },
      roomCode
    }),
    "host second move"
  );
  const resigned = requireOk(await emitAck<RoomAck>(host, "game:resign", { roomCode }), "host resign").snapshot;

  assert(resigned.status === "finished", "room should finish after resign");

  return resigned;
}

async function verifyProfilePage(baseUrl: string, account: AccountSession, gameId: string): Promise<void> {
  const baseOrigin = new URL(baseUrl).origin;
  const chromePath = findChromePath();
  const port = await getFreePort();
  const userDataDir = await mkdtemp(path.join(tmpdir(), "gomoku-profile-page-smoke-"));
  const chrome = launchChrome(chromePath, port, userDataDir, baseOrigin);

  try {
    await waitForChrome(port);

    const profileUrl = new URL(`/en/profile/${encodeURIComponent(account.playerId)}`, `${baseUrl}/`);
    profileUrl.searchParams.set("name", account.displayName);

    const targetUrl = await openBrowserTarget(port, profileUrl.toString());
    const cdp = await CdpClient.connect(targetUrl);

    try {
      await cdp.send("Page.enable");
      await cdp.send("Runtime.enable");
      await waitForProfileText(cdp, account.displayName, gameId);
      await waitForProfileReplay(cdp);
    } finally {
      cdp.close();
    }
  } finally {
    chrome.kill();
    await waitForProcessExit(chrome);
    await rm(userDataDir, { force: true, maxRetries: 10, recursive: true, retryDelay: 250 });
  }
}

class CdpClient {
  private commandId = 1;
  private readonly pending = new Map<number, PendingCommand>();

  private constructor(private readonly socket: WebSocket) {
    socket.addEventListener("message", (event) => {
      const message = JSON.parse(String(event.data)) as CdpMessage;

      if (!message.id) {
        return;
      }

      const pending = this.pending.get(message.id);

      if (!pending) {
        return;
      }

      this.pending.delete(message.id);

      if (message.error) {
        pending.reject(new Error(message.error.message ?? "Chrome DevTools Protocol command failed"));
        return;
      }

      pending.resolve(message.result);
    });
  }

  static connect(url: string): Promise<CdpClient> {
    return new Promise((resolve, reject) => {
      const socket = new WebSocket(url);
      const timeout = setTimeout(() => {
        socket.close();
        reject(new Error("Timed out connecting to Chrome DevTools Protocol"));
      }, START_TIMEOUT_MS);

      socket.addEventListener("open", () => {
        clearTimeout(timeout);
        resolve(new CdpClient(socket));
      });
      socket.addEventListener("error", () => {
        clearTimeout(timeout);
        reject(new Error("Failed to connect to Chrome DevTools Protocol"));
      });
    });
  }

  close(): void {
    this.socket.close();
  }

  send(method: string, params: Record<string, unknown> = {}): Promise<unknown> {
    const id = this.commandId;
    this.commandId += 1;

    return new Promise((resolve, reject) => {
      this.pending.set(id, { reject, resolve });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }
}

async function waitForProfileText(cdp: CdpClient, displayName: string, gameId: string): Promise<void> {
  await waitForValue(async () => {
    const bodyText = await evaluate<string>(cdp, "document.body.innerText");

    return bodyText.includes(displayName) && bodyText.includes(gameId) && bodyText.includes("Game records")
      ? true
      : null;
  }, STEP_TIMEOUT_MS);
}

async function waitForProfileReplay(cdp: CdpClient): Promise<void> {
  await waitForValue(async () => {
    const bodyText = await evaluate<string>(cdp, "document.body.innerText");

    return bodyText.includes("Move 3 / 3") ? true : null;
  }, STEP_TIMEOUT_MS);

  const clicked = await evaluate<boolean>(
    cdp,
    `(() => {
      const button = document.querySelector(".profile-replay-controls button");
      if (!button) {
        return false;
      }

      button.click();
      return true;
    })()`
  );

  assert(clicked, "profile replay previous button should exist");

  await waitForValue(async () => {
    const bodyText = await evaluate<string>(cdp, "document.body.innerText");

    return bodyText.includes("Move 2 / 3") ? true : null;
  }, STEP_TIMEOUT_MS);
}

async function evaluate<T>(cdp: CdpClient, expression: string): Promise<T> {
  const response = (await cdp.send("Runtime.evaluate", {
    awaitPromise: true,
    expression,
    returnByValue: true
  })) as RuntimeEvaluateResult;

  if (response.exceptionDetails) {
    throw new Error(`Runtime evaluation failed: ${JSON.stringify(response.exceptionDetails)}`);
  }

  return response.result?.value as T;
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

function connectClient(baseUrl: string): Promise<SmokeSocket> {
  return new Promise((resolve, reject) => {
    const socket = io(baseUrl, {
      forceNew: true,
      path: "/socket.io",
      reconnection: false,
      timeout: STEP_TIMEOUT_MS,
      transports: ["websocket"]
    }) as unknown as SmokeSocket;
    let settled = false;
    const timeout = setTimeout(() => finish(new Error("socket connect timed out")), STEP_TIMEOUT_MS);

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

function emitAck<T = RoomAck>(socket: SmokeSocket, event: string, payload: unknown): Promise<T> {
  return new Promise((resolve) => {
    socket.emit(event, payload, resolve);
  });
}

function createGameRecordPayload(snapshot: RoomSnapshot, playerId: string) {
  if (snapshot.status !== "finished" && snapshot.status !== "abandoned") {
    throw new Error("Snapshot must be finished before submitting a game record.");
  }

  return {
    board: snapshot.board,
    finishReason: snapshot.finishReason,
    gameId: snapshot.gameId,
    moveSeq: snapshot.moveSeq,
    moves: snapshot.moves,
    playerId,
    roomCode: snapshot.code,
    status: snapshot.status,
    winner: snapshot.winner
  };
}

function requireOk<T>(ack: { ok: true; value: T } | { ok: false; error: { code: string; message: string } }, label: string): T {
  if (!ack.ok) {
    throw new Error(`${label} failed: ${ack.error.code} ${ack.error.message}`);
  }

  return ack.value;
}

async function waitForValue<T>(read: () => Promise<T | null>, timeoutMs: number): Promise<T> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const value = await read();

    if (value !== null) {
      return value;
    }

    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  throw new Error("Timed out waiting for condition");
}

function normalizeBaseUrl(input: string): string {
  const withProtocol = input.includes("://") ? input : `http://${input}`;
  const url = new URL(withProtocol);
  const path = /^\/(?:en|zh|fr|es|ru|ar)?\/?$/.test(url.pathname)
    ? ""
    : url.pathname.replace(/\/+$/, "");

  return `${url.origin}${path}`;
}

function findChromePath(): string {
  const candidates = [
    process.env.CHROME_PATH,
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe"
  ].filter((candidate): candidate is string => Boolean(candidate));

  return candidates[0];
}

function launchChrome(chromePath: string, port: number, userDataDir: string, secureOrigin: string): ChildProcess {
  return spawn(
    chromePath,
    [
      "--headless=new",
      "--disable-gpu",
      "--no-first-run",
      "--no-default-browser-check",
      `--unsafely-treat-insecure-origin-as-secure=${secureOrigin}`,
      `--remote-debugging-port=${port}`,
      `--user-data-dir=${userDataDir}`,
      "about:blank"
    ],
    {
      stdio: "ignore",
      windowsHide: true
    }
  );
}

function waitForProcessExit(childProcess: ChildProcess, timeoutMs = 5_000): Promise<void> {
  if (childProcess.exitCode !== null || childProcess.killed) {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    const timeout = setTimeout(resolve, timeoutMs);

    childProcess.once("exit", () => {
      clearTimeout(timeout);
      resolve();
    });
  });
}

async function waitForChrome(port: number): Promise<void> {
  await waitForValue(async () => {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/version`);

      return response.ok ? true : null;
    } catch {
      return null;
    }
  }, START_TIMEOUT_MS);
}

async function openBrowserTarget(port: number, url: string): Promise<string> {
  const endpoint = `http://127.0.0.1:${port}/json/new?${encodeURIComponent(url)}`;
  let response = await fetch(endpoint, { method: "PUT" });

  if (!response.ok) {
    response = await fetch(endpoint);
  }

  if (!response.ok) {
    throw new Error(`Failed to open browser target: HTTP ${response.status}`);
  }

  const target = (await response.json()) as BrowserTarget;

  if (!target.webSocketDebuggerUrl) {
    throw new Error("Chrome target did not return a websocket debugger URL");
  }

  return target.webSocketDebuggerUrl;
}

function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();

    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();

      if (!address || typeof address === "string") {
        server.close();
        reject(new Error("Could not allocate a TCP port"));
        return;
      }

      const { port } = address;
      server.close(() => resolve(port));
    });
  });
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

await main();
