import { spawn, type ChildProcess } from "node:child_process";
import { createServer } from "node:net";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { io } from "socket.io-client";

import type { RoomAck } from "../src/server/room-contract";

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
  once: (event: string, listener: (...args: unknown[]) => void) => void;
};

type PreparedRooms = {
  cleanup: () => void;
  playingCode: string;
  waitingCode: string;
};

type ClickResult = {
  detail: string;
  ok: boolean;
};

const DEFAULT_BASE_URL = "http://gomoku.yagu.ddns-ip.net";
const START_TIMEOUT_MS = 15_000;
const STEP_TIMEOUT_MS = 20_000;

async function main(): Promise<void> {
  const baseUrl = normalizeBaseUrl(process.argv[2] ?? DEFAULT_BASE_URL);
  const baseOrigin = new URL(baseUrl).origin;
  const preparedRooms = await prepareRooms(baseUrl);
  const chromePath = findChromePath();
  const port = await getFreePort();
  const userDataDir = await mkdtemp(path.join(tmpdir(), "gomoku-lobby-ui-smoke-"));
  const chrome = launchChrome(chromePath, port, userDataDir, baseOrigin);

  try {
    await waitForChrome(port);
    const targetUrl = await openBrowserTarget(port, new URL("/en", `${baseUrl}/`).toString());
    const cdp = await CdpClient.connect(targetUrl);

    try {
      await cdp.send("Page.enable");
      await cdp.send("Runtime.enable");
      await waitForRuntime(cdp);
      await assertNoRealtimeConnection(cdp, "local");
      await clickButton(cdp, "AI");
      await assertNoRealtimeConnection(cdp, "AI");
      await clickButton(cdp, "Friend room");
      await waitForOnlineView(cdp, "lobby");
      await assertOnlineWorkspaceIsolation(cdp, "lobby");
      await assertLeaderboardSearchSubmit(cdp);

      await waitForBodyText(cdp, preparedRooms.waitingCode);
      await assertLobbyRowContains(cdp, preparedRooms.waitingCode, "Join room");
      await clickLobbyRoomButton(cdp, preparedRooms.waitingCode);
      await waitForRoomUrl(cdp, preparedRooms.waitingCode);
      await waitForOnlineView(cdp, "table");
      await assertOnlineWorkspaceIsolation(cdp, "table");
      await clickButton(cdp, "Leave");
      await waitForNoRoomUrl(cdp);
      await waitForOnlineView(cdp, "lobby");
      await assertOnlineWorkspaceIsolation(cdp, "lobby");

      await waitForBodyText(cdp, preparedRooms.playingCode);
      await assertLobbyRowContains(cdp, preparedRooms.playingCode, "Watch");
      await clickLobbyRoomButton(cdp, preparedRooms.playingCode);
      await waitForRoomUrl(cdp, preparedRooms.playingCode);
      await waitForOnlineView(cdp, "table");
      await assertOnlineWorkspaceIsolation(cdp, "table");
      await waitForBodyText(cdp, "Spectator");

      console.log(`Lobby UI smoke: ${baseUrl}`);
      console.log("PASS local and AI workspaces do not create a realtime connection");
      console.log("PASS leaderboard search has an explicit submit button");
      console.log(`PASS lobby waiting row join - ${preparedRooms.waitingCode}`);
      console.log(`PASS lobby playing row watch - ${preparedRooms.playingCode}`);
      console.log("PASS online lobby and table are mutually exclusive");
    } finally {
      cdp.close();
    }
  } finally {
    preparedRooms.cleanup();
    chrome.kill();
    await waitForProcessExit(chrome);
    await rm(userDataDir, { force: true, maxRetries: 10, recursive: true, retryDelay: 250 });
  }
}

async function assertNoRealtimeConnection(cdp: CdpClient, workspace: "local" | "AI"): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 500));
  const socketResources = await evaluate<string[]>(
    cdp,
    `performance.getEntriesByType("resource")
      .map((entry) => entry.name)
      .filter((name) => name.includes("/socket.io"))`
  );

  if (socketResources.length > 0) {
    throw new Error(`${workspace} workspace opened a realtime connection: ${socketResources.join(", ")}`);
  }
}

async function assertLeaderboardSearchSubmit(cdp: CdpClient): Promise<void> {
  await waitForValue(async () => {
    const hasSubmit = await evaluate<boolean>(
      cdp,
      `Boolean(document.querySelector('.room-leaderboard-search input[type="search"]') && document.querySelector('.room-leaderboard-search button[type="submit"]'))`
    );

    return hasSubmit ? true : null;
  }, STEP_TIMEOUT_MS);
}

async function waitForOnlineView(cdp: CdpClient, view: "lobby" | "table"): Promise<void> {
  await waitForValue(async () => {
    const found = await evaluate<boolean>(cdp, `Boolean(document.querySelector('[data-online-view="${view}"]'))`);

    return found ? true : null;
  }, STEP_TIMEOUT_MS);
}

