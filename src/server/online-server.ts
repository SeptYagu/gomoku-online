import { createServer } from "node:http";
import next from "next";
import { Server } from "socket.io";
import { registerRoomSocketHandlers, type RoomSocketServer } from "./room-socket";

const dev = process.env.NODE_ENV !== "production";
const hostname = process.env.HOSTNAME ?? "0.0.0.0";
const port = Number.parseInt(process.env.PORT ?? "3000", 10);
const app = next({ dev, hostname, port });
const handler = app.getRequestHandler();

await app.prepare();

const httpServer = createServer((request, response) => {
  handler(request, response);
});
const io = new Server(httpServer, {
  path: "/socket.io"
});

registerRoomSocketHandlers(io as RoomSocketServer);

httpServer.listen(port, hostname, () => {
  console.log(`Gomoku Online listening at http://${hostname}:${port}`);
});
