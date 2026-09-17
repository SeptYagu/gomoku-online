import { spawn, type ChildProcess } from "node:child_process";
import { createServer } from "node:net";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

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

const DEFAULT_BASE_URL = "http://127.0.0.1:3000";
const START_TIMEOUT_MS = 15_000;
const STEP_TIMEOUT_MS = 20_000;

class CdpClient {
  private commandId = 1;
  private readonly pending = new Map<number, PendingCommand>();

  private constructor(private readonly socket: WebSocket) {
    socket.addEventListener("message", (event) => {
      const message = JSON.parse(String(event.data)) as CdpMessage;
      if (!message.id) return;

      const pending = this.pending.get(message.id);
      if (!pending) return;

      this.pending.delete(message.id);
      if (message.error) {
        pending.reject(new Error(message.error.message ?? "CDP command failed"));
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
        reject(new Error("Timed out connecting to Chrome CDP"));
      }, START_TIMEOUT_MS);

      socket.addEventListener("open", () => {
        clearTimeout(timeout);
        resolve(new CdpClient(socket));
      });
      socket.addEventListener("error", () => {
        clearTimeout(timeout);
        reject(new Error("Failed to connect to Chrome CDP"));
      });
    });
  }

  close(): void {
    this.socket.close();
  }

  send(method: string, params?: Record<string, unknown>): Promise<unknown> {
    const id = this.commandId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }
}

async function evaluate<T>(cdp: CdpClient, expression: string): Promise<T> {
  const result = (await cdp.send("Runtime.evaluate", {
    expression,
    returnByValue: true,
    awaitPromise: true
  })) as RuntimeEvaluateResult;

  if (result.exceptionDetails) {
    throw new Error(`Runtime.evaluate failed: ${JSON.stringify(result.exceptionDetails)}`);
  }

  return result.result?.value as T;
}

async function waitForValue<T>(read: () => Promise<T | null>, timeoutMs: number): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = await read();
    if (value !== null) {
      return value;
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error("Timed out waiting for condition");
}

function findChromePath(): string {
  const candidates = [
    process.env.CHROME_PATH,
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe"
  ].filter((c): c is string => Boolean(c));
  return candidates[0] ?? "chrome";
}

function launchChrome(chromePath: string, port: number, userDataDir: string, origin: string): ChildProcess {
  return spawn(
    chromePath,
    [
      "--headless=new",
      "--disable-gpu",
      "--no-first-run",
      "--no-default-browser-check",
      `--unsafely-treat-insecure-origin-as-secure=${origin}`,
      `--remote-debugging-port=${port}`,
      `--user-data-dir=${userDataDir}`,
      "about:blank"
    ],
    { stdio: "ignore", windowsHide: true }
  );
}

function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close();
        reject(new Error("Could not allocate port"));
        return;
      }
      const { port } = address;
      server.close(() => resolve(port));
    });
  });
}

