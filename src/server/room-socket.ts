import type { Point } from "../game/types";
import type { RoomAck } from "./room-contract";
import { RoomStore, type RoomError, type RoomResult, type RoomSnapshot } from "./rooms";

export type ClientToServerEvents = {
  "game:move": (
    payload: { expectedMoveSeq: number; point: Point; roomCode: string },
    ack: (response: RoomAck) => void
  ) => void;
  "game:resign": (payload: { roomCode: string }, ack: (response: RoomAck) => void) => void;
  "game:restart": (payload: { roomCode: string }, ack: (response: RoomAck) => void) => void;
  "game:start": (payload: { roomCode: string }, ack: (response: RoomAck) => void) => void;
  "game:undo-request": (payload: { roomCode: string }, ack: (response: RoomAck) => void) => void;
  "game:undo-respond": (
    payload: { accepted: boolean; requestId: string; roomCode: string },
    ack: (response: RoomAck) => void
  ) => void;
  "room:create": (payload: { playerId: string; playerName: string }, ack: (response: RoomAck) => void) => void;
  "room:join": (
    payload: { playerId: string; playerName: string; roomCode: string },
    ack: (response: RoomAck) => void
  ) => void;
  "room:leave": (payload: { roomCode: string }, ack: (response: RoomAck) => void) => void;
  "room:ready": (payload: { ready: boolean; roomCode: string }, ack: (response: RoomAck) => void) => void;
  "room:rejoin": (
    payload: { playerId: string; playerName: string; roomCode: string },
    ack: (response: RoomAck) => void
  ) => void;
};

export type ServerToClientEvents = {
  "room:error": (error: RoomError) => void;
  "room:state": (snapshot: RoomSnapshot) => void;
};

type SocketData = {
  playerId?: string;
  roomCode?: string;
};

export type RoomSocketServer = {
  on: (event: "connection", listener: (socket: RoomSocket) => void) => void;
};

type RoomSocket = {
  data: SocketData;
  emit: <Event extends keyof ServerToClientEvents>(
    event: Event,
    ...args: Parameters<ServerToClientEvents[Event]>
  ) => void;
  join: (roomCode: string) => void;
  leave: (roomCode: string) => void;
  on: <Event extends keyof ClientToServerEvents | "disconnect">(
    event: Event,
    listener: Event extends keyof ClientToServerEvents ? ClientToServerEvents[Event] : () => void
  ) => void;
  to: (roomCode: string) => {
    emit: <Event extends keyof ServerToClientEvents>(
      event: Event,
      ...args: Parameters<ServerToClientEvents[Event]>
    ) => void;
  };
};

