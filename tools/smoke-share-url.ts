import { spawn, type ChildProcess } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createServer } from "node:net";

type BrowserTarget = {
  webSocketDebuggerUrl?: string;
};

type CdpMessage = {
  error?: {
    message?: string;
  };
  id?: number;
  method?: string;
  params?: unknown;
  result?: unknown;
};

type PendingCommand = {
  reject: (error: Error) => void;
  resolve: (value: unknown) => void;
};

type RuntimeEvaluateResult = {
  exceptionDetails?: unknown;
  result?: {
    description?: string;
    value?: unknown;
  };
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
  const hostName = `Share Host ${Date.now().toString(36)}`;
  const chromePath = findChromePath();
  const port = await getFreePort();
  const userDataDir = await mkdtemp(path.join(tmpdir(), "gomoku-share-smoke-"));
  const chrome = launchChrome(chromePath, port, userDataDir, baseOrigin);

  try {
    await waitForChrome(port);
    const targetUrl = await openBrowserTarget(port, new URL("/en", `${baseUrl}/`).toString());
    const cdp = await CdpClient.connect(targetUrl);

    try {
      await cdp.send("Page.enable");
      await cdp.send("Runtime.enable");
      await cdp
        .send("Browser.grantPermissions", {
          origin: baseOrigin,
          permissions: ["clipboardReadWrite", "clipboardSanitizedWrite"]
        })
        .catch(() => undefined);
      await waitForRuntime(cdp);
      await clickButton(cdp, "Friend room");
      await clickLobbySection(cdp, "identity");
      await setPlayerName(cdp, hostName);
      await clickLobbySection(cdp, "friends");
      await clickButton(cdp, "Create room");

      const roomUrl = await waitForValue(async () => {
        const href = await evaluate<string>(cdp, "window.location.href");
        const roomCode = new URL(href).searchParams.get("room");

        return roomCode ? href : null;
      }, STEP_TIMEOUT_MS);
      const roomCode = new URL(roomUrl).searchParams.get("room") ?? "";

      await assertCreateRoomUnavailable(cdp);
      await assertHostRoomCount(baseUrl, hostName, 1);
      await clickCreateRoomIfAvailable(cdp);
      await sleep(750);
      await assertHostRoomCount(baseUrl, hostName, 1);

      const inviteTargetUrl = await openBrowserTarget(port, `${baseOrigin}/?room=${roomCode}`);
      const inviteCdp = await CdpClient.connect(inviteTargetUrl);

      try {
        await inviteCdp.send("Page.enable");
        await inviteCdp.send("Runtime.enable");
        await waitForRuntime(inviteCdp);
        await waitForValue(async () => {
          const href = await evaluate<string>(inviteCdp, "window.location.href");
          const bodyText = await evaluate<string>(inviteCdp, "document.body.innerText");
          const hasTable = await evaluate<boolean>(
            inviteCdp,
            `Boolean(document.querySelector('[data-online-view="table"]'))`
          );
          const url = new URL(href);

          return url.searchParams.get("room") === roomCode && bodyText.includes(roomCode) && hasTable
            ? href
            : null;
        }, STEP_TIMEOUT_MS);
      } finally {
        await inviteCdp.send("Page.close").catch(() => undefined);
        inviteCdp.close();
      }

      await sleep(750);
      await cdp.send("Page.bringToFront").catch(() => undefined);
      await clickTableSidebarInfo(cdp);
      await clickButton(cdp, "Copy invite");
      const copyState = await waitForValue(async () => {
        const bodyText = await evaluate<string>(cdp, "document.body.innerText");

        if (bodyText.includes("Copied")) {
          return "copied";
        }

        if (bodyText.includes("Copy this link:")) {
          return "manual-fallback";
        }

        return null;
      }, 5_000);

      if (copyState !== "copied") {
        throw new Error(`Copy invite did not report clipboard success; state=${copyState}`);
      }

      await clickTableExit(cdp);
      const clearedUrl = await waitForValue(async () => {
        const href = await evaluate<string>(cdp, "window.location.href");
        const hasRoom = new URL(href).searchParams.has("room");

        return hasRoom ? null : href;
      }, STEP_TIMEOUT_MS);

      await waitForRoomAbsent(baseUrl, roomCode);

      const registeredName = `Invite ${Date.now().toString(36)}`;

      await clickLobbySection(cdp, "friends");
      await clickButton(cdp, "Create room");
      const registeredInviteRoomUrl = await waitForValue(async () => {
        const href = await evaluate<string>(cdp, "window.location.href");

        return new URL(href).searchParams.get("room") ? href : null;
      }, STEP_TIMEOUT_MS);
      const registeredInviteRoomCode = new URL(registeredInviteRoomUrl).searchParams.get("room") ?? "";
      const registeredAccount = await registerAccount(baseUrl, registeredName);

      await evaluate(
        cdp,
        `window.localStorage.setItem("gomoku-account-token", ${JSON.stringify(registeredAccount.token)})`
      );

      const registeredInviteTargetUrl = await openBrowserTarget(
        port,
        `${baseOrigin}/?room=${registeredInviteRoomCode}`
      );
      const registeredInviteCdp = await CdpClient.connect(registeredInviteTargetUrl);

      try {
        await registeredInviteCdp.send("Page.enable");
        await registeredInviteCdp.send("Runtime.enable");
        await waitForRuntime(registeredInviteCdp);
        await waitForValue(async () => {
          const bodyText = await evaluate<string>(registeredInviteCdp, "document.body.innerText");
          const hasTable = await evaluate<boolean>(
            registeredInviteCdp,
            `Boolean(document.querySelector('[data-online-view="table"]'))`
          );

          return hasTable && bodyText.includes(registeredInviteRoomCode) && bodyText.includes(registeredName)
            ? bodyText
            : null;
        }, STEP_TIMEOUT_MS);
      } finally {
        await registeredInviteCdp.send("Page.close").catch(() => undefined);
        registeredInviteCdp.close();
      }

      await sleep(750);
      await cdp.send("Page.bringToFront").catch(() => undefined);
      await clickTableExit(cdp);
      await waitForRoomAbsent(baseUrl, registeredInviteRoomCode);

      console.log(`Share URL smoke: ${baseUrl}`);
      console.log(`PASS create room URL - ${roomCode}`);
      console.log("PASS create room locked while already in room");
      console.log("PASS invite link auto join - root URL preserved room");
      console.log("PASS copy invite - copied current URL");
      console.log(`PASS leave room URL clear - ${clearedUrl}`);
      console.log(`PASS empty room closed after leave - ${roomCode}`);
      console.log(`PASS registered account restored before invite auto join - ${registeredInviteRoomCode}`);
    } finally {
      cdp.close();
    }
  } finally {
    chrome.kill();
    await waitForProcessExit(chrome);
    await rm(userDataDir, { force: true, maxRetries: 10, recursive: true, retryDelay: 250 });
  }
}

