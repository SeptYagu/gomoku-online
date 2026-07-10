import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import next from "next";
import { Server } from "socket.io";
import type { AccountSession } from "./accounts";
import type { LeaderboardQuery } from "./game-records";
import { registerRoomSocketHandlers, type RoomSocketServer } from "./room-socket";
import { accountStore, guestSessionStore, roomStore } from "./room-store";
import type { PresenceListQuery, RoomListQuery } from "./rooms";
import { FixedWindowRateLimiter } from "./rate-limit";

const dev = process.argv.includes("--dev") || process.env.NODE_ENV === "development";
const hostname = process.env.HOSTNAME ?? "0.0.0.0";
const port = Number.parseInt(process.env.PORT ?? "3000", 10);
const app = next({ dev, hostname, port });
const handler = app.getRequestHandler();
const accountRegistrationLimiter = new FixedWindowRateLimiter({
  limit: 5,
  windowMs: 10 * 60 * 1000
});

await app.prepare();

const httpServer = createServer((request, response) => {
  if (handleAccountApi(request, response)) {
    return;
  }

  if (handleRoomsApi(request, response)) {
    return;
  }

  if (handleProfileApi(request, response)) {
    return;
  }

  if (handlePresenceApi(request, response)) {
    return;
  }

  if (handleLeaderboardApi(request, response)) {
    return;
  }

  handler(request, response);
});
const io = new Server(httpServer, {
  path: "/socket.io"
});

registerRoomSocketHandlers(io as RoomSocketServer, roomStore, { accountStore, guestSessionStore });

httpServer.listen(port, hostname, () => {
  console.log(`Gomoku Online listening at http://${hostname}:${port} (${dev ? "development" : "production"})`);
});

function handleAccountApi(request: IncomingMessage, response: ServerResponse): boolean {
  const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);

  if (url.pathname !== "/api/account/register" && url.pathname !== "/api/account/session") {
    return false;
  }

  void processAccountApiRequest(request, response, url).catch(() => {
    writeJson(response, 500, { error: "Account request failed" });
  });

  return true;
}

async function processAccountApiRequest(request: IncomingMessage, response: ServerResponse, url: URL): Promise<void> {
  if (url.pathname === "/api/account/register") {
    if (request.method !== "POST") {
      writeJson(response, 405, { error: "Method not allowed" }, { allow: "POST" });
      return;
    }

    const rateLimit = accountRegistrationLimiter.consume(getRequestClientKey(request));

    if (!rateLimit.allowed) {
      writeJson(
        response,
        429,
        { error: "Too many account registrations. Try again later." },
        { "retry-after": String(Math.max(1, Math.ceil(rateLimit.retryAfterMs / 1000))) }
      );
      return;
    }

    const body = await readJsonBody<{ displayName?: string; publicHandle?: string }>(request);
    const result = accountStore.createAccount({
      displayName: body?.displayName ?? "",
      publicHandle: body?.publicHandle
    });

    if (!result.ok) {
      writeJson(
        response,
        result.error.code === "duplicate-name" || result.error.code === "duplicate-handle" ? 409 : 400,
        { error: result.error.message }
      );
      return;
    }

    writeAccountSession(response, result.value);
    return;
  }

  if (request.method !== "GET") {
    writeJson(response, 405, { error: "Method not allowed" }, { allow: "GET" });
    return;
  }

  const token = getBearerToken(request);
  const account = token ? accountStore.authenticate(token) : null;

  if (!account || !token) {
    writeJson(response, 401, { error: "Account session is invalid" });
    return;
  }

  writeAccountSession(response, { ...account, token });
}

function writeAccountSession(response: ServerResponse, session: AccountSession): void {
  writeJson(response, 200, session);
}

function handleRoomsApi(request: IncomingMessage, response: ServerResponse): boolean {
  const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);

  if (url.pathname !== "/api/rooms") {
    return false;
  }

  if (request.method !== "GET") {
    writeJson(response, 405, { error: "Method not allowed" }, { allow: "GET" });
    return true;
  }

  writeJson(response, 200, roomStore.listRooms(parseRoomListQuery(url)));

  return true;
}

function handlePresenceApi(request: IncomingMessage, response: ServerResponse): boolean {
  const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);

  if (url.pathname !== "/api/presence") {
    return false;
  }

  if (request.method !== "GET") {
    writeJson(response, 405, { error: "Method not allowed" }, { allow: "GET" });
    return true;
  }

  writeJson(response, 200, roomStore.listPresence(parsePresenceListQuery(url)));

  return true;
}