async function waitForChrome(port: number): Promise<void> {
  await waitForValue(async () => {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json/version`);
      return res.ok ? true : null;
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
  const target = (await response.json()) as BrowserTarget;
  if (!target.webSocketDebuggerUrl) {
    throw new Error("Target missing webSocketDebuggerUrl");
  }
  return target.webSocketDebuggerUrl;
}

async function main(): Promise<void> {
  const baseUrl = process.argv[2] ?? DEFAULT_BASE_URL;
  const baseOrigin = new URL(baseUrl).origin;
  const chromePath = findChromePath();
  const port = await getFreePort();
  const userDataDir = await mkdtemp(path.join(tmpdir(), "gomoku-persistence-smoke-"));
  const chrome = launchChrome(chromePath, port, userDataDir, baseOrigin);

  console.log(`[smoke:persistence] Chrome launched on debug port ${port}`);

  try {
    await waitForChrome(port);
    const targetUrl = await openBrowserTarget(port, `${baseUrl}/en`);
    const cdp = await CdpClient.connect(targetUrl);

    try {
      await cdp.send("Page.enable");
      await cdp.send("Runtime.enable");

      // 等待初始页面水合就绪
      await waitForValue(async () => {
        const ready = await evaluate<boolean>(
          cdp,
          `document.readyState === "complete" && Boolean(document.querySelector(".board-point"))`
        );
        return ready ? true : null;
      }, STEP_TIMEOUT_MS);

      console.log("[smoke:persistence] Page initialized, running Scenario S-A (Local game reload restore)...");

      // ─── Scenario S-A: Local 3-move game F5 reload ───
      const local3Moves = [
        { row: 7, col: 7, stone: "black", moveNumber: 1 },
        { row: 7, col: 8, stone: "white", moveNumber: 2 },
        { row: 8, col: 7, stone: "black", moveNumber: 3 }
      ];
      await evaluate(
        cdp,
        `(() => {
          sessionStorage.setItem("gomoku-active-game", JSON.stringify({
            mode: "local",
            moves: ${JSON.stringify(local3Moves)},
            updatedAt: Date.now()
          }));
          sessionStorage.setItem("gomoku-selected-workspace", "local");
        })()`
      );

      // 执行硬刷新 (F5)
      await cdp.send("Page.reload");

      // 验证水合完成后棋子恢复为 3 颗
      const stonesCountAfterReload = await waitForValue(async () => {
        const count = await evaluate<number>(
          cdp,
          `document.querySelectorAll(".board-point .stone").length`
        );
        return count >= 3 ? count : null;
      }, STEP_TIMEOUT_MS);

      if (stonesCountAfterReload !== 3) {
        throw new Error(`Scenario S-A failed: expected 3 stones, got ${stonesCountAfterReload}`);
      }
      console.log("  ✓ S-A passed: Local 3-move game restored on F5 reload (3 stones rendered)");

      // ─── Scenario S-E: Soft navigation locale switch retaining moves ───
      console.log("[smoke:persistence] Running Scenario S-E (Locale switch soft navigation)...");
      await evaluate(
        cdp,
        `(() => {
          const frenchLink = Array.from(document.querySelectorAll("a")).find(a => (a.getAttribute("href") || "").includes("/fr"));
          frenchLink?.click();
        })()`
      );

      await waitForValue(async () => {
        const href = await evaluate<string>(cdp, "window.location.href");
        return href.includes("/fr") ? true : null;
      }, STEP_TIMEOUT_MS);

      const stonesOnFr = await evaluate<number>(
        cdp,
        `document.querySelectorAll(".board-point .stone").length`
      );
      if (stonesOnFr !== 3) {
        throw new Error(`Scenario S-E failed: expected 3 stones on /fr, got ${stonesOnFr}`);
      }
      console.log("  ✓ S-E passed: Soft navigation to /fr retained all 3 stones");

      // ─── Scenario S-B: AI game reload with AI to move ───
      console.log("[smoke:persistence] Running Scenario S-B (AI game reload with AI to move)...");
      const ai1Move = [
        { row: 7, col: 7, stone: "black", moveNumber: 1 }
      ];
      await evaluate(
        cdp,
        `(() => {
          sessionStorage.setItem("gomoku-active-game", JSON.stringify({
            mode: "ai",
            moves: ${JSON.stringify(ai1Move)},
            aiDifficulty: "normal",
            firstPlayer: "human",
            openingSeed: 42,
            updatedAt: Date.now()
          }));
          sessionStorage.setItem("gomoku-selected-workspace", "ai");
        })()`
      );

      // 硬刷新
      await cdp.send("Page.reload");

      // 验证恢复并由 AI 走子（棋子数自 1 增至 2）
      const aiStones = await waitForValue(async () => {
        const count = await evaluate<number>(
          cdp,
          `document.querySelectorAll(".board-point .stone").length`
        );
        return count >= 2 ? count : null;
      }, STEP_TIMEOUT_MS);

      if (aiStones < 2) {
        throw new Error(`Scenario S-B failed: AI did not auto-move, stones count: ${aiStones}`);
      }
      console.log(`  ✓ S-B passed: AI game restored and AI auto-moved (stones: ${aiStones})`);

      // ─── Scenario S-C: Stored AI game + ?room= URL isolation ───
      console.log("[smoke:persistence] Running Scenario S-C (?room= URL isolation from stored AI game)...");
      await evaluate(
        cdp,
        `(() => {
          sessionStorage.setItem("gomoku-active-game", JSON.stringify({
            mode: "ai",
            moves: [{ row: 7, col: 7, stone: "black", moveNumber: 1 }],
            aiDifficulty: "hard",
            firstPlayer: "human",
            openingSeed: 999,
            updatedAt: Date.now()
          }));
          window.location.href = "/en?room=TESTISOLATE";
        })()`
      );

      // 等待导航完成且进入联机房间模式
      await waitForValue(async () => {
        const href = await evaluate<string>(cdp, "window.location.href");
        return href.includes("room=TESTISOLATE") ? true : null;
      }, STEP_TIMEOUT_MS);

      // 验证模式按钮未被幽灵思考禁用
      const modeButtonsUnlocked = await waitForValue(async () => {
        const buttons = await evaluate<{ mode: string; disabled: boolean }[]>(
          cdp,
          `Array.from(document.querySelectorAll(".mode-pill, [data-game-mode]")).map(b => ({
            mode: b.getAttribute("data-game-mode") || "",
            disabled: Boolean(b.disabled) || b.classList.contains("cursor-not-allowed")
          }))`
        );
        const aiButton = buttons.find(b => b.mode === "ai");
        return aiButton && !aiButton.disabled ? true : null;
      }, STEP_TIMEOUT_MS);

      if (!modeButtonsUnlocked) {
        throw new Error("Scenario S-C failed: mode buttons remained locked/disabled in room mode");
      }

      // 验证存储中的活跃人机对局未被覆盖
      const storedGame = await evaluate<string | null>(
        cdp,
        `sessionStorage.getItem("gomoku-active-game")`
      );
      if (!storedGame || !storedGame.includes('"mode":"ai"')) {
        throw new Error("Scenario S-C failed: stored AI game was mutated or deleted");
      }
      console.log("  ✓ S-C passed: ?room= URL cleanly isolated from stored AI game (buttons unlocked, storage intact)");

      console.log("\n[smoke:persistence] ALL 4 SCENARIOS (S-A, S-E, S-B, S-C) PASSED SUCCESSFULLY!");
    } finally {
      cdp.close();
    }
  } finally {
    chrome.kill();
    await rm(userDataDir, { recursive: true, force: true }).catch(() => undefined);
  }
}

await main();
