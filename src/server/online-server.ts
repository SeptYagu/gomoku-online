import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import next from "next";
import { Server } from "socket.io";
import { registerRoomSocketHandlers, type RoomSocketServer } from "./room-socket";
import { roomStore } from "./room-store";
import type { RoomListQuery } from "./rooms";

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
