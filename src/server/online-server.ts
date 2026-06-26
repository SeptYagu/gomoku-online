import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import next from "next";
import { Server } from "socket.io";
import { registerRoomSocketHandlers, type RoomSocketServer } from "./room-socket";
import { roomStore } from "./room-store";
import type { PresenceListQuery, RoomListQuery } from "./rooms";

const dev = process.argv.includes("--dev") || process.env.NODE_ENV === "development";
const hostname = process.env.HOSTNAME ?? "0.0.0.0";
const port = Number.parseInt(process.env.PORT ?? "3000", 10);
const app = next({ dev, hostname, port });
const handler = app.getRequestHandler();

await app.prepare();

const httpServer = createServer((request, response) => {
  if (handleRoomsApi(request, response)) {
    return;
  }

  if (handleProfileApi(request, response)) {
    return;
  }

  if (handlePresenceApi(request, response)) {
    return;
  }

  handler(request, response);
});
const io = new Server(httpServer, {
  path: "/socket.io"
});

registerRoomSocketHandlers(io as RoomSocketServer, roomStore);

httpServer.listen(port, hostname, () => {
  console.log(`Gomoku Online listening at http://${hostname}:${port} (${dev ? "development" : "production"})`);
});

function handleRoomsApi(request: IncomingMessage, response: ServerResponse): boolean {
  const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);

  if (url.pathname !== "/api/rooms") {
    return false;
  }

  if (request.method !== "GET") {
    response.writeHead(405, {
      "allow": "GET",
      "content-type": "application/json; charset=utf-8"
    });
    response.end(JSON.stringify({ error: "Method not allowed" }));
    return true;
  }

  response.writeHead(200, {
    "cache-control": "no-store",
    "content-type": "application/json; charset=utf-8"
  });
  response.end(JSON.stringify(roomStore.listRooms(parseRoomListQuery(url))));

  return true;
}

function handlePresenceApi(request: IncomingMessage, response: ServerResponse): boolean {
  const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);

  if (url.pathname !== "/api/presence") {
    return false;
  }

  if (request.method !== "GET") {
    response.writeHead(405, {
      "allow": "GET",
      "content-type": "application/json; charset=utf-8"
    });
    response.end(JSON.stringify({ error: "Method not allowed" }));
    return true;
  }

  response.writeHead(200, {
    "cache-control": "no-store",
    "content-type": "application/json; charset=utf-8"
  });
  response.end(JSON.stringify(roomStore.listPresence(parsePresenceListQuery(url))));

  return true;
}

function handleProfileApi(request: IncomingMessage, response: ServerResponse): boolean {
  const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);

  if (url.pathname !== "/api/profile" && url.pathname !== "/api/game-records") {
    return false;
  }

  if (request.method !== "GET") {
    response.writeHead(405, {
      "allow": "GET",
      "content-type": "application/json; charset=utf-8"
    });
    response.end(JSON.stringify({ error: "Method not allowed" }));
    return true;
  }

  const playerId = url.searchParams.get("playerId")?.trim() ?? "";

  if (!playerId) {
    response.writeHead(400, {
      "cache-control": "no-store",
      "content-type": "application/json; charset=utf-8"
    });
    response.end(JSON.stringify({ error: "playerId is required" }));
    return true;
  }

  const rawLimit = Number.parseInt(url.searchParams.get("limit") ?? "", 10);
  const playerName = url.searchParams.get("name") ?? undefined;

  response.writeHead(200, {
    "cache-control": "no-store",
    "content-type": "application/json; charset=utf-8"
  });
  response.end(
    JSON.stringify(
      roomStore.getPlayerProfile(playerId, playerName, Number.isFinite(rawLimit) ? rawLimit : undefined)
    )
  );

  return true;
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
