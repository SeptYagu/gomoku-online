import { io } from "socket.io-client";

type CliOptions = {
  baseUrl: string;
  expectedVersion?: string;
};

type CheckResult = {
  detail: string;
  name: string;
  ok: boolean;
};

const DEFAULT_BASE_URL = "http://gomoku.yagu.ddns-ip.net";
const REQUEST_TIMEOUT_MS = 10_000;

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const baseUrl = normalizeBaseUrl(options.baseUrl);
  const results: CheckResult[] = [];

  results.push(await checkPage(baseUrl));
  results.push(await checkVersion(baseUrl, options.expectedVersion));
  results.push(await checkPollingHandshake(baseUrl));
  results.push(await checkWebSocketTransport(baseUrl));

  console.log(`Online verification: ${baseUrl}`);

  for (const result of results) {
    console.log(`${result.ok ? "PASS" : "FAIL"} ${result.name} - ${result.detail}`);
  }

  if (results.some((result) => !result.ok)) {
    process.exitCode = 1;
  }
}

function parseArgs(args: string[]): CliOptions {
  let baseUrl = DEFAULT_BASE_URL;
  let expectedVersion: string | undefined;
  const positionals: string[] = [];

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === "--expect-version" || arg === "--version") {
      expectedVersion = args[index + 1];
      index += 1;
      continue;
    }

    if (arg.startsWith("--expect-version=")) {
      expectedVersion = arg.slice("--expect-version=".length);
      continue;
    }

    if (arg.startsWith("--version=")) {
      expectedVersion = arg.slice("--version=".length);
      continue;
    }

    positionals.push(arg);
  }

  if (positionals[0]) {
    baseUrl = positionals[0];
  }

  if (positionals[1] && !expectedVersion) {
    expectedVersion = positionals[1];
  }

  return { baseUrl, expectedVersion };
}

function normalizeBaseUrl(input: string): string {
  const withProtocol = input.includes("://") ? input : `http://${input}`;
  const url = new URL(withProtocol);
  const path = /^\/(?:en|zh|fr|es|ru|ar)?\/?$/.test(url.pathname)
    ? ""
    : url.pathname.replace(/\/+$/, "");

  return `${url.origin}${path}`;
}

async function checkVersion(baseUrl: string, expectedVersion?: string): Promise<CheckResult> {
  try {
    const versionResponse = await fetchText(new URL("/api/version", `${baseUrl}/`).toString());
    const apiVersion =
      versionResponse.status >= 200 && versionResponse.status < 300
        ? parseVersionResponse(versionResponse.text)
        : null;
    const version = apiVersion ?? (await fetchPageVersion(baseUrl));

    if (!version) {
      return {
        detail:
          versionResponse.status === 404
            ? "no /api/version endpoint and no version footer was found in HTML"
            : "no version was found in /api/version or page HTML",
        name: "version",
        ok: false
      };
    }

    if (expectedVersion && version !== expectedVersion) {
      return {
        detail: `found version ${version}, expected ${expectedVersion}`,
        name: "version",
        ok: false
      };
    }

    return {
      detail: expectedVersion ? `version ${version}` : `found version ${version}`,
      name: "version",
      ok: true
    };
  } catch (error) {
    return {
      detail: errorMessage(error),
      name: "version",
      ok: false
    };
  }
}

async function fetchPageVersion(baseUrl: string): Promise<string | null> {
  const response = await fetchText(new URL("/en", `${baseUrl}/`).toString());

  if (response.status < 200 || response.status >= 300) {
    throw new Error(`page returned HTTP ${response.status}`);
  }

  return extractVersion(response.text);
}

async function checkPage(baseUrl: string): Promise<CheckResult> {
  try {
    const response = await fetchText(new URL("/en", `${baseUrl}/`).toString());

    if (response.status < 200 || response.status >= 300) {
      return {
        detail: `HTTP ${response.status}`,
        name: "page",
        ok: false
      };
    }

    return {
      detail: "loaded",
      name: "page",
      ok: true
    };
  } catch (error) {
    return {
      detail: errorMessage(error),
      name: "page",
      ok: false
    };
  }
}

async function checkPollingHandshake(baseUrl: string): Promise<CheckResult> {
  try {
    const url = new URL("/socket.io/", `${baseUrl}/`);
    url.searchParams.set("EIO", "4");
    url.searchParams.set("transport", "polling");
    url.searchParams.set("t", Date.now().toString());

    const response = await fetchText(url.toString());

    if (response.status < 200 || response.status >= 300) {
      return {
        detail: `HTTP ${response.status}`,
        name: "socket.io polling",
        ok: false
      };
    }

    if (!/"sid"\s*:/.test(response.text)) {
      return {
        detail: "handshake returned 200 but no sid was found",
        name: "socket.io polling",
        ok: false
      };
    }

    return {
      detail: "handshake returned sid",
      name: "socket.io polling",
      ok: true
    };
  } catch (error) {
    return {
      detail: errorMessage(error),
      name: "socket.io polling",
      ok: false
    };
  }
}

async function checkWebSocketTransport(baseUrl: string): Promise<CheckResult> {
  try {
    const transport = await connectWithWebSocket(baseUrl);

    return {
      detail: `connected with ${transport}`,
      name: "socket.io websocket",
      ok: transport === "websocket"
    };
  } catch (error) {
    return {
      detail: errorMessage(error),
      name: "socket.io websocket",
      ok: false
    };
  }
}

function connectWithWebSocket(baseUrl: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const socket = io(baseUrl, {
      forceNew: true,
      path: "/socket.io",
      reconnection: false,
      timeout: REQUEST_TIMEOUT_MS,
      transports: ["websocket"]
    });
    let settled = false;
    const timeout = setTimeout(() => finish(new Error("websocket connect timed out")), REQUEST_TIMEOUT_MS);

    function finish(result: Error | string): void {
      if (settled) {
        return;
      }

      settled = true;
      clearTimeout(timeout);
      socket.disconnect();

      if (result instanceof Error) {
        reject(result);
        return;
      }

      resolve(result);
    }

    socket.once("connect", () => {
      finish(socket.io.engine.transport.name);
    });
    socket.once("connect_error", (error: Error) => {
      finish(error);
    });
  });
}

async function fetchText(url: string): Promise<{ status: number; text: string }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, { signal: controller.signal });
    const text = await response.text();

    return {
      status: response.status,
      text
    };
  } finally {
    clearTimeout(timeout);
  }
}

function extractVersion(html: string): string | null {
  const match = html.match(/version:\s*([A-Za-z0-9._-]+)/);

  return match?.[1] ?? null;
}

function parseVersionResponse(text: string): string | null {
  try {
    const parsed = JSON.parse(text) as { version?: unknown };

    return typeof parsed.version === "string" && parsed.version.length > 0 ? parsed.version : null;
  } catch {
    return null;
  }
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

await main();