export function registerRoomSocketHandlers(io: RoomSocketServer, roomStore = new RoomStore()) {
  io.on("connection", (socket) => {
    socket.on("room:create", (payload, ack) => {
      const response = handleJoinedRoom(socket, roomStore, roomStore.createRoom(payload), payload.playerId);
      acknowledgeAndBroadcast(socket, response, ack);
    });

    socket.on("room:join", (payload, ack) => {
      const response = handleJoinedRoom(
        socket,
        roomStore,
        roomStore.joinRoom(payload.roomCode, payload),
        payload.playerId
      );
      acknowledgeAndBroadcast(socket, response, ack);
    });

    socket.on("room:rejoin", (payload, ack) => {
      const response = handleJoinedRoom(
        socket,
        roomStore,
        roomStore.reconnectRoom(payload.roomCode, payload),
        payload.playerId
      );
      acknowledgeAndBroadcast(socket, response, ack);
    });

    socket.on("room:ready", (payload, ack) => {
      acknowledgeAndBroadcast(
        socket,
        runForCurrentPlayer(socket, roomStore, payload.roomCode, (playerId) =>
          roomStore.setPlayerReady(payload.roomCode, playerId, payload.ready)
        ),
        ack
      );
    });

    socket.on("game:start", (payload, ack) => {
      acknowledgeAndBroadcast(
        socket,
        runForCurrentPlayer(socket, roomStore, payload.roomCode, (playerId) =>
          roomStore.startGame(payload.roomCode, playerId)
        ),
        ack
      );
    });

    socket.on("game:move", (payload, ack) => {
      acknowledgeAndBroadcast(
        socket,
        runForCurrentPlayer(socket, roomStore, payload.roomCode, (playerId) =>
          roomStore.applyMove(payload.roomCode, {
            expectedMoveSeq: payload.expectedMoveSeq,
            playerId,
            point: payload.point
          })
        ),
        ack
      );
    });

    socket.on("game:resign", (payload, ack) => {
      acknowledgeAndBroadcast(
        socket,
        runForCurrentPlayer(socket, roomStore, payload.roomCode, (playerId) =>
          roomStore.resignGame(payload.roomCode, playerId)
        ),
        ack
      );
    });

    socket.on("game:undo-request", (payload, ack) => {
      acknowledgeAndBroadcast(
        socket,
        runForCurrentPlayer(socket, roomStore, payload.roomCode, (playerId) =>
          roomStore.requestUndo(payload.roomCode, playerId)
        ),
        ack
      );
    });

    socket.on("game:undo-respond", (payload, ack) => {
      acknowledgeAndBroadcast(
        socket,
        runForCurrentPlayer(socket, roomStore, payload.roomCode, (playerId) =>
          roomStore.respondToUndo(payload.roomCode, playerId, payload.requestId, payload.accepted)
        ),
        ack
      );
    });

    socket.on("game:restart", (payload, ack) => {
      acknowledgeAndBroadcast(
        socket,
        runForCurrentPlayer(socket, roomStore, payload.roomCode, (playerId) =>
          roomStore.restartGame(payload.roomCode, playerId)
        ),
        ack
      );
    });

    socket.on("room:leave", (payload, ack) => {
      acknowledgeAndBroadcast(
        socket,
        runForCurrentPlayer(socket, roomStore, payload.roomCode, (playerId) =>
          roomStore.markDisconnected(payload.roomCode, playerId)
        ),
        ack
      );
      socket.leave(payload.roomCode.trim().toUpperCase());
      socket.data.roomCode = undefined;
    });

    socket.on("disconnect", () => {
      const { playerId, roomCode } = socket.data;

      if (!playerId || !roomCode) {
        return;
      }

      const result = roomStore.markDisconnected(roomCode, playerId);

      if (result.ok) {
        socket.to(roomCode).emit("room:state", result.value);
      }
    });
  });
}

function handleJoinedRoom(
  socket: RoomSocket,
  roomStore: RoomStore,
  result: RoomResult<RoomSnapshot>,
  playerId: string
): RoomAck {
  if (!result.ok) {
    return result;
  }

  const roomCode = result.value.code;
  const seat = roomStore.getPlayerSeat(roomCode, playerId);

  if (!seat) {
    return { ok: false, error: { code: "not-room-member", message: "Player is not in this room." } };
  }

  socket.data.playerId = playerId;
  socket.data.roomCode = roomCode;
  socket.join(roomCode);

  return {
    ok: true,
    value: {
      playerId,
      seat,
      snapshot: result.value
    }
  };
}

function runForCurrentPlayer(
  socket: RoomSocket,
  roomStore: RoomStore,
  roomCode: string,
  action: (playerId: string) => RoomResult<RoomSnapshot>
): RoomAck {
  const normalizedRoomCode = roomCode.trim().toUpperCase();
  const playerId = socket.data.playerId;

  if (!playerId || socket.data.roomCode !== normalizedRoomCode) {
    return {
      ok: false,
      error: {
        code: "not-room-member",
        message: "This socket has not joined the room."
      }
    };
  }

  const result = action(playerId);

  if (!result.ok) {
    return result;
  }

  const seat = roomStore.getPlayerSeat(result.value.code, playerId);

  if (!seat) {
    return { ok: false, error: { code: "not-room-member", message: "Player is not in this room." } };
  }

  return {
    ok: true,
    value: {
      playerId,
      seat,
      snapshot: result.value
    }
  };
}

function acknowledgeAndBroadcast(socket: RoomSocket, response: RoomAck, ack: (response: RoomAck) => void) {
  ack(response);

  if (!response.ok) {
    socket.emit("room:error", response.error);
    return;
  }

  socket.to(response.value.snapshot.code).emit("room:state", response.value.snapshot);
}