function handleLeaderboardApi(request: IncomingMessage, response: ServerResponse): boolean {
  const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);

  if (url.pathname !== "/api/leaderboard") {
    return false;
  }

  if (request.method !== "GET") {
    writeJson(response, 405, { error: "Method not allowed" }, { allow: "GET" });
    return true;
  }

  writeJson(response, 200, roomStore.getLeaderboard(parseLeaderboardQuery(url)));

  return true;
}

function handleProfileApi(request: IncomingMessage, response: ServerResponse): boolean {
  const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);

  if (url.pathname !== "/api/profile" && url.pathname !== "/api/game-records") {
    return false;
  }

  if (request.method !== "GET") {
    writeJson(response, 405, { error: "Method not allowed" }, { allow: "GET" });
    return true;
  }

  const playerId = url.searchParams.get("playerId")?.trim() ?? "";

  if (!playerId) {
    writeJson(response, 400, { error: "playerId is required" });
    return true;
  }

  const rawLimit = Number.parseInt(url.searchParams.get("limit") ?? "", 10);
  const playerName = url.searchParams.get("name") ?? undefined;
  const token = getBearerToken(request);
  const account = token ? accountStore.authenticate(token) : null;
  const identity = account?.playerId === playerId ? account.identity : undefined;

  writeJson(
    response,
    200,
    roomStore.getPlayerProfile(playerId, playerName, Number.isFinite(rawLimit) ? rawLimit : undefined, identity)
  );

  return true;
}

function getBearerToken(request: IncomingMessage): string {
  const authorization = request.headers.authorization ?? "";
  const match = /^Bearer\s+(.+)$/i.exec(Array.isArray(authorization) ? authorization[0] : authorization);

  return match?.[1]?.trim() ?? "";
}

function getRequestClientKey(request: IncomingMessage): string {
  const remoteAddress = request.socket.remoteAddress ?? "unknown";

  if (remoteAddress === "127.0.0.1" || remoteAddress === "::1" || remoteAddress === "::ffff:127.0.0.1") {
    const forwardedFor = request.headers["x-forwarded-for"];
    const forwardedValue = Array.isArray(forwardedFor) ? forwardedFor[0] : forwardedFor;
    const forwardedClient = forwardedValue?.split(",").at(-1)?.trim();

    if (forwardedClient) {
      return forwardedClient;
    }
  }

  return remoteAddress;
}

function readJsonBody<T>(request: IncomingMessage): Promise<T | null> {
  return new Promise((resolve, reject) => {
    let body = "";

    request.setEncoding("utf8");
    request.on("data", (chunk: string) => {
      body += chunk;

      if (body.length > 4096) {
        request.destroy(new Error("Request body too large"));
      }
    });
    request.on("end", () => {
      if (!body.trim()) {
        resolve(null);
        return;
      }

      try {
        resolve(JSON.parse(body) as T);
      } catch {
        resolve(null);
      }
    });
    request.on("error", reject);
  });
}

function writeJson(
  response: ServerResponse,
  statusCode: number,
  body: unknown,
  headers: Record<string, string> = {}
): void {
  response.writeHead(statusCode, {
    ...headers,
    "cache-control": "no-store",
    "content-type": "application/json; charset=utf-8"
  });
  response.end(JSON.stringify(body));
}

function parseLeaderboardQuery(url: URL): LeaderboardQuery {
  const rawLimit = Number.parseInt(url.searchParams.get("limit") ?? "", 10);
  const rawOffset = Number.parseInt(url.searchParams.get("offset") ?? "", 10);
  const identity = url.searchParams.get("identity");
  const search = url.searchParams.get("search")?.trim() ?? "";
  const scope = url.searchParams.get("scope");

  return {
    identity: identity === "registered" || identity === "guest" || identity === "all" ? identity : undefined,
    limit: Number.isFinite(rawLimit) ? rawLimit : undefined,
    offset: Number.isFinite(rawOffset) ? rawOffset : undefined,
    search: search || undefined,
    scope: scope === "overall" || scope === "daily" || scope === "streak" ? scope : undefined
  };
}

function parsePresenceListQuery(url: URL): PresenceListQuery {
  const rawLimit = Number.parseInt(url.searchParams.get("limit") ?? "", 10);
  const includeOffline = url.searchParams.get("includeOffline");

  return {
    includeOffline: includeOffline === "1" || includeOffline === "true",
    limit: Number.isFinite(rawLimit) ? rawLimit : undefined
  };
}

function parseRoomListQuery(url: URL): RoomListQuery {
  const rawLimit = Number.parseInt(url.searchParams.get("limit") ?? "", 10);
  const status = url.searchParams.get("status");

  return {
    limit: Number.isFinite(rawLimit) ? rawLimit : undefined,
    status:
      status === "waiting" || status === "playing" || status === "finished" || status === "all"
        ? status
        : undefined
  };
}