async function registerAccount(baseUrl: string, displayName: string): Promise<{ token: string }> {
  const response = await fetch(`${baseUrl}/api/account/register`, {
    body: JSON.stringify({ displayName }),
    headers: {
      "accept": "application/json",
      "content-type": "application/json"
    },
    method: "POST"
  });

  if (!response.ok) {
    throw new Error(`Account registration failed: ${response.status} ${await response.text()}`);
  }

  return (await response.json()) as { token: string };
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

async function clickLobbySection(cdp: CdpClient, section: "friends" | "identity"): Promise<void> {
  const result = await waitForValue(
    async () =>
      evaluate<ClickResult>(
        cdp,
        `(() => {
          const button = document.querySelector('[data-lobby-section-toggle="${section}"]');
          if (!button) {
            return { ok: false, detail: document.body.innerText };
          }
          button.click();
          return { ok: true, detail: (button.textContent || '').trim() };
        })()`
      ),
    STEP_TIMEOUT_MS
  );

  if (!result.ok) {
    throw new Error(`Could not toggle lobby section ${section}: ${result.detail}`);
  }
}

async function clickTableSidebarInfo(cdp: CdpClient): Promise<void> {
  const result = await waitForValue(
    async () =>
      evaluate<ClickResult>(
        cdp,
        `(() => {
          const buttons = Array.from(document.querySelectorAll('[data-table-sidebar-tab="info"]'));
          if (buttons.length !== 1) {
            return { ok: false, detail: String(buttons.length) };
          }
          buttons[0].click();
          return { ok: true, detail: 'info' };
        })()`
      ),
    STEP_TIMEOUT_MS
  );

  if (!result.ok) {
    throw new Error(`Could not open room info tab: ${result.detail}`);
  }
}

async function clickTableExit(cdp: CdpClient): Promise<void> {
  const result = await waitForValue(
    async () =>
      evaluate<ClickResult>(
        cdp,
        `(() => {
          const button = document.querySelector('[data-table-action="cancel-wait"], [data-table-action="leave"]');
          if (!button) {
            return { ok: false, detail: document.body.innerText };
          }
          button.click();
          return { ok: true, detail: (button.textContent || '').trim() };
        })()`
      ),
    STEP_TIMEOUT_MS
  );

  if (!result.ok) {
    throw new Error(`Could not exit the waiting table: ${result.detail}`);
  }
}

async function clickCreateRoomIfAvailable(cdp: CdpClient): Promise<void> {
  await evaluate(
    cdp,
    `(() => {
      const button = Array.from(document.querySelectorAll("button")).find((candidate) =>
        (candidate.textContent || "").includes("Create room")
      );

      if (button && !button.disabled) {
        button.click();
      }
    })()`
  );
}

async function assertCreateRoomUnavailable(cdp: CdpClient): Promise<void> {
  const state = await evaluate<{ disabled: boolean; found: boolean }>(
    cdp,
    `(() => {
      const button = Array.from(document.querySelectorAll("button")).find((candidate) =>
        (candidate.textContent || "").includes("Create room")
      );

      return { disabled: Boolean(button?.disabled), found: Boolean(button) };
    })()`
  );

  if (state.found && !state.disabled) {
    throw new Error("Create room button remained available after joining a room");
  }
}

async function setPlayerName(cdp: CdpClient, value: string): Promise<void> {
  const result = await evaluate<ClickResult>(
    cdp,
    `(() => {
      const input = document.querySelector(".room-field input");

      if (!input) {
        return { ok: false, detail: document.body.innerText };
      }

      const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
      valueSetter?.call(input, ${JSON.stringify(value)});
      input.dispatchEvent(new Event("input", { bubbles: true }));

      return { ok: true, detail: input.value };
    })()`
  );

  if (!result.ok) {
    throw new Error("Could not set player name before creating room");
  }
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

async function assertHostRoomCount(baseUrl: string, hostName: string, expectedCount: number): Promise<void> {
  const rooms = await fetchRoomList(baseUrl);
  const count = rooms.filter((room) => room.hostName === hostName).length;

  if (count !== expectedCount) {
    throw new Error(`Expected ${expectedCount} rooms for ${hostName}, found ${count}`);
  }
}

async function waitForRoomAbsent(baseUrl: string, roomCode: string): Promise<void> {
  await waitForValue(async () => {
    const rooms = await fetchRoomList(baseUrl);

    return rooms.some((room) => room.code === roomCode) ? null : true;
  }, STEP_TIMEOUT_MS);
}

async function fetchRoomList(baseUrl: string): Promise<Array<{ code: string; hostName: string }>> {
  const response = await fetch(`${baseUrl}/api/rooms?limit=100`, {
    headers: {
      "accept": "application/json"
    }
  });

  if (!response.ok) {
    throw new Error(`GET /api/rooms failed: ${response.status}`);
  }

  const snapshot = (await response.json()) as { rooms?: Array<{ code?: unknown; hostName?: unknown }> };

  return (snapshot.rooms ?? []).flatMap((room) =>
    typeof room.code === "string" && typeof room.hostName === "string"
      ? [{ code: room.code, hostName: room.hostName }]
      : []
  );
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

await main();