async function assertOnlineWorkspaceIsolation(cdp: CdpClient, expected: "lobby" | "table"): Promise<void> {
  const result = await evaluate<{
    hasLobbyOnlyContent: boolean;
    hasLobbyView: boolean;
    hasPlayArea: boolean;
    hasTableView: boolean;
  }>(
    cdp,
    `(() => ({
      hasLobbyOnlyContent: Boolean(document.querySelector('.room-lobby, .public-chat, .room-leaderboard, .room-presence')),
      hasLobbyView: Boolean(document.querySelector('[data-online-view="lobby"]')),
      hasPlayArea: Boolean(document.querySelector('[data-online-view="table"] .play-area')),
      hasTableView: Boolean(document.querySelector('[data-online-view="table"]'))
    }))()`
  );

  const isValid =
    expected === "lobby"
      ? result.hasLobbyView && result.hasLobbyOnlyContent && !result.hasTableView && !result.hasPlayArea
      : result.hasTableView && result.hasPlayArea && !result.hasLobbyView && !result.hasLobbyOnlyContent;

  if (!isValid) {
    throw new Error(`Online workspace isolation failed for ${expected}: ${JSON.stringify(result)}`);
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

async function prepareRooms(baseUrl: string): Promise<PreparedRooms> {
  const suffix = Date.now().toString(36);
  const waitingHost = await connectClient(baseUrl);
  const playingHost = await connectClient(baseUrl);
  const playingGuest = await connectClient(baseUrl);

  const waitingRoom = requireOk(
    await emitAck(waitingHost, "room:create", {
      playerId: `ui-waiting-host-${suffix}`,
      playerName: `UI Waiting ${suffix}`
    }),
    "waiting room:create"
  ).snapshot;
  const playingRoom = requireOk(
    await emitAck(playingHost, "room:create", {
      playerId: `ui-playing-host-${suffix}`,
      playerName: `UI Playing ${suffix}`
    }),
    "playing room:create"
  ).snapshot;

  requireOk(
    await emitAck(playingGuest, "room:join", {
      playerId: `ui-playing-guest-${suffix}`,
      playerName: `UI Guest ${suffix}`,
      roomCode: playingRoom.code
    }),
    "playing room:join"
  );
  requireOk(await emitAck(playingHost, "room:ready", { ready: true, roomCode: playingRoom.code }), "host ready");
  requireOk(await emitAck(playingGuest, "room:ready", { ready: true, roomCode: playingRoom.code }), "guest ready");

  return {
    cleanup() {
      waitingHost.disconnect();
      playingHost.disconnect();
      playingGuest.disconnect();
    },
    playingCode: playingRoom.code,
    waitingCode: waitingRoom.code
  };
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

function emitAck(socket: SmokeSocket, event: string, payload: unknown): Promise<RoomAck> {
  return new Promise((resolve) => {
    socket.emit(event, payload, resolve);
  });
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

async function clickButton(cdp: CdpClient, text: string): Promise<void> {
  const result = await waitForValue(
    async () =>
      evaluate<ClickResult>(
        cdp,
        `(() => {
          const buttons = Array.from(document.querySelectorAll("button"));
          const button = buttons.find((candidate) => (candidate.textContent || "").includes(${JSON.stringify(text)}));
          if (!button) {
            return { ok: false, detail: buttons.map((candidate) => (candidate.textContent || "").trim()).join(" | ") };
          }
          button.click();
          return { ok: true, detail: (button.textContent || "").trim() };
        })()`
      ),
    STEP_TIMEOUT_MS
  );

  if (!result.ok) {
    throw new Error(`Could not find button "${text}". Buttons: ${result.detail}`);
  }
}

async function clickLobbyRoomButton(cdp: CdpClient, roomCode: string): Promise<void> {
  const result = await waitForValue(
    async () =>
      evaluate<ClickResult>(
        cdp,
        `(() => {
          const rows = Array.from(document.querySelectorAll(".room-lobby-item"));
          const row = rows.find((candidate) => (candidate.textContent || "").includes(${JSON.stringify(roomCode)}));
          const button = row?.querySelector("button");
          if (!row || !button) {
            return { ok: false, detail: rows.map((candidate) => (candidate.textContent || "").trim()).join(" | ") };
          }
          button.click();
          return { ok: true, detail: (row.textContent || "").trim() };
        })()`
      ),
    STEP_TIMEOUT_MS
  );

  if (!result.ok) {
    throw new Error(`Could not click lobby room ${roomCode}. Rows: ${result.detail}`);
  }
}

async function assertLobbyRowContains(cdp: CdpClient, roomCode: string, text: string): Promise<void> {
  await waitForValue(async () => {
    const contains = await evaluate<boolean>(
      cdp,
      `Array.from(document.querySelectorAll(".room-lobby-item")).some((row) => {
        const content = row.textContent || "";
        return content.includes(${JSON.stringify(roomCode)}) && content.includes(${JSON.stringify(text)});
      })`
    );

    return contains ? true : null;
  }, STEP_TIMEOUT_MS);
}

async function waitForRuntime(cdp: CdpClient): Promise<void> {
  await waitForValue(
    async () => {
      const ready = await evaluate<boolean>(
        cdp,
        `document.readyState === "complete" && Array.from(document.querySelectorAll("button")).some((button) => (button.textContent || "").includes("Friend room"))`
      );

      return ready ? true : null;
    },
    START_TIMEOUT_MS
  );
}

async function waitForBodyText(cdp: CdpClient, text: string): Promise<void> {
  await waitForValue(async () => {
    const bodyText = await evaluate<string>(cdp, "document.body.innerText");

    return bodyText.includes(text) ? true : null;
  }, STEP_TIMEOUT_MS);
}

async function waitForRoomUrl(cdp: CdpClient, roomCode: string): Promise<void> {
  await waitForValue(async () => {
    const href = await evaluate<string>(cdp, "window.location.href");

    return new URL(href).searchParams.get("room") === roomCode ? true : null;
  }, STEP_TIMEOUT_MS);
}

async function waitForNoRoomUrl(cdp: CdpClient): Promise<void> {
  await waitForValue(async () => {
    const href = await evaluate<string>(cdp, "window.location.href");

    return new URL(href).searchParams.has("room") ? null : true;
  }, STEP_TIMEOUT_MS);
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

function requireOk(ack: RoomAck, label: string) {
  if (!ack.ok) {
    throw new Error(`${label} failed: ${ack.error.code} ${ack.error.message}`);
  }

  return ack.value;
}

await main();
